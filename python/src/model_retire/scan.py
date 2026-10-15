"""Scanning files for deprecated or retired model IDs."""

from __future__ import annotations

import os
from typing import Any, Dict, List, NamedTuple, Optional, Sequence

from .data import Dataset, Entry, default_dataset
from .dates import days_between, is_valid_date, today_utc
from .errors import UsageError
from .match import create_matcher
from .walk import walk_files

#: Default number of days before a shutdown date at which a model becomes an error.
DEFAULT_WARN_DAYS = 90
#: Files larger than this many bytes are skipped.
DEFAULT_MAX_BYTES = 1024 * 1024
_SNIFF_BYTES = 8000

Finding = Dict[str, Any]
ScanResult = Dict[str, Any]


class Assessment(NamedTuple):
    status: str
    severity: str
    days_remaining: Optional[int]


def assess(entry: Entry, today: str, warn_days: int, warn_only: bool) -> Assessment:
    """Retired (status ``retired`` or shutdown date reached) is an error; a shutdown within
    ``warn_days`` is an error unless ``warn_only``; anything later, or a deprecation without a
    date, is a warning."""
    ret = entry.get("retires_on")
    days = days_between(today, ret) if ret is not None else None
    if entry.get("status") == "retired" or (days is not None and days <= 0):
        return Assessment("retired", "error", days)
    if days is not None and days <= warn_days and not warn_only:
        return Assessment("deprecated", "error", days)
    return Assessment("deprecated", "warning", days)


def decode_text(data: bytes) -> Optional[str]:
    """UTF-8 with invalid bytes as U+FFFD and a leading BOM dropped; None for binary data."""
    if b"\x00" in data[:_SNIFF_BYTES]:
        return None
    return data.decode("utf-8-sig", errors="replace")


def _sort_key(f: Finding):
    return (f["file"], f["line"], f["column"], f["provider"], f["id"])


def scan(
    paths: Optional[Sequence[str]] = None,
    cwd: Optional[str] = None,
    today: Optional[str] = None,
    warn_days: int = DEFAULT_WARN_DAYS,
    warn_only: bool = False,
    ignore: Sequence[str] = (),
    include: Sequence[str] = (),
    gitignore: bool = True,
    include_lockfiles: bool = False,
    dataset: Optional[Dataset] = None,
    max_bytes: int = DEFAULT_MAX_BYTES,
) -> ScanResult:
    """Scans files and directories. Raises :class:`UsageError` for an invalid date or a path
    that does not exist. Returns the same structure as the Node package's ``scan``."""
    base = os.path.abspath(cwd if cwd is not None else os.getcwd())
    if today is None:
        today = today_utc()
    if not is_valid_date(today):
        raise UsageError('invalid --today "%s": expected YYYY-MM-DD' % today)
    if isinstance(warn_days, bool) or not isinstance(warn_days, int) or warn_days < 0:
        raise UsageError('invalid --warn-days "%s": expected a whole number of days' % warn_days)
    data = dataset if dataset is not None else default_dataset()
    matcher = create_matcher(data["models"])

    files: List[str] = []
    seen = set()
    for p in list(paths) if paths else ["."]:
        abs_path = os.path.normpath(os.path.join(base, p))
        if not os.path.exists(abs_path):
            raise UsageError("path not found: %s" % p)
        if os.path.isdir(abs_path):
            found = walk_files(abs_path, ignore, include, gitignore, include_lockfiles)
        else:
            found = [abs_path]
        for f in found:
            if f not in seen:
                seen.add(f)
                files.append(f)

    findings: List[Finding] = []
    files_scanned = 0
    for abs_path in files:
        try:
            if os.lstat(abs_path).st_size > max_bytes:
                continue
            with open(abs_path, "rb") as fh:
                raw = fh.read()
        except OSError:
            continue
        text = decode_text(raw)
        if text is None:
            continue
        files_scanned += 1
        rel = os.path.relpath(abs_path, base).replace(os.sep, "/")
        for idx, line in enumerate(text.split("\n")):
            if line.endswith("\r"):
                line = line[:-1]
            for hit in matcher.find_in_line(line):
                for entry in matcher.entries_for(hit.match):
                    a = assess(entry, today, warn_days, warn_only)
                    findings.append(
                        {
                            "file": rel,
                            "line": idx + 1,
                            "column": hit.column,
                            "match": hit.match,
                            "provider": entry["provider"],
                            "id": entry["id"],
                            "status": a.status,
                            "severity": a.severity,
                            "deprecated_on": entry.get("deprecated_on"),
                            "retires_on": entry.get("retires_on"),
                            "days_remaining": a.days_remaining,
                            "replacement": entry.get("replacement"),
                            "note": entry.get("note"),
                            "source": entry.get("source"),
                        }
                    )

    findings.sort(key=_sort_key)
    errors = sum(1 for f in findings if f["severity"] == "error")
    return {
        "version": 1,
        "today": today,
        "warn_days": warn_days,
        "warn_only": warn_only,
        "files_scanned": files_scanned,
        "summary": {"errors": errors, "warnings": len(findings) - errors},
        "findings": findings,
    }

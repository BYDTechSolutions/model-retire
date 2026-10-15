"""Output formats. Each produces exactly the same text as the Node package."""

from __future__ import annotations

import json
from typing import Any, Dict, List

from .data import Dataset
from .scan import ScanResult, assess


def _plural(n: int, word: str) -> str:
    return "%d %s%s" % (n, word, "" if n == 1 else "s")


def describe_timing(f: Dict[str, Any]) -> str:
    """Plain-language description of where a model is in its lifecycle."""
    d = f["days_remaining"]
    ret = f["retires_on"]
    if f["status"] == "retired":
        if ret is None or d is None:
            return "retired"
        if d == 0:
            return "retired %s (today)" % ret
        if d > 0:
            return "retired (scheduled shutdown %s)" % ret
        return "retired %s (%s ago)" % (ret, _plural(-d, "day"))
    if ret is None or d is None:
        return "deprecated, no shutdown date announced"
    return "retires %s (in %s)" % (ret, _plural(d, "day"))


def _headline(f: Dict[str, Any]) -> str:
    alias = "" if f["match"] == f["id"] else ' (as "%s")' % f["match"]
    return "%s %s%s: %s" % (f["provider"], f["id"], alias, describe_timing(f))


def format_text(result: ScanResult) -> str:
    """Human-readable report grouped by file."""
    lines: List[str] = []
    current = None
    files = set()
    for f in result["findings"]:
        if f["file"] != current:
            if current is not None:
                lines.append("")
            lines.append(f["file"])
            current = f["file"]
            files.add(f["file"])
        pos = "%d:%d" % (f["line"], f["column"])
        sev = "error  " if f["severity"] == "error" else "warning"
        lead = "  %s%s  " % (pos.ljust(8), sev)
        pad = " " * len(lead)
        lines.append(lead + _headline(f))
        if f["replacement"] is not None:
            lines.append("%sreplacement: %s" % (pad, f["replacement"]))
        if f["note"] is not None:
            lines.append("%snote: %s" % (pad, f["note"]))
        if f["source"] is not None:
            lines.append("%ssource: %s" % (pad, f["source"]))
    scanned = "Scanned %s." % _plural(result["files_scanned"], "file")
    if not result["findings"]:
        lines.append("No deprecated or retired model IDs found. " + scanned)
    else:
        s = result["summary"]
        lines.append("")
        lines.append(
            "%s (%s, %s) in %s. %s"
            % (
                _plural(len(result["findings"]), "problem"),
                _plural(s["errors"], "error"),
                _plural(s["warnings"], "warning"),
                _plural(len(files), "file"),
                scanned,
            )
        )
    return "\n".join(lines) + "\n"


def format_json(result: Any) -> str:
    """Pretty-printed JSON, byte-identical to the Node package's ``JSON.stringify(x, null, 2)``."""
    return json.dumps(result, indent=2, ensure_ascii=False) + "\n"


def _escape_data(s: str) -> str:
    return s.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")


def _escape_property(s: str) -> str:
    return _escape_data(s).replace(":", "%3A").replace(",", "%2C")


def format_github(result: ScanResult) -> str:
    """GitHub Actions workflow commands: one ``::error`` or ``::warning`` per finding."""
    lines: List[str] = []
    for f in result["findings"]:
        kind = "Retired" if f["status"] == "retired" else "Deprecated"
        title = "%s model ID %s" % (kind, f["id"])
        message = _headline(f) + "."
        if f["replacement"] is not None:
            message += " Replacement: %s." % f["replacement"]
        if f["source"] is not None:
            message += " Source: %s" % f["source"]
        props = "file=%s,line=%d,col=%d,title=%s" % (
            _escape_property(f["file"]),
            f["line"],
            f["column"],
            _escape_property(title),
        )
        lines.append("::%s %s::%s" % (f["severity"], props, _escape_data(message)))
    s = result["summary"]
    lines.append(
        "model-retire: %s, %s. Scanned %s."
        % (_plural(s["errors"], "error"), _plural(s["warnings"], "warning"), _plural(result["files_scanned"], "file"))
    )
    return "\n".join(lines) + "\n"


def format_list(dataset: Dataset, today: str) -> str:
    """The dataset as an aligned table, with each model's status on ``today``."""
    rows = [["PROVIDER", "ID", "STATUS", "RETIRES", "REPLACEMENT"]]
    for e in dataset["models"]:
        a = assess(e, today, 0, True)
        rows.append([e["provider"], e["id"], a.status, e.get("retires_on") or "-", e.get("replacement") or "-"])
    widths = [max(len(r[i]) for r in rows) for i in range(4)]
    out = ["  ".join(c.ljust(widths[i]) if i < 4 else c for i, c in enumerate(r)).rstrip() for r in rows]
    updated = " Data checked %s." % dataset["updated"] if dataset.get("updated") else ""
    out.append("")
    out.append("%s.%s" % (_plural(len(dataset["models"]), "model"), updated))
    return "\n".join(out) + "\n"

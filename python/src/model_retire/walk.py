"""Walking a directory tree the same way as the Node package (``src/walk.ts``)."""

from __future__ import annotations

import os
from typing import List, Sequence

from .glob import GlobRule, is_ignored, parse_ignore_file, parse_rule, rule_matches

#: Directory names that are never walked.
SKIP_DIRS = (
    ".git",
    ".hg",
    ".svn",
    ".mypy_cache",
    ".next",
    ".pytest_cache",
    ".tox",
    ".venv",
    "__pycache__",
    "build",
    "dist",
    "node_modules",
    "vendor",
    "venv",
)

#: Lockfile names skipped unless ``include_lockfiles`` is set.
LOCKFILES = (
    "Cargo.lock",
    "Gemfile.lock",
    "Pipfile.lock",
    "bun.lock",
    "bun.lockb",
    "composer.lock",
    "flake.lock",
    "go.sum",
    "npm-shrinkwrap.json",
    "package-lock.json",
    "pdm.lock",
    "pnpm-lock.yaml",
    "poetry.lock",
    "uv.lock",
    "yarn.lock",
)


def _read_ignore(dir_abs: str, base: str) -> List[GlobRule]:
    try:
        with open(os.path.join(dir_abs, ".gitignore"), encoding="utf-8", errors="replace") as f:
            return parse_ignore_file(f.read(), base)
    except OSError:
        return []


def walk_files(
    root_abs: str,
    ignore: Sequence[str] = (),
    include: Sequence[str] = (),
    gitignore: bool = True,
    include_lockfiles: bool = False,
) -> List[str]:
    """Lists the files under ``root_abs`` that should be scanned, as absolute paths.
    Symbolic links are not followed."""
    user_ignore = [r for r in (parse_rule(g, "", False) for g in ignore) if r is not None]
    includes = [r for r in (parse_rule(g, "", False) for g in include) if r is not None]
    skip_dirs = set(SKIP_DIRS)
    lockfiles = set(LOCKFILES)
    out: List[str] = []

    def visit(dir_abs: str, rel: str, inherited: List[GlobRule]) -> None:
        rules = inherited + _read_ignore(dir_abs, rel) if gitignore else inherited
        try:
            names = sorted(os.listdir(dir_abs))
        except OSError:
            return
        for name in names:
            path = os.path.join(dir_abs, name)
            child_rel = name if rel == "" else rel + "/" + name
            if os.path.islink(path):
                continue
            is_dir = os.path.isdir(path)
            if not is_dir and not os.path.isfile(path):
                continue
            if is_dir and name in skip_dirs:
                continue
            if not is_dir and not include_lockfiles and name in lockfiles:
                continue
            if is_ignored(rules, child_rel, is_dir):
                continue
            if any(rule_matches(r, child_rel, is_dir) for r in user_ignore):
                continue
            if is_dir:
                visit(path, child_rel, rules)
            elif not includes or any(rule_matches(r, child_rel, False) for r in includes):
                out.append(path)

    visit(root_abs, "", [])
    return out

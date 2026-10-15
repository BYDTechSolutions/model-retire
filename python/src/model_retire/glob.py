"""A small subset of gitignore pattern syntax, implemented the same way as the Node package
(``src/glob.ts``) so both skip exactly the same files.

Supported: ``*``, ``?``, ``[abc]``, ``[!abc]``, ``**`` (leading, trailing, middle), a trailing
``/`` (directories only), a leading or inner ``/`` (anchored to the directory holding the
rule), ``!`` negation in ``.gitignore`` files, ``#`` comments and ``\\`` escapes.
"""

from __future__ import annotations

import re
from typing import List, NamedTuple, Optional, Sequence

_SPECIAL = set(".*+?^${}()|[]\\/-")


class GlobRule(NamedTuple):
    base: str  #: directory the rule is relative to (posix, "" for the scan root)
    regex: "re.Pattern[str]"
    negate: bool
    dir_only: bool
    anchored: bool  #: anchored rules match the path relative to base; others the basename


def _escape_char(c: str) -> str:
    return "\\" + c if c in _SPECIAL else c


def glob_to_regex_source(glob: str) -> str:
    """Translates one glob (without leading ``!`` or trailing ``/``) to an anchored regex."""
    out = ""
    i = 0
    n = len(glob)
    while i < n:
        c = glob[i]
        if c == "*":
            if i + 1 < n and glob[i + 1] == "*":
                at_start = i == 0 or glob[i - 1] == "/"
                if at_start and i + 2 < n and glob[i + 2] == "/":
                    out += "(?:.*/)?"
                    i += 3
                    continue
                out += ".*"
                i += 2
                continue
            out += "[^/]*"
            i += 1
            continue
        if c == "?":
            out += "[^/]"
            i += 1
            continue
        if c == "[":
            close = glob.find("]", i + 2)
            if close == -1:
                out += "\\["
                i += 1
                continue
            body = glob[i + 1 : close]
            negate = False
            if body.startswith("!") or body.startswith("^"):
                negate = True
                body = body[1:]
            body = re.sub(r"[\\\[\]^]", lambda m: "\\" + m.group(0), body)
            out += ("[^/" + body + "]") if negate else ("[" + body + "]")
            i = close + 1
            continue
        if c == "\\" and i + 1 < n:
            out += _escape_char(glob[i + 1])
            i += 2
            continue
        out += _escape_char(c)
        i += 1
    return "^" + out + "$"


def parse_rule(line: str, base: str = "", allow_negation: bool = True) -> Optional[GlobRule]:
    """Parses one pattern line. Returns None for blank lines and comments."""
    p = line[:-1] if line.endswith("\r") else line
    if p.strip() == "" or p.startswith("#"):
        return None
    p = p.rstrip(" ")
    negate = False
    if allow_negation and p.startswith("!"):
        negate = True
        p = p[1:]
    dir_only = False
    if p.endswith("/"):
        dir_only = True
        p = p.rstrip("/")
    anchored = "/" in p
    p = p.lstrip("/")
    if p == "":
        return None
    return GlobRule(base, re.compile(glob_to_regex_source(p)), negate, dir_only, anchored)


def parse_ignore_file(text: str, base: str) -> List[GlobRule]:
    """Parses the text of a ``.gitignore`` file found in directory ``base``."""
    rules = []
    for line in text.split("\n"):
        r = parse_rule(line, base, True)
        if r is not None:
            rules.append(r)
    return rules


def rule_matches(rule: GlobRule, rel_path: str, is_dir: bool) -> bool:
    """True when ``rule`` matches ``rel_path`` (posix, relative to the scan root)."""
    if rule.dir_only and not is_dir:
        return False
    sub = rel_path
    if rule.base != "":
        if not rel_path.startswith(rule.base + "/"):
            return False
        sub = rel_path[len(rule.base) + 1 :]
    target = sub if rule.anchored else sub.split("/")[-1]
    return rule.regex.fullmatch(target) is not None


def is_ignored(rules: Sequence[GlobRule], rel_path: str, is_dir: bool) -> bool:
    """Applies rules in order; the last matching rule decides."""
    ignored = False
    for r in rules:
        if rule_matches(r, rel_path, is_dir):
            ignored = not r.negate
    return ignored

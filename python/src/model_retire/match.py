"""Finding model ID strings in text with the same boundary rule as the Node package."""

from __future__ import annotations

import functools
import re
from typing import Dict, Iterable, List, NamedTuple, Optional, Sequence

from .data import Entry

#: Characters that may not touch a match on either side.
BOUNDARY_CLASS = "[A-Za-z0-9._-]"


class LineMatch(NamedTuple):
    column: int  #: 1-based column in Unicode code points
    match: str  #: the exact string found


def _cmp(a: str, b: str) -> int:
    if len(a) != len(b):
        return len(b) - len(a)
    return -1 if a < b else (1 if a > b else 0)


def order_patterns(strings: Iterable[str]) -> List[str]:
    """Longest first, then by code point order, so the longest string wins at a position."""
    return sorted(strings, key=functools.cmp_to_key(_cmp))


class Matcher:
    """Finds IDs and aliases of ``models`` in lines of text.

    A hit must not have ``[A-Za-z0-9._-]`` directly before or after it, so ``gpt-4`` does not
    match inside ``gpt-4o``, ``gpt-4-turbo`` or ``gpt-4.1``. Matching is case-sensitive.
    """

    def __init__(self, models: Sequence[Entry]):
        self._map: Dict[str, List[Entry]] = {}
        for m in models:
            for s in [m["id"]] + list(m.get("aliases") or []):
                lst = self._map.setdefault(s, [])
                if not any(x is m for x in lst):
                    lst.append(m)
        patterns = order_patterns(self._map.keys())
        self._re: Optional[re.Pattern] = None
        if patterns:
            alt = "|".join(re.escape(p) for p in patterns)
            self._re = re.compile("(?<!%s)(?:%s)(?!%s)" % (BOUNDARY_CLASS, alt, BOUNDARY_CLASS))

    def find_in_line(self, line: str) -> List[LineMatch]:
        """All non-overlapping hits in one line, left to right."""
        if self._re is None:
            return []
        return [LineMatch(m.start() + 1, m.group(0)) for m in self._re.finditer(line)]

    def entries_for(self, match: str) -> List[Entry]:
        """Entries a matched string resolves to (several when providers share an ID)."""
        return self._map.get(match, [])


def create_matcher(models: Sequence[Entry]) -> Matcher:
    """Builds a :class:`Matcher` for ``models``."""
    return Matcher(models)

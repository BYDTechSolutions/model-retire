"""Date helpers. All dates are ``YYYY-MM-DD`` strings evaluated in UTC."""

from __future__ import annotations

import datetime as _dt
import re

from .errors import UsageError

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def is_valid_date(value: object) -> bool:
    """True when ``value`` is a real calendar date written as ``YYYY-MM-DD``."""
    if not isinstance(value, str) or not _DATE_RE.match(value):
        return False
    try:
        _dt.date.fromisoformat(value)
    except ValueError:
        return False
    return True


def parse_date(value: str) -> _dt.date:
    """Parses a ``YYYY-MM-DD`` date. Raises :class:`UsageError` when invalid."""
    if not is_valid_date(value):
        raise UsageError('invalid date "%s": expected YYYY-MM-DD' % value)
    return _dt.date.fromisoformat(value)


def today_utc() -> str:
    """Today's date in UTC as ``YYYY-MM-DD``."""
    return _dt.datetime.now(_dt.timezone.utc).date().isoformat()


def days_between(start: str, end: str) -> int:
    """Whole days from ``start`` to ``end`` (negative when ``end`` is earlier)."""
    return (parse_date(end) - parse_date(start)).days

"""Loading, validating and merging datasets."""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from .dates import is_valid_date
from .errors import UsageError

Entry = Dict[str, Any]
Dataset = Dict[str, Any]

_DATE_FIELDS = ("deprecated_on", "retires_on", "checked")
_STRING_FIELDS = ("replacement", "note", "source")
_cached: Optional[Dataset] = None


def default_dataset() -> Dataset:
    """The dataset bundled with this version of the package."""
    global _cached
    if _cached is None:
        try:
            from importlib.resources import files

            text = files("model_retire").joinpath("models.json").read_text(encoding="utf-8")
        except (ImportError, AttributeError):  # pragma: no cover - very old importlib
            import os

            with open(os.path.join(os.path.dirname(__file__), "models.json"), encoding="utf-8") as f:
                text = f.read()
        _cached = json.loads(text)
    return _cached


def validate_dataset(value: Any, label: str = "dataset") -> Dataset:
    """Checks the shape of a parsed dataset. Raises :class:`UsageError` naming the first problem."""
    if not isinstance(value, dict):
        raise UsageError('%s: expected an object with a "models" array' % label)
    if "updated" in value and not is_valid_date(value["updated"]):
        raise UsageError('%s: "updated" must be a YYYY-MM-DD date' % label)
    models = value.get("models")
    if not isinstance(models, list):
        raise UsageError('%s: expected an object with a "models" array' % label)
    for i, e in enumerate(models):
        where = "%s: models[%d]" % (label, i)
        if not isinstance(e, dict):
            raise UsageError("%s must be an object" % where)
        for key in ("provider", "id"):
            if not isinstance(e.get(key), str) or e.get(key) == "":
                raise UsageError("%s.%s must be a non-empty string" % (where, key))
        if e.get("status") not in ("deprecated", "retired"):
            raise UsageError('%s.status must be "deprecated" or "retired"' % where)
        if "aliases" in e:
            a = e["aliases"]
            if not isinstance(a, list) or any(not isinstance(x, str) or x == "" for x in a):
                raise UsageError("%s.aliases must be an array of non-empty strings" % where)
        for key in _DATE_FIELDS:
            if key in e and not is_valid_date(e[key]):
                raise UsageError("%s.%s must be a YYYY-MM-DD date" % (where, key))
        for key in _STRING_FIELDS:
            if key in e and not isinstance(e[key], str):
                raise UsageError("%s.%s must be a string" % (where, key))
    return value


def load_dataset_file(path: str) -> Dataset:
    """Reads and validates a dataset file. Raises :class:`UsageError` when missing or malformed."""
    try:
        with open(path, encoding="utf-8") as f:
            text = f.read()
    except OSError:
        raise UsageError("cannot read data file: %s" % path) from None
    try:
        parsed = json.loads(text)
    except ValueError:
        raise UsageError("data file is not valid JSON: %s" % path) from None
    return validate_dataset(parsed, path)


def merge_datasets(*sets: Dataset) -> Dataset:
    """Merges datasets left to right; a later entry with the same provider and id replaces an
    earlier one. The result is sorted by provider, then id."""
    by_key: Dict[tuple, Entry] = {}
    updated: Optional[str] = None
    for s in sets:
        u = s.get("updated")
        if u is not None and (updated is None or u < updated):
            updated = u
        for e in s["models"]:
            by_key[(e["provider"], e["id"])] = e
    models: List[Entry] = sorted(by_key.values(), key=lambda e: (e["provider"], e["id"]))
    out: Dataset = {}
    if updated is not None:
        out["updated"] = updated
    out["models"] = models
    return out

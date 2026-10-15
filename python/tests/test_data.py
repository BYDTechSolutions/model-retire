import json
import os

import pytest

from model_retire import __version__, default_dataset, merge_datasets, validate_dataset, UsageError

HERE = os.path.dirname(os.path.abspath(__file__))
PKG_COPY = os.path.join(HERE, "..", "src", "model_retire", "models.json")
REPO_DATA = os.path.join(HERE, "..", "..", "data", "models.json")
REPO_PACKAGE_JSON = os.path.join(HERE, "..", "..", "package.json")


def test_bundled_copy_is_identical_to_repo_data():
    if not os.path.exists(REPO_DATA):
        pytest.skip("data/models.json is only available in the repository")
    with open(PKG_COPY, "rb") as a, open(REPO_DATA, "rb") as b:
        assert a.read() == b.read(), "run `npm run sync-data` in the repository root"


def test_version_matches_npm_package():
    if not os.path.exists(REPO_PACKAGE_JSON):
        pytest.skip("package.json is only available in the repository")
    with open(REPO_PACKAGE_JSON, encoding="utf-8") as f:
        assert json.load(f)["version"] == __version__


def test_default_dataset_loads_and_validates():
    d = default_dataset()
    validate_dataset(d)
    assert len(d["models"]) > 0
    keys = [(m["provider"], m["id"]) for m in d["models"]]
    assert keys == sorted(keys)
    assert len(set(keys)) == len(keys)
    for m in d["models"]:
        assert m["source"].startswith("https://")


def test_validate_rejects_bad_data():
    with pytest.raises(UsageError):
        validate_dataset({})
    with pytest.raises(UsageError):
        validate_dataset({"models": [{"provider": "p", "id": "", "status": "retired"}]})
    with pytest.raises(UsageError):
        validate_dataset({"models": [{"provider": "p", "id": "x", "status": "retired", "retires_on": "2026-1-1"}]})
    with pytest.raises(UsageError):
        validate_dataset({"models": [{"provider": "p", "id": "x", "status": "retired", "aliases": [1]}]})


def test_merge():
    a = {"updated": "2026-10-16", "models": [{"provider": "b", "id": "x", "status": "deprecated"}]}
    b = {"models": [{"provider": "b", "id": "x", "status": "retired"}, {"provider": "a", "id": "y", "status": "deprecated"}]}
    assert merge_datasets(a, b) == {
        "updated": "2026-10-16",
        "models": [{"provider": "a", "id": "y", "status": "deprecated"}, {"provider": "b", "id": "x", "status": "retired"}],
    }

import json
import os

import pytest

from model_retire import UsageError, assess, load_dataset_file, scan

DATASET = {
    "models": [
        {"provider": "p", "id": "old-model", "status": "retired", "retires_on": "2026-01-01", "source": "https://example.com"},
        {"provider": "p", "id": "soon-model", "status": "deprecated", "retires_on": "2026-11-01"},
        {"provider": "p", "id": "later-model", "status": "deprecated", "retires_on": "2027-06-01"},
        {"provider": "p", "id": "undated-model", "status": "deprecated"},
    ]
}


def files(root, **kw):
    r = scan(cwd=root, today="2026-10-16", dataset=DATASET, **kw)
    out = []
    for f in r["findings"]:
        if f["file"] not in out:
            out.append(f["file"])
    return out


def e(**over):
    d = {"provider": "p", "id": "m", "status": "deprecated"}
    d.update(over)
    return d


def test_assess():
    assert assess(e(retires_on="2026-10-01"), "2026-10-16", 90, False) == ("retired", "error", -15)
    assert assess(e(retires_on="2026-10-16"), "2026-10-16", 90, False).status == "retired"
    assert assess(e(status="retired"), "2026-10-16", 90, False) == ("retired", "error", None)
    assert assess(e(retires_on="2026-11-15"), "2026-10-16", 30, False).severity == "error"
    assert assess(e(retires_on="2026-11-16"), "2026-10-16", 30, False).severity == "warning"
    assert assess(e(retires_on="2026-10-20"), "2026-10-16", 90, True).severity == "warning"
    assert assess(e(retires_on="2026-10-01"), "2026-10-16", 90, True).severity == "error"
    assert assess(e(), "2026-10-16", 90, False) == ("deprecated", "warning", None)


def test_finding_fields(project):
    root = project({"a.py": 'x = 1\nm = "old-model"\n'})
    r = scan(cwd=root, today="2026-10-16", dataset=DATASET)
    assert r["findings"] == [
        {
            "file": "a.py",
            "line": 2,
            "column": 6,
            "match": "old-model",
            "provider": "p",
            "id": "old-model",
            "status": "retired",
            "severity": "error",
            "deprecated_on": None,
            "retires_on": "2026-01-01",
            "days_remaining": -288,
            "replacement": None,
            "note": None,
            "source": "https://example.com",
        }
    ]
    assert r["summary"] == {"errors": 1, "warnings": 0}


def test_warn_days_and_warn_only(project):
    root = project({"a.ts": "soon-model later-model undated-model"})

    def sev(**kw):
        return ["%s:%s" % (f["id"], f["severity"]) for f in scan(cwd=root, today="2026-10-16", dataset=DATASET, **kw)["findings"]]

    assert sev() == ["soon-model:error", "later-model:warning", "undated-model:warning"]
    assert sev(warn_days=10) == ["soon-model:warning", "later-model:warning", "undated-model:warning"]
    assert sev(warn_only=True) == ["soon-model:warning", "later-model:warning", "undated-model:warning"]
    assert sev(warn_days=365) == ["soon-model:error", "later-model:error", "undated-model:warning"]


def test_crlf_and_bom(project):
    root = project({"a.txt": "﻿old-model\r\nx old-model\r\n"})
    r = scan(cwd=root, today="2026-10-16", dataset=DATASET)
    assert [(f["line"], f["column"]) for f in r["findings"]] == [(1, 1), (2, 3)]


def test_skip_dirs(project):
    root = project(
        {
            "src/a.ts": "old-model",
            "node_modules/x/a.js": "old-model",
            ".git/config": "old-model",
            "dist/a.js": "old-model",
            "build/a.js": "old-model",
            ".venv/a.py": "old-model",
            "venv/a.py": "old-model",
            "__pycache__/a.py": "old-model",
            "vendor/a.go": "old-model",
        }
    )
    assert files(root) == ["src/a.ts"]


def test_lockfiles(project):
    root = project({"package-lock.json": "old-model", "yarn.lock": "old-model", "a.ts": "old-model"})
    assert files(root) == ["a.ts"]
    assert files(root, include_lockfiles=True) == ["a.ts", "package-lock.json", "yarn.lock"]


def test_gitignore(project):
    root = project(
        {
            ".gitignore": "out/\n*.log\n!keep.log\n",
            "out/a.ts": "old-model",
            "debug.log": "old-model",
            "keep.log": "old-model",
            "pkg/.gitignore": "local.ts\n",
            "pkg/local.ts": "old-model",
            "pkg/main.ts": "old-model",
            "main.ts": "old-model",
        }
    )
    assert files(root) == ["keep.log", "main.ts", "pkg/main.ts"]
    assert files(root, gitignore=False) == ["debug.log", "keep.log", "main.ts", "out/a.ts", "pkg/local.ts", "pkg/main.ts"]


def test_ignore_include(project):
    root = project({"src/a.ts": "old-model", "src/a.test.ts": "old-model", "docs/a.md": "old-model"})
    assert files(root, ignore=["*.test.ts"]) == ["docs/a.md", "src/a.ts"]
    assert files(root, ignore=["docs/"]) == ["src/a.test.ts", "src/a.ts"]
    assert files(root, include=["*.md"]) == ["docs/a.md"]
    assert files(root, include=["src/**"], ignore=["*.test.ts"]) == ["src/a.ts"]


def test_binary_and_size(project):
    root = project(
        {
            "bin.dat": b"o\x00\x01 old-model",
            "big.txt": "old-model\n" + "x" * (1024 * 1024),
            "ok.txt": "old-model",
        }
    )
    r = scan(cwd=root, today="2026-10-16", dataset=DATASET)
    assert [f["file"] for f in r["findings"]] == ["ok.txt"]
    assert r["files_scanned"] == 1
    assert files(root, max_bytes=4 * 1024 * 1024) == ["big.txt", "ok.txt"]


def test_symlinks_not_followed(project):
    root = project({"real/a.ts": "old-model"})
    os.symlink(os.path.join(root, "real"), os.path.join(root, "link"))
    os.symlink(os.path.join(root, "real", "a.ts"), os.path.join(root, "b.ts"))
    assert files(root) == ["real/a.ts"]


def test_explicit_file_and_relative_paths(project):
    root = project({"node_modules/x.js": "old-model", "pkg/src/a.ts": "old-model"})
    assert files(root, paths=["node_modules/x.js"]) == ["node_modules/x.js"]
    assert files(os.path.join(root, "pkg"), paths=["src"]) == ["src/a.ts"]


def test_usage_errors(project):
    root = project({"a.ts": ""})
    with pytest.raises(UsageError):
        scan(cwd=root, paths=["nope"], dataset=DATASET)
    with pytest.raises(UsageError):
        scan(cwd=root, today="2026-02-30", dataset=DATASET)
    with pytest.raises(UsageError):
        scan(cwd=root, warn_days=-1, dataset=DATASET)


def test_bundled_dataset(project):
    root = project({"a.ts": 'const m = "claude-3-opus-20240229";'})
    r = scan(cwd=root, today="2026-10-16")
    assert ["%s/%s" % (f["provider"], f["id"]) for f in r["findings"]] == ["anthropic/claude-3-opus-20240229"]


def test_shared_fixture_matches_expected_json(fixtures):
    r = scan(
        cwd=os.path.join(fixtures, "project"),
        today="2026-10-16",
        dataset=load_dataset_file(os.path.join(fixtures, "models.json")),
    )
    with open(os.path.join(fixtures, "expected.json"), encoding="utf-8") as f:
        expected = json.load(f)
    assert r == expected

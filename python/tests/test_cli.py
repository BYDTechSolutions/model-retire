import json
import os

import pytest

from model_retire.cli import run


def cli(args, cwd):
    out, err = [], []
    code = run(args, out.append, err.append, cwd=cwd)
    return code, "".join(out), "".join(err)


@pytest.fixture
def fx(fixtures):
    project = os.path.join(fixtures, "project")
    data = ["--no-default-data", "--data", os.path.join(fixtures, "models.json"), "--today", "2026-10-16"]
    return project, data


def test_exit_1_on_errors(fx):
    project, data = fx
    assert cli(data, project)[0] == 1


def test_exit_codes(project):
    d = project({"a.ts": '"claude-sonnet-4-5-20250929"', "b.ts": '"gpt-4o"'})
    assert cli(["--today", "2026-10-16", "a.ts"], d)[0] == 1
    assert cli(["--today", "2026-10-16", "--warn-only", "a.ts"], d)[0] == 0
    assert cli(["--today", "2026-10-16", "--warn-days", "30", "a.ts"], d)[0] == 0
    code, out, _ = cli(["--today", "2026-10-16", "b.ts"], d)
    assert code == 0
    assert out == "No deprecated or retired model IDs found. Scanned 1 file.\n"


@pytest.mark.parametrize(
    "args",
    [
        ["--format", "xml"],
        ["--warn-days", "ten"],
        ["--warn-days", "-1"],
        ["--today", "2026-13-01"],
        ["--bogus"],
        ["missing-path"],
        ["--provider", "openai"],
        ["--data", "nope.json"],
        ["--no-default-data"],
        ["list", "extra"],
        ["list", "--provider", "nobody"],
        ["list", "--format", "github"],
    ],
)
def test_usage_errors_exit_2(args, project):
    d = project({"a.ts": ""})
    code, out, err = cli(args, d)
    assert code == 2
    assert err.startswith("model-retire: ")
    assert out == ""


def test_malformed_data(project):
    d = project({"bad.json": '{"models":[{"provider":"x","id":"y","status":"gone"}]}', "broken.json": "{"})
    assert "status must be" in cli(["--data", "bad.json"], d)[2]
    assert cli(["--data", "broken.json"], d)[0] == 2


def test_text_and_github(fx):
    project, data = fx
    out = cli(data, project)[1]
    assert "src/agent.py\n  2:8     error    anthropic claude-3-opus-20240229: retired 2026-01-05 (284 days ago)\n" in out
    assert out.endswith("22 problems (19 errors, 3 warnings) in 10 files. Scanned 11 files.\n")
    gh = cli(data + ["-f", "github"], project)[1].rstrip("\n").split("\n")
    assert (
        "::error file=src/agent.py,line=2,col=8,title=Retired model ID claude-3-opus-20240229::"
        "anthropic claude-3-opus-20240229: retired 2026-01-05 (284 days ago). Replacement: claude-opus-4-8. "
        "Source: https://platform.claude.com/docs/en/about-claude/model-deprecations"
    ) in gh
    assert any("title=Retired model ID anthropic.claude-3-haiku-20240307-v1%3A0::" in line for line in gh)
    assert gh[-1] == "model-retire: 19 errors, 3 warnings. Scanned 11 files."


def test_json_matches_expected(fx, fixtures):
    project, data = fx
    code, out, _ = cli(data + ["-f", "json"], project)
    with open(os.path.join(fixtures, "expected.json"), encoding="utf-8") as f:
        assert out == f.read()


def test_gitignore_and_lockfile_flags(fx):
    project, data = fx

    def fileset(extra):
        return {f["file"] for f in json.loads(cli(data + ["-f", "json"] + extra, project)[1])["findings"]}

    assert "ignored/old.js" not in fileset([])
    assert "keep.log" in fileset([])
    assert "ignored/old.js" in fileset(["--no-gitignore"])
    assert "package-lock.json" in fileset(["--include-lockfiles"])
    assert sorted(fileset(["--include", "*.py"])) == ["src/agent.py", "src/vertex.py"]


def test_data_merge(project):
    d = project(
        {
            "a.ts": '"internal-model-v1" "claude-3-opus-20240229"',
            "extra.json": json.dumps(
                {
                    "models": [
                        {"provider": "internal", "id": "internal-model-v1", "status": "deprecated", "retires_on": "2026-12-01"},
                        {"provider": "anthropic", "id": "claude-3-opus-20240229", "status": "retired", "replacement": "custom-choice"},
                    ]
                }
            ),
        }
    )
    out = json.loads(cli(["--today", "2026-10-16", "--data", "extra.json", "-f", "json", "a.ts"], d)[1])
    assert [[f["id"], f["replacement"], f["source"]] for f in out["findings"]] == [
        ["internal-model-v1", None, None],
        ["claude-3-opus-20240229", "custom-choice", None],
    ]


def test_list(project):
    d = project({})
    code, out, _ = cli(["list", "--provider", "anthropic", "--today", "2026-10-16"], d)
    assert code == 0
    assert out.split("\n")[0].split() == ["PROVIDER", "ID", "STATUS", "RETIRES", "REPLACEMENT"]
    assert "openai" not in out
    data = json.loads(cli(["list", "--provider", "cohere", "-f", "json"], d)[1])
    assert data["models"] and all(m["provider"] == "cohere" for m in data["models"])


def test_help_and_version(project):
    d = project({})
    assert "Usage:" in cli(["--help"], d)[1]
    assert cli(["--version"], d)[1] == "0.1.1\n"

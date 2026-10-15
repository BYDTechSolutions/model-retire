import pytest

from model_retire import create_matcher


def entry(id, aliases=None, provider="test"):
    e = {"provider": provider, "id": id, "status": "deprecated"}
    if aliases:
        e["aliases"] = aliases
    return e


matcher = create_matcher(
    [
        entry("gpt-4-0613", ["gpt-4"]),
        entry("gpt-4-turbo"),
        entry("claude-3-opus-20240229"),
        entry("text-bison"),
        entry("anthropic.claude-3-haiku-20240307-v1:0"),
        entry("command-r-03-2024", ["command-r"]),
        entry("minimax.minimax-m2"),
        entry("minimax.minimax-m2.1"),
    ]
)


def found(line):
    return [m.match for m in matcher.find_in_line(line)]


@pytest.mark.parametrize("s", ["gpt-4o", "gpt-4.1", "gpt-4.1-mini", "gpt-4o-mini", "gpt-4-32k", "gpt-4-0613x", "gpt-4_beta"])
def test_no_match_inside_longer_ids(s):
    assert found('model = "%s"' % s) == []


@pytest.mark.parametrize("s", ["xgpt-4", "1gpt-4", ".gpt-4", "-gpt-4", "_gpt-4"])
def test_no_match_after_id_character(s):
    assert found(s) == []


def test_longer_id_wins():
    assert found('"gpt-4-turbo"') == ["gpt-4-turbo"]


@pytest.mark.parametrize("s", ['"gpt-4"', "'gpt-4'", "`gpt-4`", "model=gpt-4", "(gpt-4)", "gpt-4,", "gpt-4:", "/gpt-4/", "[gpt-4]", "gpt-4 "])
def test_alias_alone(s):
    assert found(s) == ["gpt-4"]


def test_line_start_and_end():
    assert found("gpt-4") == ["gpt-4"]
    assert found("use gpt-4") == ["gpt-4"]


def test_dated_id_only_itself():
    assert found('"claude-3-opus-20240229"') == ["claude-3-opus-20240229"]
    for s in ["claude-3-opus-20240229-v2", "claude-3-opus-2024022", "claude-3-opus-202402291", "claude-3-opus"]:
        assert found('"%s"' % s) == []


def test_case_sensitive():
    assert found("GPT-4 Claude-3-Opus-20240229") == []


def test_fine_tuned_and_at_sign():
    assert found("ft:gpt-4-0613:my-org::abc") == ["gpt-4-0613"]
    assert found("text-bison@001") == ["text-bison"]


def test_bedrock_ids():
    assert found('"anthropic.claude-3-haiku-20240307-v1:0"') == ["anthropic.claude-3-haiku-20240307-v1:0"]
    assert found('"us.anthropic.claude-3-haiku-20240307-v1:0"') == []
    assert found("cohere.command-r-v1:0") == []
    assert found("minimax.minimax-m2") == ["minimax.minimax-m2"]
    assert found("minimax.minimax-m2.1") == ["minimax.minimax-m2.1"]
    assert found("minimax.minimax-m2.10") == []


def test_several_hits():
    assert found('["gpt-4", "gpt-4o", "gpt-4-turbo", "gpt-4"]') == ["gpt-4", "gpt-4-turbo", "gpt-4"]


def test_columns_in_code_points():
    assert matcher.find_in_line("gpt-4")[0].column == 1
    assert matcher.find_in_line("\U0001F680 gpt-4")[0].column == 3
    assert matcher.find_in_line("café gpt-4")[0].column == 6


def test_entries():
    assert [e["id"] for e in matcher.entries_for("gpt-4")] == ["gpt-4-0613"]
    m = create_matcher([entry("g", provider="a"), entry("g", provider="b")])
    assert [e["provider"] for e in m.entries_for("g")] == ["a", "b"]
    assert create_matcher([]).find_in_line("gpt-4") == []
    m = create_matcher([entry("a+b(c)"), entry("x.y")])
    assert [h.match for h in m.find_in_line("a+b(c) xzy x.y")] == ["a+b(c)", "x.y"]

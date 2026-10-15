import re

from model_retire.glob import glob_to_regex_source, is_ignored, parse_ignore_file, parse_rule, rule_matches


def rx(g):
    return re.compile(glob_to_regex_source(g))


def test_star_and_question():
    assert rx("*.ts").fullmatch("a.ts")
    assert not rx("*.ts").fullmatch("src/a.ts")
    assert rx("a?c").fullmatch("abc")
    assert not rx("a?c").fullmatch("a/c")


def test_double_star():
    assert rx("**/a.ts").fullmatch("a.ts")
    assert rx("**/a.ts").fullmatch("x/y/a.ts")
    assert rx("src/**").fullmatch("src/x/y.ts")
    assert rx("src/**/a.ts").fullmatch("src/a.ts")
    assert rx("src/**/a.ts").fullmatch("src/x/y/a.ts")


def test_classes_and_escapes():
    assert rx("[ab].txt").fullmatch("a.txt")
    assert not rx("[ab].txt").fullmatch("c.txt")
    assert rx("[!ab].txt").fullmatch("c.txt")
    assert rx("[a-c]x").fullmatch("bx")
    assert rx("a+b.(c)").fullmatch("a+b.(c)")
    assert not rx("a+b.(c)").fullmatch("aab.(c)")
    assert rx("\\*.md").fullmatch("*.md")
    assert not rx("\\*.md").fullmatch("a.md")


def test_same_regex_source_as_node():
    # Spot values produced by src/glob.ts globToRegexSource.
    assert glob_to_regex_source("**/a.ts") == "^(?:.*/)?a\\.ts$"
    assert glob_to_regex_source("src/*.t?") == "^src\\/[^/]*\\.t[^/]$"
    assert glob_to_regex_source("[!ab]-x") == "^[^/ab]\\-x$"


def test_parse_rule():
    assert parse_rule("") is None
    assert parse_rule("# c") is None
    assert parse_rule("!keep.log").negate
    assert parse_rule("build/").dir_only
    assert parse_rule("/root.txt").anchored
    assert not parse_rule("!x", "", False).negate


def test_gitignore_semantics():
    rules = parse_ignore_file("*.log\n/top.txt\ndocs/gen/\n!keep.log\n", "")
    assert is_ignored(rules, "x/y/a.log", False)
    assert not is_ignored(rules, "keep.log", False)
    assert is_ignored(rules, "top.txt", False)
    assert not is_ignored(rules, "sub/top.txt", False)
    assert is_ignored(rules, "docs/gen", True)
    assert not is_ignored(rules, "docs/gen", False)
    nested = parse_ignore_file("secret.txt\n/local.txt\n", "pkg")
    assert is_ignored(nested, "pkg/deep/secret.txt", False)
    assert not is_ignored(nested, "secret.txt", False)
    assert not is_ignored(nested, "pkg/deep/local.txt", False)
    assert rule_matches(parse_rule("generated"), "src/generated", True)

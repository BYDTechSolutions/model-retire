"""The ``model-retire`` command. Same flags, output and exit codes as the Node CLI."""

from __future__ import annotations

import argparse
import os
import sys
from typing import Callable, List, Optional

from . import __version__
from .data import default_dataset, load_dataset_file, merge_datasets
from .dates import is_valid_date, today_utc
from .errors import UsageError
from .fmt import format_github, format_json, format_list, format_text
from .scan import DEFAULT_WARN_DAYS, scan

HELP = """Usage:
  model-retire [paths...] [options]     scan files for deprecated or retired model IDs
  model-retire list [options]           print the dataset

Scan options:
  -f, --format <text|json|github>  output format (default: text)
      --warn-days <n>              a shutdown within n days is an error (default: %d)
      --warn-only                  report scheduled shutdowns as warnings; only retired models fail
      --today <YYYY-MM-DD>         date to evaluate against (default: today, UTC)
      --ignore <glob>              skip matching files or directories (repeatable)
      --include <glob>             scan only matching files (repeatable)
      --no-gitignore               do not read .gitignore files
      --include-lockfiles          scan lockfiles too (skipped by default)

List options:
  -f, --format <text|json>         output format (default: text)
      --provider <name>            only this provider

Data options (both commands):
      --data <file>                merge a custom dataset over the bundled one (repeatable)
      --no-default-data            use only the --data files

  -h, --help                       show this help
      --version                    show the version

Exit codes: 0 no errors, 1 errors found, 2 usage error.
""" % DEFAULT_WARN_DAYS


class _Parser(argparse.ArgumentParser):
    def error(self, message: str):  # type: ignore[override]
        raise UsageError('%s\nRun "model-retire --help" for usage.' % message)


def _parser() -> argparse.ArgumentParser:
    p = _Parser(prog="model-retire", add_help=False, allow_abbrev=False)
    p.add_argument("paths", nargs="*")
    p.add_argument("-f", "--format")
    p.add_argument("--warn-days")
    p.add_argument("--warn-only", action="store_true")
    p.add_argument("--today")
    p.add_argument("--ignore", action="append", default=[])
    p.add_argument("--include", action="append", default=[])
    p.add_argument("--no-gitignore", action="store_true")
    p.add_argument("--include-lockfiles", action="store_true")
    p.add_argument("--provider")
    p.add_argument("--data", action="append", default=[])
    p.add_argument("--no-default-data", action="store_true")
    p.add_argument("-h", "--help", action="store_true")
    p.add_argument("--version", action="store_true")
    return p


def run(
    argv: List[str],
    stdout: Callable[[str], object] = sys.stdout.write,
    stderr: Callable[[str], object] = sys.stderr.write,
    cwd: Optional[str] = None,
) -> int:
    """Runs the CLI and returns the exit code."""
    try:
        return _main(argv, stdout, cwd)
    except UsageError as err:
        stderr("model-retire: %s\n" % err)
        return 2


def _main(argv: List[str], stdout: Callable[[str], object], cwd: Optional[str]) -> int:
    args = _parser().parse_intermixed_args(argv)
    if args.help:
        stdout(HELP)
        return 0
    if args.version:
        stdout(__version__ + "\n")
        return 0

    today = args.today if args.today is not None else today_utc()
    if not is_valid_date(today):
        raise UsageError('invalid --today "%s": expected YYYY-MM-DD' % today)

    base = cwd if cwd is not None else os.getcwd()
    sets = [] if args.no_default_data else [default_dataset()]
    for f in args.data:
        sets.append(load_dataset_file(os.path.join(base, f)))
    if not sets:
        raise UsageError("--no-default-data needs at least one --data file")
    dataset = merge_datasets(*sets)

    if args.paths and args.paths[0] == "list":
        return _list(args.paths[1:], args, dataset, today, stdout)
    if args.provider is not None:
        raise UsageError("--provider is only valid with the list command")

    fmt = args.format if args.format is not None else "text"
    if fmt not in ("text", "json", "github"):
        raise UsageError('invalid --format "%s": expected text, json or github' % fmt)
    warn_days = DEFAULT_WARN_DAYS
    if args.warn_days is not None:
        if not args.warn_days.isdigit() or not args.warn_days.isascii():
            raise UsageError('invalid --warn-days "%s": expected a whole number of days' % args.warn_days)
        warn_days = int(args.warn_days)

    result = scan(
        paths=args.paths,
        cwd=cwd,
        today=today,
        warn_days=warn_days,
        warn_only=args.warn_only,
        ignore=args.ignore,
        include=args.include,
        gitignore=not args.no_gitignore,
        include_lockfiles=args.include_lockfiles,
        dataset=dataset,
    )
    if fmt == "json":
        stdout(format_json(result))
    elif fmt == "github":
        stdout(format_github(result))
    else:
        stdout(format_text(result))
    return 1 if result["summary"]["errors"] > 0 else 0


def _list(extra, args, dataset, today, stdout) -> int:
    if extra:
        raise UsageError("unexpected argument for list: %s" % extra[0])
    fmt = args.format if args.format is not None else "text"
    if fmt not in ("text", "json"):
        raise UsageError('invalid --format "%s" for list: expected text or json' % fmt)
    selected = dataset
    if args.provider is not None:
        providers = sorted({m["provider"] for m in dataset["models"]})
        if args.provider not in providers:
            raise UsageError('unknown provider "%s". Known: %s' % (args.provider, ", ".join(providers)))
        selected = dict(dataset)
        selected["models"] = [m for m in dataset["models"] if m["provider"] == args.provider]
    stdout(format_json(selected) if fmt == "json" else format_list(selected, today))
    return 0


def main() -> None:
    """Console script entry point."""
    out = sys.stdout
    try:
        code = run(sys.argv[1:], out.write, sys.stderr.write)
        out.flush()
    except BrokenPipeError:  # pragma: no cover - e.g. piped into head
        code = 0
    sys.exit(code)


if __name__ == "__main__":  # pragma: no cover
    main()

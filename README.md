# model-retire

Find deprecated, retiring and retired LLM model IDs in a codebase before a provider shuts them off.

[![npm version](https://img.shields.io/npm/v/@bydtech/model-retire.svg)](https://www.npmjs.com/package/@bydtech/model-retire)
[![PyPI version](https://img.shields.io/pypi/v/bydtech-model-retire.svg)](https://pypi.org/project/bydtech-model-retire/)
[![CI](https://github.com/BYDTechSolutions/model-retire/actions/workflows/ci.yml/badge.svg)](https://github.com/BYDTechSolutions/model-retire/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## Why it exists

Model providers retire model IDs on a schedule, and on the shutdown date every request that names one fails. The notice arrives by email and on a docs page, while the ID sits in a config file, a prompt module or an environment default that nobody has opened in months. `model-retire` reads your code, finds the exact model ID strings, and tells you which ones are retired or about to be, when, what the provider says to use instead, and where that date was published.

## Install

The same tool, with the same dataset and the same output, is published twice:

```sh
npm install --save-dev @bydtech/model-retire   # Node.js 20 or later
pip install bydtech-model-retire               # Python 3.9 or later
```

Neither has runtime dependencies.

## Quick start

```sh
npx model-retire            # scan the current directory (npm)
model-retire                # same, after pip install
```

For a Python file that still names three Claude models, scanned on 2026-10-16 (`--today` pins the date):

```text
$ model-retire --today 2026-10-16 src/agent.py
src/agent.py
  2:8     error    anthropic claude-3-opus-20240229: retired 2026-01-05 (284 days ago)
                   replacement: claude-opus-4-8
                   source: https://platform.claude.com/docs/en/about-claude/model-deprecations
  3:9     error    anthropic claude-sonnet-4-5-20250929: retires 2026-11-30 (in 45 days)
                   replacement: claude-sonnet-5-5
                   source: https://platform.claude.com/docs/en/about-claude/model-deprecations
  4:12    warning  anthropic claude-mythos-preview: deprecated, no shutdown date announced
                   note: Retirement date to be announced.
                   source: https://platform.claude.com/docs/en/about-claude/model-deprecations

3 problems (2 errors, 1 warning) in 1 file. Scanned 1 file.
```

The exit code is 1 when anything is at error level, so it can gate a build as is.

### In GitHub Actions

```yaml
- uses: actions/checkout@v4
- uses: actions/setup-node@v4
  with:
    node-version: '22'
- run: npx --yes @bydtech/model-retire@0.1.1 --format github
```

Or with Python:

```yaml
- uses: actions/checkout@v4
- uses: actions/setup-python@v5
  with:
    python-version: '3.13'
- run: pip install bydtech-model-retire==0.1.1
- run: model-retire --format github
```

`--format github` turns each finding into an annotation on the line in the pull request. A weekly `schedule` trigger is worth adding: a model can become retiring without any change to your code. A full workflow is in [`examples/github-actions.yml`](examples/github-actions.yml).

## CLI reference

```text
model-retire [paths...] [options]     scan files for deprecated or retired model IDs
model-retire list [options]           print the dataset
```

Paths default to `.`. Directories are walked; a file named on the command line is always scanned, even inside a skipped directory. To scan a directory literally named `list`, write `./list`.

Each finding reports the file, line and column, the string found, the provider, the canonical model ID (when the string is an alias), its status, the shutdown date, the days remaining, the provider's recommended replacement, any note the provider puts on the date, and the source URL.

### Exit codes

| Code | Meaning |
|---|---|
| 0 | No finding at error level (warnings may be printed) |
| 1 | At least one finding at error level |
| 2 | Usage error: unknown flag, bad value, missing path, unreadable or malformed `--data` file |

### Output formats

- `text` (default): grouped by file, with a summary line.
- `json`: `{ version, today, warn_days, warn_only, files_scanned, summary: { errors, warnings }, findings: [...] }`. Each finding has `file`, `line`, `column`, `match`, `provider`, `id`, `status`, `severity`, `deprecated_on`, `retires_on`, `days_remaining`, `replacement`, `note`, `source`; missing values are `null`.
- `github`: one `::error` or `::warning` workflow command per finding, then a plain summary line.

The Node and Python CLIs print byte-identical output for the same arguments; CI checks it.

### `list`

```sh
model-retire list                       # every entry, with its status today
model-retire list --provider openai     # one provider
model-retire list --format json         # entries exactly as stored
```

An unknown `--provider` exits 2 and names the known providers.

## Configuration

All configuration is by flags.

| Flag | Default | Effect |
|---|---|---|
| `-f`, `--format <text\|json\|github>` | `text` | Output format. `list` accepts `text` and `json`. |
| `--warn-days <n>` | `90` | A model whose shutdown date is within `n` days is an error. |
| `--warn-only` | off | Report scheduled shutdowns as warnings. Retired models are still errors. |
| `--today <YYYY-MM-DD>` | today in UTC | The date everything is evaluated against. |
| `--ignore <glob>` | none | Skip matching files or directories. Repeatable. |
| `--include <glob>` | all files | Scan only files matching one of these globs. Repeatable. |
| `--no-gitignore` | reads them | Do not read `.gitignore` files. |
| `--include-lockfiles` | skipped | Scan lockfiles too. |
| `--data <file>` | none | Merge a custom dataset over the bundled one. Repeatable; later files win. |
| `--no-default-data` | off | Use only the `--data` files. |
| `--provider <name>` | all | `list` only: show one provider. |

### Severity

| Situation | Severity |
|---|---|
| Retired: the provider says so, or the shutdown date has been reached | error |
| Shutdown date within `--warn-days` | error, or warning with `--warn-only` |
| Shutdown date further out | warning |
| Deprecated with no shutdown date announced | warning |

The shutdown day itself counts as retired. `days_remaining` is negative after the date.

### Globs

`--ignore`, `--include` and `.gitignore` files use the same small subset of gitignore syntax: `*`, `?`, `[abc]`, `[!abc]`, `**`, a trailing `/` for directories only, and a leading or inner `/` to anchor a pattern to its directory. A pattern without a slash matches the file or directory name at any depth. `.gitignore` files are read in every directory walked, `!` negation works in them, and the last matching rule wins.

### Custom data

A `--data` file has the same shape as [`data/models.json`](data/models.json); only `provider`, `id` and `status` are required. An entry with the same `provider` and `id` as a bundled one replaces it, so you can override a date or add your own gateway's model names. See [`examples/custom-models.json`](examples/custom-models.json).

## API reference

### Node

```ts
import { scan, formatText } from '@bydtech/model-retire';

const result = scan({ paths: ['src'], warnDays: 60 });
process.stdout.write(formatText(result));
if (result.summary.errors > 0) process.exitCode = 1;
```

- `scan(options?)` returns a `ScanResult`, the object `--format json` prints. Options: `paths`, `cwd`, `today`, `warnDays`, `warnOnly`, `ignore`, `include`, `gitignore`, `includeLockfiles`, `dataset`, `maxBytes`. Throws `UsageError` for a bad date or a missing path.
- `formatText`, `formatJson`, `formatGithub(result)` and `formatList(dataset, today)` return strings.
- `defaultDataset()`, `loadDatasetFile(path)`, `validateDataset(value)`, `mergeDatasets(...sets)` work with datasets.
- `createMatcher(models)` returns `{ findInLine(line), entriesFor(match) }`; `assess(entry, today, warnDays, warnOnly)` returns `{ status, severity, days_remaining }`.
- Also exported: `walkFiles`, `SKIP_DIRS`, `LOCKFILES`, `parseRule`, `globToRegexSource`, `describeTiming`, `isValidDate`, `daysBetween`, `todayUtc`, and the types `ModelEntry`, `Dataset`, `Finding`, `ScanResult`, `ScanOptions`, `Status`, `Severity`.

A runnable example is in [`examples/scan-report.mjs`](examples/scan-report.mjs).

### Python

```python
from model_retire import scan, format_text

result = scan(["src"], warn_days=60)
print(format_text(result), end="")
```

The same functions in snake case: `scan(paths, cwd, today, warn_days, warn_only, ignore, include, gitignore, include_lockfiles, dataset, max_bytes)` returns a dict with the same keys as the JSON output, plus `format_text`, `format_json`, `format_github`, `format_list`, `default_dataset`, `load_dataset_file`, `validate_dataset`, `merge_datasets`, `create_matcher`, `assess`, `walk_files` and `UsageError`. `python -m model_retire` runs the CLI. See [`examples/scan_report.py`](examples/scan_report.py).

## How it works

1. **Walk.** Files under each path are listed, skipping `.git`, `.hg`, `.svn`, `node_modules`, `dist`, `build`, `vendor`, `.venv`, `venv`, `__pycache__`, `.tox`, `.mypy_cache`, `.pytest_cache` and `.next`, anything your `.gitignore` files exclude, and lockfiles (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `poetry.lock`, `uv.lock`, `Cargo.lock` and others). Symbolic links are not followed.
2. **Read.** Files over 1 MiB are skipped, and so is any file with a NUL byte in its first 8,000 bytes (treated as binary). Text is decoded as UTF-8; invalid bytes become U+FFFD and a leading BOM is dropped.
3. **Match.** Every ID and alias in the dataset is matched as an exact, case-sensitive string that must not have a letter, digit, `.`, `_` or `-` directly before or after it. So `gpt-4` matches `"gpt-4"` and `model=gpt-4`, but not `gpt-4o`, `gpt-4-turbo` or `gpt-4.1`; `claude-3-opus-20240229` matches only itself. Where two IDs could match at the same place, the longer one wins. Columns are counted in Unicode code points.
4. **Judge.** Each hit is checked against its dataset entry and the scan date (see Severity). When several providers list the same ID (for example `gemini-2.0-flash` on the Gemini API and on Vertex AI), there is one finding per provider, because their dates differ.

No runtime dependencies: file walking, matching, argument parsing (`node:util` `parseArgs`, Python `argparse`) and output use only the standard library.

### Limits

- It finds literal strings. An ID assembled at runtime (`"gpt-" + version`), read from an environment variable that is not in the repository, or stored in a database is not seen.
- It does not know which provider a file talks to. If your code says `gemini-2.5-pro` and you call the Gemini API, the Vertex AI finding for that ID does not apply to you; the provider is shown on every finding so you can tell.
- Comments and docs are scanned like code. Use `--ignore` for paths you do not want checked.
- Amazon Bedrock inference profile IDs such as `us.anthropic.claude-3-haiku-20240307-v1:0` are not matched, because the `.` before the base ID is a boundary character. The base ID itself is matched.
- Some OpenAI entries are model families (`gpt-realtime`, `gpt-4o-audio`). Only the family name itself is matched; dated snapshots of a family are found only when the provider lists them separately.
- The `.gitignore` support is a subset (see Globs): no global excludes file, no `.git/info/exclude`.

## The data

The dataset is the product, and it is only as good as its sources. [`data/models.json`](data/models.json) holds 328 model IDs, each with `provider`, `id`, optional `aliases`, `status`, `deprecated_on`, `retires_on`, `replacement`, `note`, the `source` URL it was read from and the `checked` date. The format is described by [`data/schema.json`](data/schema.json).

**Dates come from providers and can change; check the source link.** Providers move shutdown dates, and some publish them as "earliest possible" dates. Every finding carries the URL of the page its date came from.

| Provider key | Entries | Source |
|---|---|---|
| `openai` | 131 | [developers.openai.com/api/docs/deprecations](https://developers.openai.com/api/docs/deprecations) |
| `google-gemini-api` | 52 | [ai.google.dev/gemini-api/docs/deprecations](https://ai.google.dev/gemini-api/docs/deprecations) |
| `mistral` | 43 | [docs.mistral.ai/models](https://docs.mistral.ai/models) |
| `aws-bedrock` | 43 | [Amazon Bedrock model lifecycle (Legacy)](https://docs.aws.amazon.com/bedrock/latest/userguide/model-lifecycle-legacy.html) |
| `google-vertex-ai` | 28 | [Gemini Enterprise Agent Platform model versions](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/model-versions) (formerly Vertex AI) |
| `anthropic` | 21 | [platform.claude.com model deprecations](https://platform.claude.com/docs/en/about-claude/model-deprecations) |
| `cohere` | 10 | [docs.cohere.com/docs/deprecations](https://docs.cohere.com/docs/deprecations) |

### How it is sourced and verified

- Every entry was read from the provider's own deprecation or lifecycle page on the date in its `checked` field. Nothing comes from memory, blog posts or third-party trackers.
- After transcription, each entry's ID, aliases, dates and replacement were checked mechanically against the saved text of its source page.
- Where a page is ambiguous, the entry or the field is left out rather than guessed. Examples: OpenAI lists `gpt-4-1106-preview` and `code-davinci-002` twice with different dates, so they are omitted; Cohere's deprecated `command` and `summarize` and OpenAI's retired `ada`, `babbage`, `curie` and `davinci` are omitted because those words would match ordinary text.
- Qualifications on a date go in `note`: Gemini API dates are earliest possible shutdown dates, Bedrock dates apply per AWS Region, and Anthropic's dates apply to Anthropic-operated platforms (Bedrock and Google Cloud publish their own, listed under their own provider keys).
- `status` is `retired` when the provider says so or the shutdown date had passed on the `checked` date; the scanner also treats any reached `retires_on` as retired on the scan date.
- `npm run check-data` validates the schema, calendar dates, sort order, duplicate IDs and aliases, and status consistency. A weekly workflow fails when the data was last verified more than 45 days ago. It is a reminder for a person to re-read the sources; nothing edits the data automatically.

### Corrections

A wrong or missing date is a bug. Open an issue or a pull request with the **official source URL** (the provider's own documentation page, not a news article or a forum post) and the exact row it comes from. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Security reports: [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)

---

Maintained by [BYD Tech](https://bydtech.in), a software studio that builds MVPs, AI agents, and web & mobile apps.

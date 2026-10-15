# bydtech-model-retire

Find deprecated, retiring and retired LLM model IDs in a codebase before a provider shuts them off.

This is the Python package. The same tool is published to npm as
[`@bydtech/model-retire`](https://www.npmjs.com/package/@bydtech/model-retire); both
implementations ship the same dataset and produce identical output. The full documentation is in
the [repository README](https://github.com/BYDTechSolutions/model-retire#readme).

## Install

```sh
pip install bydtech-model-retire
```

Python 3.9 or later. No runtime dependencies.

## Quick start

```sh
model-retire .                      # scan the current directory
model-retire src --format json      # machine-readable output
model-retire list --provider openai # print the dataset for one provider
```

`python -m model_retire` works too.

Each hit is reported with file and line, the model, its status, the shutdown date, days remaining,
the provider's recommended replacement and the official page the date came from. The exit code is
0 when nothing is at error level, 1 when something is, 2 for a usage error.

## API

```python
from model_retire import scan, format_text

result = scan(["src"], warn_days=60)
print(format_text(result), end="")
if result["summary"]["errors"]:
    raise SystemExit(1)
```

`scan()` takes `paths`, `cwd`, `today`, `warn_days`, `warn_only`, `ignore`, `include`,
`gitignore`, `include_lockfiles`, `dataset` and `max_bytes`, and returns a dict with the same keys
as the JSON output (`version`, `today`, `warn_days`, `warn_only`, `files_scanned`, `summary`,
`findings`). Also exported: `default_dataset`, `load_dataset_file`, `merge_datasets`,
`validate_dataset`, `create_matcher`, `assess`, `format_text`, `format_json`, `format_github`,
`format_list`, `walk_files` and `UsageError`.

## The data

Dates come from providers and can change; check the source link on each finding. Every entry in
the dataset was read from the provider's own deprecation or lifecycle page and carries that page's
URL. Corrections are welcome as issues or pull requests with the official source URL.

## License

MIT. Maintained by [BYD Tech](https://bydtech.in), a software studio that builds MVPs, AI agents, and web & mobile apps.

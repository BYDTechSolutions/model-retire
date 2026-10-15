# Changelog

All notable changes to this project are documented in this file. The npm and
PyPI packages share version numbers and this changelog.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.1] - 2026-10-16

### Changed

- Releases are published from GitHub Actions through trusted publishing on npm
  and PyPI; the npm package carries a provenance attestation. No code changes.

## [0.1.0] - 2026-10-16

### Added

- `model-retire [paths...]`: finds exact deprecated or retired model ID strings, with a boundary rule so `gpt-4` never matches inside `gpt-4o` or `gpt-4-turbo`, and reports file, line, column, status, shutdown date, days remaining, replacement and source URL.
- Severity: retired is an error, a shutdown within `--warn-days` (default 90) is an error unless `--warn-only`, anything later or undated is a warning. Exit codes 0, 1 and 2.
- Output formats `text`, `json` and `github` (workflow annotations).
- Walking that skips common build and dependency directories, honors `.gitignore` files, skips lockfiles, binary files and files over 1 MiB, with `--ignore`, `--include`, `--no-gitignore` and `--include-lockfiles`.
- `model-retire list [--provider x]` and `--data` / `--no-default-data` for custom datasets.
- Dataset of 328 model IDs from OpenAI, Anthropic, the Gemini API, Vertex AI, Mistral, Cohere and Amazon Bedrock, each read from the provider's official page on 2026-10-16, with a JSON Schema and `npm run check-data`.
- Node package `@bydtech/model-retire` and Python package `bydtech-model-retire` with identical behavior, checked by `npm run parity`.

[Unreleased]: https://github.com/BYDTechSolutions/model-retire/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/BYDTechSolutions/model-retire/releases/tag/v0.1.1
[0.1.0]: https://github.com/BYDTechSolutions/model-retire/tree/e31a758d649a5345c89806ee049d5d166bb06fd9

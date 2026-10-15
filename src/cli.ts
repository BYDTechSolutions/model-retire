#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import pkg from '../package.json' with { type: 'json' };
import { defaultDataset, loadDatasetFile, mergeDatasets } from './data.js';
import { isValidDate, todayUtc } from './dates.js';
import { formatGithub, formatJson, formatList, formatText } from './format.js';
import { DEFAULT_WARN_DAYS, scan } from './scan.js';
import { UsageError, type Dataset } from './types.js';

const HELP = `Usage:
  model-retire [paths...] [options]     scan files for deprecated or retired model IDs
  model-retire list [options]           print the dataset

Scan options:
  -f, --format <text|json|github>  output format (default: text)
      --warn-days <n>              a shutdown within n days is an error (default: ${DEFAULT_WARN_DAYS})
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
`;

export interface CliIO {
  stdout: (s: string) => void;
  stderr: (s: string) => void;
  cwd?: string;
}

/** Runs the CLI with `argv` (without the node and script paths) and returns the exit code. */
export function run(argv: string[], io: CliIO): number {
  try {
    return main(argv, io);
  } catch (err) {
    if (err instanceof UsageError) {
      io.stderr(`model-retire: ${err.message}\n`);
      return 2;
    }
    throw err;
  }
}

function main(argv: string[], io: CliIO): number {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: true,
      options: {
        format: { type: 'string', short: 'f' },
        'warn-days': { type: 'string' },
        'warn-only': { type: 'boolean' },
        today: { type: 'string' },
        ignore: { type: 'string', multiple: true },
        include: { type: 'string', multiple: true },
        'no-gitignore': { type: 'boolean' },
        'include-lockfiles': { type: 'boolean' },
        provider: { type: 'string' },
        data: { type: 'string', multiple: true },
        'no-default-data': { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean' },
      },
    });
  } catch (err) {
    throw new UsageError(`${(err as Error).message}\nRun "model-retire --help" for usage.`);
  }
  const { values, positionals } = parsed;
  if (values.help) {
    io.stdout(HELP);
    return 0;
  }
  if (values.version) {
    io.stdout(`${pkg.version}\n`);
    return 0;
  }

  const today = values.today ?? todayUtc();
  if (!isValidDate(today)) throw new UsageError(`invalid --today "${today}": expected YYYY-MM-DD`);

  const sets: Dataset[] = values['no-default-data'] ? [] : [defaultDataset()];
  for (const file of values.data ?? []) sets.push(loadDatasetFile(resolve(io.cwd ?? process.cwd(), file)));
  if (sets.length === 0) throw new UsageError('--no-default-data needs at least one --data file');
  const dataset = mergeDatasets(...sets);

  if (positionals[0] === 'list') {
    return list(positionals.slice(1), values, dataset, today, io);
  }
  if (values.provider !== undefined) throw new UsageError('--provider is only valid with the list command');

  const format = values.format ?? 'text';
  if (format !== 'text' && format !== 'json' && format !== 'github') {
    throw new UsageError(`invalid --format "${format}": expected text, json or github`);
  }
  let warnDays = DEFAULT_WARN_DAYS;
  if (values['warn-days'] !== undefined) {
    if (!/^\d+$/.test(values['warn-days'])) {
      throw new UsageError(`invalid --warn-days "${values['warn-days']}": expected a whole number of days`);
    }
    warnDays = Number(values['warn-days']);
  }

  const result = scan({
    paths: positionals,
    cwd: io.cwd,
    today,
    warnDays,
    warnOnly: values['warn-only'] ?? false,
    ignore: values.ignore ?? [],
    include: values.include ?? [],
    gitignore: !values['no-gitignore'],
    includeLockfiles: values['include-lockfiles'] ?? false,
    dataset,
  });

  const out = format === 'json' ? formatJson(result) : format === 'github' ? formatGithub(result) : formatText(result);
  io.stdout(out);
  return result.summary.errors > 0 ? 1 : 0;
}

function list(
  extra: string[],
  values: { format?: string; provider?: string },
  dataset: Dataset,
  today: string,
  io: CliIO,
): number {
  if (extra.length > 0) throw new UsageError(`unexpected argument for list: ${extra[0]}`);
  const format = values.format ?? 'text';
  if (format !== 'text' && format !== 'json') {
    throw new UsageError(`invalid --format "${format}" for list: expected text or json`);
  }
  let selected = dataset;
  if (values.provider !== undefined) {
    const providers = [...new Set(dataset.models.map((m) => m.provider))].sort();
    if (!providers.includes(values.provider)) {
      throw new UsageError(`unknown provider "${values.provider}". Known: ${providers.join(', ')}`);
    }
    selected = { ...dataset, models: dataset.models.filter((m) => m.provider === values.provider) };
  }
  io.stdout(format === 'json' ? `${JSON.stringify(selected, null, 2)}\n` : formatList(selected, today));
  return 0;
}

function isMain(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) {
  process.exitCode = run(process.argv.slice(2), {
    stdout: (s) => process.stdout.write(s),
    stderr: (s) => process.stderr.write(s),
  });
}

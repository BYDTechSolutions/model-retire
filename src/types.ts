/** Lifecycle status of a model as recorded in the dataset. */
export type Status = 'deprecated' | 'retired';

/** Severity of a finding. `error` makes the CLI exit with code 1. */
export type Severity = 'error' | 'warning';

/** One deprecated or retired model, as published by its provider. */
export interface ModelEntry {
  /** Provider key, for example `openai`, `anthropic`, `google-vertex-ai`. */
  provider: string;
  /** The exact model ID string used in API calls. */
  id: string;
  /** Other exact strings that resolve to the same model (for example an undated alias). */
  aliases?: string[];
  /** Status as of the `checked` date. The scanner also treats a passed `retires_on` as retired. */
  status: Status;
  /** Date the provider announced the deprecation, `YYYY-MM-DD`. */
  deprecated_on?: string;
  /** Date the provider shuts the model off, `YYYY-MM-DD`. */
  retires_on?: string;
  /** The replacement the provider recommends, as written by the provider. */
  replacement?: string;
  /** Anything the provider's page qualifies the dates with. */
  note?: string;
  /** The official page the entry was read from. Required in the bundled dataset. */
  source?: string;
  /** Date the entry was last checked against `source`, `YYYY-MM-DD`. */
  checked?: string;
}

/** A dataset file: `data/models.json` or a custom file passed with `--data`. */
export interface Dataset {
  /** Date the dataset was last verified as a whole, `YYYY-MM-DD`. */
  updated?: string;
  models: ModelEntry[];
}

/** One hit of a deprecated or retired model ID in a file. */
export interface Finding {
  /** Path relative to the working directory, with `/` separators. */
  file: string;
  /** 1-based line number. */
  line: number;
  /** 1-based column, counted in Unicode code points. */
  column: number;
  /** The exact string found (the ID or one of its aliases). */
  match: string;
  provider: string;
  /** The canonical model ID the match resolves to. */
  id: string;
  /** Status on the scan date: `retired` once `retires_on` has been reached. */
  status: Status;
  severity: Severity;
  deprecated_on: string | null;
  retires_on: string | null;
  /** Days from the scan date to `retires_on`; negative once passed, `null` without a date. */
  days_remaining: number | null;
  replacement: string | null;
  note: string | null;
  source: string | null;
}

/** Result of a scan. Serialized as-is by `--format json`. */
export interface ScanResult {
  version: 1;
  today: string;
  warn_days: number;
  warn_only: boolean;
  files_scanned: number;
  summary: { errors: number; warnings: number };
  findings: Finding[];
}

/** Options for {@link scan}. Every field is optional. */
export interface ScanOptions {
  /** Files or directories to scan. Default `["."]`. */
  paths?: string[];
  /** Directory that paths are resolved against and reported relative to. Default `process.cwd()`. */
  cwd?: string;
  /** Scan date, `YYYY-MM-DD`. Default: today in UTC. */
  today?: string;
  /** A dated model within this many days is an error (unless `warnOnly`). Default 90. */
  warnDays?: number;
  /** Report models that are scheduled but not yet retired as warnings. Default false. */
  warnOnly?: boolean;
  /** Extra ignore globs (gitignore syntax). */
  ignore?: string[];
  /** When set, only files matching one of these globs are scanned. */
  include?: string[];
  /** Read `.gitignore` files while walking. Default true. */
  gitignore?: boolean;
  /** Scan lockfiles too (they are skipped by default). Default false. */
  includeLockfiles?: boolean;
  /** Dataset to match against. Default: the bundled dataset. */
  dataset?: Dataset;
  /** Files larger than this are skipped. Default 1 MiB. */
  maxBytes?: number;
}

/** Thrown for invalid options, unreadable data files and missing paths. The CLI exits with code 2. */
export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

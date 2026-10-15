import { lstatSync, readFileSync, statSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { defaultDataset } from './data.js';
import { daysBetween, isValidDate, todayUtc } from './dates.js';
import { createMatcher } from './match.js';
import {
  UsageError,
  type Finding,
  type ModelEntry,
  type ScanOptions,
  type ScanResult,
  type Severity,
  type Status,
} from './types.js';
import { walkFiles } from './walk.js';

/** Default number of days before a shutdown date at which a model becomes an error. */
export const DEFAULT_WARN_DAYS = 90;
/** Files larger than this many bytes are skipped. */
export const DEFAULT_MAX_BYTES = 1024 * 1024;
const SNIFF_BYTES = 8000;

/** Status, severity and days remaining for one entry on a given date. */
export interface Assessment {
  status: Status;
  severity: Severity;
  days_remaining: number | null;
}

/**
 * Decides how serious a model is on `today`:
 * retired (status `retired` or shutdown date reached) is an error; a shutdown
 * within `warnDays` is an error unless `warnOnly`; anything later, or a
 * deprecation without a date, is a warning.
 */
export function assess(entry: ModelEntry, today: string, warnDays: number, warnOnly: boolean): Assessment {
  const days = entry.retires_on !== undefined ? daysBetween(today, entry.retires_on) : null;
  if (entry.status === 'retired' || (days !== null && days <= 0)) {
    return { status: 'retired', severity: 'error', days_remaining: days };
  }
  if (days !== null && days <= warnDays && !warnOnly) {
    return { status: 'deprecated', severity: 'error', days_remaining: days };
  }
  return { status: 'deprecated', severity: 'warning', days_remaining: days };
}

function toPosix(p: string): string {
  return sep === '/' ? p : p.split(sep).join('/');
}

/** Decodes file bytes as UTF-8 (invalid bytes become U+FFFD, a leading BOM is dropped). Returns null for binary data. */
export function decodeText(buf: Uint8Array): string | null {
  const sniff = buf.subarray(0, SNIFF_BYTES);
  if (sniff.includes(0)) return null;
  return new TextDecoder('utf-8').decode(buf);
}

/** Orders findings by file, line, column, provider, id. */
export function compareFindings(a: Finding, b: Finding): number {
  if (a.file !== b.file) return a.file < b.file ? -1 : 1;
  if (a.line !== b.line) return a.line - b.line;
  if (a.column !== b.column) return a.column - b.column;
  if (a.provider !== b.provider) return a.provider < b.provider ? -1 : 1;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}

/**
 * Scans files and directories for deprecated or retired model IDs.
 * Throws {@link UsageError} for an invalid date or a path that does not exist.
 */
export function scan(options: ScanOptions = {}): ScanResult {
  const cwd = resolve(options.cwd ?? process.cwd());
  const today = options.today ?? todayUtc();
  if (!isValidDate(today)) throw new UsageError(`invalid --today "${today}": expected YYYY-MM-DD`);
  const warnDays = options.warnDays ?? DEFAULT_WARN_DAYS;
  if (!Number.isInteger(warnDays) || warnDays < 0) {
    throw new UsageError(`invalid --warn-days "${warnDays}": expected a whole number of days`);
  }
  const warnOnly = options.warnOnly ?? false;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const dataset = options.dataset ?? defaultDataset();
  const matcher = createMatcher(dataset.models);
  const walkOpts = {
    ignore: options.ignore ?? [],
    include: options.include ?? [],
    gitignore: options.gitignore ?? true,
    includeLockfiles: options.includeLockfiles ?? false,
  };

  const files: string[] = [];
  const seen = new Set<string>();
  for (const p of options.paths && options.paths.length > 0 ? options.paths : ['.']) {
    const abs = resolve(cwd, p);
    let st;
    try {
      st = statSync(abs);
    } catch {
      throw new UsageError(`path not found: ${p}`);
    }
    const list = st.isDirectory() ? walkFiles(abs, walkOpts) : [abs];
    for (const f of list) {
      if (!seen.has(f)) {
        seen.add(f);
        files.push(f);
      }
    }
  }

  const findings: Finding[] = [];
  let filesScanned = 0;
  for (const abs of files) {
    let size: number;
    try {
      size = lstatSync(abs).size;
    } catch {
      continue;
    }
    if (size > maxBytes) continue;
    let buf: Buffer;
    try {
      buf = readFileSync(abs);
    } catch {
      continue;
    }
    const text = decodeText(buf);
    if (text === null) continue;
    filesScanned += 1;
    const file = toPosix(relative(cwd, abs));
    const lines = text.split('\n');
    lines.forEach((rawLine, idx) => {
      const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
      for (const hit of matcher.findInLine(line)) {
        for (const entry of matcher.entriesFor(hit.match)) {
          const a = assess(entry, today, warnDays, warnOnly);
          findings.push({
            file,
            line: idx + 1,
            column: hit.column,
            match: hit.match,
            provider: entry.provider,
            id: entry.id,
            status: a.status,
            severity: a.severity,
            deprecated_on: entry.deprecated_on ?? null,
            retires_on: entry.retires_on ?? null,
            days_remaining: a.days_remaining,
            replacement: entry.replacement ?? null,
            note: entry.note ?? null,
            source: entry.source ?? null,
          });
        }
      }
    });
  }

  findings.sort(compareFindings);
  const errors = findings.filter((f) => f.severity === 'error').length;
  return {
    version: 1,
    today,
    warn_days: warnDays,
    warn_only: warnOnly,
    files_scanned: filesScanned,
    summary: { errors, warnings: findings.length - errors },
    findings,
  };
}

import { UsageError } from './types.js';

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

/** True when `s` is a real calendar date written as `YYYY-MM-DD`. */
export function isValidDate(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1) return false;
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

/** Days since 1970-01-01 for a `YYYY-MM-DD` date. Throws {@link UsageError} on an invalid date. */
export function dayNumber(s: string): number {
  if (!isValidDate(s)) throw new UsageError(`invalid date "${s}": expected YYYY-MM-DD`);
  const [y, mo, d] = s.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, mo - 1, d) / DAY_MS;
}

/** Today's date in UTC as `YYYY-MM-DD`. */
export function todayUtc(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

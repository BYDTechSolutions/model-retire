import type { ModelEntry } from './types.js';

/** Characters that may not touch a match on either side. */
export const BOUNDARY_CLASS = '[A-Za-z0-9._-]';

/** A hit of one model string inside a line. */
export interface LineMatch {
  /** 1-based column in Unicode code points. */
  column: number;
  /** The exact string found. */
  match: string;
}

/** Finds model ID strings in text and maps them back to dataset entries. */
export interface Matcher {
  /** All non-overlapping hits in one line, left to right. */
  findInLine(line: string): LineMatch[];
  /** Entries a matched string resolves to (several when providers share an ID). */
  entriesFor(match: string): ModelEntry[];
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');
}

/** Sorts the strings longest first, then by code unit order, so the longest string wins at a position. */
export function orderPatterns(strings: Iterable<string>): string[] {
  return [...strings].sort((a, b) => b.length - a.length || (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Builds a matcher for the IDs and aliases of `models`. A hit must not have
 * `[A-Za-z0-9._-]` directly before or after it, so `gpt-4` does not match
 * inside `gpt-4o`, `gpt-4-turbo` or `gpt-4.1`. Matching is case-sensitive.
 */
export function createMatcher(models: readonly ModelEntry[]): Matcher {
  const map = new Map<string, ModelEntry[]>();
  for (const m of models) {
    for (const s of [m.id, ...(m.aliases ?? [])]) {
      const list = map.get(s);
      if (!list) map.set(s, [m]);
      else if (!list.includes(m)) list.push(m);
    }
  }
  const patterns = orderPatterns(map.keys());
  const re =
    patterns.length === 0
      ? null
      : new RegExp(
          `(?<!${BOUNDARY_CLASS})(?:${patterns.map(escapeRegExp).join('|')})(?!${BOUNDARY_CLASS})`,
          'g',
        );

  return {
    findInLine(line: string): LineMatch[] {
      if (!re) return [];
      const out: LineMatch[] = [];
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(line)) !== null) {
        out.push({ column: Array.from(line.slice(0, m.index)).length + 1, match: m[0] });
      }
      return out;
    },
    entriesFor(match: string): ModelEntry[] {
      return map.get(match) ?? [];
    },
  };
}

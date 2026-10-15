import { readFileSync } from 'node:fs';
import bundled from '../data/models.json' with { type: 'json' };
import { isValidDate } from './dates.js';
import { UsageError, type Dataset, type ModelEntry } from './types.js';

/** The dataset bundled with this version of the package. */
export function defaultDataset(): Dataset {
  return bundled as unknown as Dataset;
}

const DATE_FIELDS = ['deprecated_on', 'retires_on', 'checked'] as const;
const STRING_FIELDS = ['replacement', 'note', 'source'] as const;

/**
 * Checks the shape of a parsed dataset and returns it typed.
 * Throws {@link UsageError} naming the first problem found.
 */
export function validateDataset(value: unknown, label = 'dataset'): Dataset {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new UsageError(`${label}: expected an object with a "models" array`);
  }
  const obj = value as Record<string, unknown>;
  if (obj.updated !== undefined && !isValidDate(obj.updated)) {
    throw new UsageError(`${label}: "updated" must be a YYYY-MM-DD date`);
  }
  if (!Array.isArray(obj.models)) {
    throw new UsageError(`${label}: expected an object with a "models" array`);
  }
  obj.models.forEach((raw, i) => {
    const where = `${label}: models[${i}]`;
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      throw new UsageError(`${where} must be an object`);
    }
    const e = raw as Record<string, unknown>;
    for (const key of ['provider', 'id'] as const) {
      if (typeof e[key] !== 'string' || e[key] === '') {
        throw new UsageError(`${where}.${key} must be a non-empty string`);
      }
    }
    if (e.status !== 'deprecated' && e.status !== 'retired') {
      throw new UsageError(`${where}.status must be "deprecated" or "retired"`);
    }
    if (e.aliases !== undefined) {
      if (!Array.isArray(e.aliases) || e.aliases.some((a) => typeof a !== 'string' || a === '')) {
        throw new UsageError(`${where}.aliases must be an array of non-empty strings`);
      }
    }
    for (const key of DATE_FIELDS) {
      if (e[key] !== undefined && !isValidDate(e[key])) {
        throw new UsageError(`${where}.${key} must be a YYYY-MM-DD date`);
      }
    }
    for (const key of STRING_FIELDS) {
      if (e[key] !== undefined && typeof e[key] !== 'string') {
        throw new UsageError(`${where}.${key} must be a string`);
      }
    }
  });
  return obj as unknown as Dataset;
}

/** Reads and validates a dataset file. Throws {@link UsageError} when it is missing or malformed. */
export function loadDatasetFile(file: string): Dataset {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    throw new UsageError(`cannot read data file: ${file}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new UsageError(`data file is not valid JSON: ${file}`);
  }
  return validateDataset(parsed, file);
}

function key(e: ModelEntry): string {
  return `${e.provider}\u0000${e.id}`;
}

function compareEntries(a: ModelEntry, b: ModelEntry): number {
  if (a.provider !== b.provider) return a.provider < b.provider ? -1 : 1;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}

/**
 * Merges datasets left to right. An entry with the same provider and id as an
 * earlier one replaces it. The result is sorted by provider, then id.
 */
export function mergeDatasets(...sets: Dataset[]): Dataset {
  const byKey = new Map<string, ModelEntry>();
  let updated: string | undefined;
  for (const set of sets) {
    if (set.updated !== undefined && (updated === undefined || set.updated < updated)) {
      updated = set.updated;
    }
    for (const e of set.models) byKey.set(key(e), e);
  }
  const models = [...byKey.values()].sort(compareEntries);
  return updated === undefined ? { models } : { updated, models };
}

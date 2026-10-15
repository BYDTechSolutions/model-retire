import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkData } from '../scripts/check-data.mjs';
import { createMatcher, defaultDataset, mergeDatasets, validateDataset, type Dataset } from '../src/index.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const raw = readFileSync(join(root, 'data/models.json'), 'utf8');
const data = JSON.parse(raw);
const schema = JSON.parse(readFileSync(join(root, 'data/schema.json'), 'utf8'));
const today = data.updated;

describe('data/models.json', () => {
  it('passes the schema and every consistency check', () => {
    expect(checkData(data, schema, { today })).toEqual([]);
  });

  it('is what the package bundles', () => {
    expect(defaultDataset()).toEqual(data);
  });

  it('has a source and a checked date on every entry', () => {
    for (const m of data.models) {
      expect(m.source, m.id).toMatch(/^https:\/\//);
      expect(m.checked, m.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('never lets one listed ID match inside another listed ID', () => {
    const matcher = createMatcher(data.models);
    for (const m of data.models) {
      for (const s of [m.id, ...(m.aliases ?? [])]) {
        expect(matcher.findInLine(s).map((h) => h.match), s).toEqual([s]);
      }
    }
  });

  it('is identical to the copy shipped in the Python package', () => {
    const copy = join(root, 'python/src/model_retire/models.json');
    expect(existsSync(copy)).toBe(true);
    expect(readFileSync(copy, 'utf8')).toBe(raw);
  });
});

describe('checkData', () => {
  const base = () => JSON.parse(raw);

  it('rejects unsorted entries and duplicates', () => {
    const d = base();
    [d.models[0], d.models[1]] = [d.models[1], d.models[0]];
    expect(checkData(d, schema, { today }).join('\n')).toContain('not sorted');
    const e = base();
    e.models.splice(1, 0, structuredClone(e.models[0]));
    expect(checkData(e, schema, { today }).join('\n')).toContain('duplicate');
  });

  it('rejects an alias already used by another entry of the same provider', () => {
    const d = base();
    const [a, b] = d.models.filter((m: { provider: string }) => m.provider === 'anthropic');
    b.aliases = [a.id];
    expect(checkData(d, schema, { today }).join('\n')).toContain('is already used by');
  });

  it('rejects impossible dates, a missing source and a stale status', () => {
    const d = base();
    d.models[0].retires_on = '2026-02-30';
    expect(checkData(d, schema, { today }).join('\n')).toContain('not a calendar date');
    const s = base();
    delete s.models[0].source;
    expect(checkData(s, schema, { today }).join('\n')).toContain('schema');
    const t = base();
    const m = t.models.find((x: { status: string; retires_on?: string }) => x.status === 'retired' && x.retires_on);
    m.status = 'deprecated';
    expect(checkData(t, schema, { today }).join('\n')).toContain('status must be "retired"');
  });

  it('fails when the data is older than --max-age', () => {
    expect(checkData(data, schema, { today, maxAge: 45 })).toEqual([]);
    const later = new Date(Date.parse(`${today}T00:00:00Z`) + 46 * 86_400_000).toISOString().slice(0, 10);
    expect(checkData(data, schema, { today: later, maxAge: 45 }).join('\n')).toContain('days old');
  });
});

describe('validateDataset and mergeDatasets', () => {
  it('rejects malformed custom data', () => {
    expect(() => validateDataset({})).toThrow(/models/);
    expect(() => validateDataset({ models: [{ provider: 'p', id: '', status: 'retired' }] })).toThrow(/id/);
    expect(() => validateDataset({ models: [{ provider: 'p', id: 'x', status: 'retired', retires_on: '2026-1-1' }] })).toThrow(/retires_on/);
    expect(() => validateDataset({ models: [{ provider: 'p', id: 'x', status: 'retired', aliases: [1] }] })).toThrow(/aliases/);
  });

  it('replaces entries with the same provider and id, and sorts the result', () => {
    const a: Dataset = { updated: '2026-10-16', models: [{ provider: 'b', id: 'x', status: 'deprecated' }] };
    const b: Dataset = {
      models: [
        { provider: 'b', id: 'x', status: 'retired' },
        { provider: 'a', id: 'y', status: 'deprecated' },
      ],
    };
    expect(mergeDatasets(a, b)).toEqual({
      updated: '2026-10-16',
      models: [
        { provider: 'a', id: 'y', status: 'deprecated' },
        { provider: 'b', id: 'x', status: 'retired' },
      ],
    });
  });
});

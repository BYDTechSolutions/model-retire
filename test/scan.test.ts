import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { assess, loadDatasetFile, scan, UsageError, type Dataset, type ModelEntry } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, 'fixtures');

const dataset: Dataset = {
  models: [
    { provider: 'p', id: 'old-model', status: 'retired', retires_on: '2026-01-01', source: 'https://example.com' },
    { provider: 'p', id: 'soon-model', status: 'deprecated', retires_on: '2026-11-01' },
    { provider: 'p', id: 'later-model', status: 'deprecated', retires_on: '2027-06-01' },
    { provider: 'p', id: 'undated-model', status: 'deprecated' },
  ],
};

const dirs: string[] = [];
function project(files: Record<string, string | Buffer>): string {
  const root = mkdtempSync(join(tmpdir(), 'model-retire-'));
  dirs.push(root);
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, body);
  }
  return root;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const files = (root: string, extra: Parameters<typeof scan>[0] = {}) =>
  [...new Set(scan({ cwd: root, today: '2026-10-16', dataset, ...extra }).findings.map((f) => f.file))];

describe('assess', () => {
  const e = (over: Partial<ModelEntry>): ModelEntry => ({ provider: 'p', id: 'm', status: 'deprecated', ...over });

  it('treats a passed shutdown date as retired, even if the data says deprecated', () => {
    expect(assess(e({ retires_on: '2026-10-01' }), '2026-10-16', 90, false)).toEqual({
      status: 'retired',
      severity: 'error',
      days_remaining: -15,
    });
  });

  it('treats the shutdown day itself as retired', () => {
    expect(assess(e({ retires_on: '2026-10-16' }), '2026-10-16', 90, false)).toMatchObject({ status: 'retired', days_remaining: 0 });
  });

  it('keeps a retired entry without a date retired', () => {
    expect(assess(e({ status: 'retired' }), '2026-10-16', 90, false)).toEqual({ status: 'retired', severity: 'error', days_remaining: null });
  });

  it('is an error within warn-days and a warning beyond', () => {
    expect(assess(e({ retires_on: '2026-11-15' }), '2026-10-16', 30, false).severity).toBe('error');
    expect(assess(e({ retires_on: '2026-11-16' }), '2026-10-16', 30, false).severity).toBe('warning');
    expect(assess(e({ retires_on: '2026-11-16' }), '2026-10-16', 31, false).severity).toBe('error');
  });

  it('downgrades scheduled shutdowns with warnOnly, but never a retired model', () => {
    expect(assess(e({ retires_on: '2026-10-20' }), '2026-10-16', 90, true).severity).toBe('warning');
    expect(assess(e({ retires_on: '2026-10-01' }), '2026-10-16', 90, true).severity).toBe('error');
  });

  it('is a warning for a deprecation without a date', () => {
    expect(assess(e({}), '2026-10-16', 90, false)).toEqual({ status: 'deprecated', severity: 'warning', days_remaining: null });
  });
});

describe('scan', () => {
  it('reports file, line, column and lifecycle fields', () => {
    const root = project({ 'a.py': 'x = 1\nm = "old-model"\n' });
    const r = scan({ cwd: root, today: '2026-10-16', dataset });
    expect(r.findings).toEqual([
      {
        file: 'a.py',
        line: 2,
        column: 6,
        match: 'old-model',
        provider: 'p',
        id: 'old-model',
        status: 'retired',
        severity: 'error',
        deprecated_on: null,
        retires_on: '2026-01-01',
        days_remaining: -288,
        replacement: null,
        note: null,
        source: 'https://example.com',
      },
    ]);
    expect(r.summary).toEqual({ errors: 1, warnings: 0 });
    expect(r.files_scanned).toBe(1);
  });

  it('applies warn-days and warn-only', () => {
    const root = project({ 'a.ts': 'soon-model later-model undated-model' });
    const sev = (o: Parameters<typeof scan>[0]) =>
      scan({ cwd: root, today: '2026-10-16', dataset, ...o }).findings.map((f) => `${f.id}:${f.severity}`);
    expect(sev({})).toEqual(['soon-model:error', 'later-model:warning', 'undated-model:warning']);
    expect(sev({ warnDays: 10 })).toEqual(['soon-model:warning', 'later-model:warning', 'undated-model:warning']);
    expect(sev({ warnOnly: true })).toEqual(['soon-model:warning', 'later-model:warning', 'undated-model:warning']);
    expect(sev({ warnDays: 365 })).toEqual(['soon-model:error', 'later-model:error', 'undated-model:warning']);
  });

  it('handles CRLF line endings and a UTF-8 BOM', () => {
    const root = project({ 'a.txt': '﻿old-model\r\nx old-model\r\n' });
    const r = scan({ cwd: root, today: '2026-10-16', dataset });
    expect(r.findings.map((f) => [f.line, f.column])).toEqual([
      [1, 1],
      [2, 3],
    ]);
  });

  it('skips the default directories', () => {
    const root = project({
      'src/a.ts': 'old-model',
      'node_modules/x/a.js': 'old-model',
      '.git/config': 'old-model',
      'dist/a.js': 'old-model',
      'build/a.js': 'old-model',
      '.venv/a.py': 'old-model',
      'venv/a.py': 'old-model',
      '__pycache__/a.py': 'old-model',
      'vendor/a.go': 'old-model',
    });
    expect(files(root)).toEqual(['src/a.ts']);
  });

  it('skips lockfiles unless asked', () => {
    const root = project({ 'package-lock.json': 'old-model', 'yarn.lock': 'old-model', 'a.ts': 'old-model' });
    expect(files(root)).toEqual(['a.ts']);
    expect(files(root, { includeLockfiles: true })).toEqual(['a.ts', 'package-lock.json', 'yarn.lock']);
  });

  it('honors .gitignore, nested .gitignore files and negation', () => {
    const root = project({
      '.gitignore': 'out/\n*.log\n!keep.log\n',
      'out/a.ts': 'old-model',
      'debug.log': 'old-model',
      'keep.log': 'old-model',
      'pkg/.gitignore': 'local.ts\n',
      'pkg/local.ts': 'old-model',
      'pkg/main.ts': 'old-model',
      'main.ts': 'old-model',
    });
    expect(files(root)).toEqual(['keep.log', 'main.ts', 'pkg/main.ts']);
    expect(files(root, { gitignore: false })).toEqual(['debug.log', 'keep.log', 'main.ts', 'out/a.ts', 'pkg/local.ts', 'pkg/main.ts']);
  });

  it('applies --ignore and --include globs', () => {
    const root = project({ 'src/a.ts': 'old-model', 'src/a.test.ts': 'old-model', 'docs/a.md': 'old-model' });
    expect(files(root, { ignore: ['*.test.ts'] })).toEqual(['docs/a.md', 'src/a.ts']);
    expect(files(root, { ignore: ['docs/'] })).toEqual(['src/a.test.ts', 'src/a.ts']);
    expect(files(root, { include: ['*.md'] })).toEqual(['docs/a.md']);
    expect(files(root, { include: ['src/**'], ignore: ['*.test.ts'] })).toEqual(['src/a.ts']);
  });

  it('skips binary files and files over the size limit', () => {
    const root = project({
      'bin.dat': Buffer.from([0x6f, 0x00, 0x01, ...Buffer.from(' old-model')]),
      'big.txt': `old-model\n${'x'.repeat(1024 * 1024)}`,
      'ok.txt': 'old-model',
    });
    const r = scan({ cwd: root, today: '2026-10-16', dataset });
    expect(r.findings.map((f) => f.file)).toEqual(['ok.txt']);
    expect(r.files_scanned).toBe(1);
    expect(files(root, { maxBytes: 4 * 1024 * 1024 })).toEqual(['big.txt', 'ok.txt']);
  });

  it('does not follow symbolic links', () => {
    const root = project({ 'real/a.ts': 'old-model' });
    symlinkSync(join(root, 'real'), join(root, 'link'));
    symlinkSync(join(root, 'real/a.ts'), join(root, 'b.ts'));
    expect(files(root)).toEqual(['real/a.ts']);
  });

  it('scans an explicitly named file even inside a skipped directory', () => {
    const root = project({ 'node_modules/x.js': 'old-model' });
    expect(files(root, { paths: ['node_modules/x.js'] })).toEqual(['node_modules/x.js']);
  });

  it('reports paths relative to the working directory', () => {
    const root = project({ 'pkg/src/a.ts': 'old-model' });
    expect(files(join(root, 'pkg'), { paths: ['src'] })).toEqual(['src/a.ts']);
    expect(files(join(root, 'pkg'), { paths: ['.'] })).toEqual(['src/a.ts']);
  });

  it('throws UsageError for a missing path or a bad date', () => {
    const root = project({ 'a.ts': '' });
    expect(() => scan({ cwd: root, paths: ['nope'], dataset })).toThrow(UsageError);
    expect(() => scan({ cwd: root, today: '2026-02-30', dataset })).toThrow(UsageError);
    expect(() => scan({ cwd: root, warnDays: -1, dataset })).toThrow(UsageError);
  });

  it('uses the bundled dataset by default', () => {
    const root = project({ 'a.ts': 'const m = "claude-3-opus-20240229";' });
    const r = scan({ cwd: root, today: '2026-10-16' });
    expect(r.findings.map((f) => `${f.provider}/${f.id}`)).toEqual(['anthropic/claude-3-opus-20240229']);
  });
});

describe('shared fixture', () => {
  it('produces the expected JSON (the Python package checks the same file)', () => {
    const r = scan({
      cwd: join(fixtures, 'project'),
      today: '2026-10-16',
      dataset: loadDatasetFile(join(fixtures, 'models.json')),
    });
    expect(r).toEqual(JSON.parse(readFileSync(join(fixtures, 'expected.json'), 'utf8')));
  });
});

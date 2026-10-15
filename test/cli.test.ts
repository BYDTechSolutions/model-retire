import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { run } from '../src/cli.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, 'fixtures');
const project = join(fixtures, 'project');
const fixtureData = ['--no-default-data', '--data', join(fixtures, 'models.json'), '--today', '2026-10-16'];

function cli(args: string[], cwd = project) {
  let stdout = '';
  let stderr = '';
  const code = run(args, { stdout: (s) => (stdout += s), stderr: (s) => (stderr += s), cwd });
  return { code, stdout, stderr };
}

const tmp: string[] = [];
function dir(files: Record<string, string>): string {
  const d = mkdtempSync(join(tmpdir(), 'model-retire-cli-'));
  tmp.push(d);
  for (const [k, v] of Object.entries(files)) writeFileSync(join(d, k), v);
  return d;
}
afterEach(() => {
  for (const d of tmp.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('exit codes', () => {
  it('exits 1 when errors are found', () => {
    expect(cli(fixtureData).code).toBe(1);
  });

  it('exits 0 when only warnings remain', () => {
    const d = dir({ 'a.ts': '"claude-mythos-preview"' });
    const r = cli(['--today', '2026-10-16'], d);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('warning');
  });

  it('exits 0 with --warn-only when nothing is retired yet', () => {
    const d = dir({ 'a.ts': '"claude-sonnet-4-5-20250929"' });
    expect(cli(['--today', '2026-10-16'], d).code).toBe(1);
    expect(cli(['--today', '2026-10-16', '--warn-only'], d).code).toBe(0);
    expect(cli(['--today', '2026-10-16', '--warn-days', '30'], d).code).toBe(0);
  });

  it('exits 0 and says so when nothing is found', () => {
    const d = dir({ 'a.ts': '"gpt-4o"' });
    const r = cli(['--today', '2026-10-16'], d);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe('No deprecated or retired model IDs found. Scanned 1 file.\n');
  });

  it.each([
    [['--format', 'xml']],
    [['--warn-days', 'ten']],
    [['--warn-days', '-1']],
    [['--today', '2026-13-01']],
    [['--bogus']],
    [['missing-path']],
    [['--provider', 'openai']],
    [['--data', 'nope.json']],
    [['--no-default-data']],
    [['list', 'extra']],
    [['list', '--provider', 'nobody']],
    [['list', '--format', 'github']],
  ])('exits 2 for %j', (args) => {
    const r = cli(args);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/^model-retire: /);
    expect(r.stdout).toBe('');
  });

  it('exits 2 for a malformed data file', () => {
    const d = dir({ 'bad.json': '{"models":[{"provider":"x","id":"y","status":"gone"}]}', 'broken.json': '{' });
    expect(cli(['--data', join(d, 'bad.json')], d).stderr).toContain('status must be');
    expect(cli(['--data', join(d, 'broken.json')], d).code).toBe(2);
  });
});

describe('formats', () => {
  it('prints text grouped by file with a summary', () => {
    const r = cli(fixtureData);
    expect(r.stdout).toContain('src/agent.py\n  2:8     error    anthropic claude-3-opus-20240229: retired 2026-01-05 (284 days ago)\n');
    expect(r.stdout).toContain('                   replacement: claude-opus-4-8\n');
    expect(r.stdout).toContain('openai gpt-4-0613 (as "gpt-4"): retires 2026-10-23 (in 7 days)');
    expect(r.stdout).toMatch(/22 problems \(19 errors, 3 warnings\) in 10 files\. Scanned 11 files\.\n$/);
  });

  it('prints JSON', () => {
    const r = cli([...fixtureData, '--format', 'json']);
    const json = JSON.parse(r.stdout);
    expect(json.version).toBe(1);
    expect(json.today).toBe('2026-10-16');
    expect(json.summary).toEqual({ errors: 19, warnings: 3 });
  });

  it('prints GitHub annotations with escaped properties', () => {
    const r = cli([...fixtureData, '-f', 'github']);
    const lines = r.stdout.trimEnd().split('\n');
    expect(lines).toContain(
      '::error file=src/agent.py,line=2,col=8,title=Retired model ID claude-3-opus-20240229::anthropic claude-3-opus-20240229: retired 2026-01-05 (284 days ago). Replacement: claude-opus-4-8. Source: https://platform.claude.com/docs/en/about-claude/model-deprecations',
    );
    expect(lines.some((l) => l.startsWith('::warning file=src/agent.py,line=4,col=12,title=Deprecated model ID claude-mythos-preview::'))).toBe(true);
    expect(lines.some((l) => l.includes('title=Retired model ID anthropic.claude-3-haiku-20240307-v1%3A0::'))).toBe(true);
    expect(lines.at(-1)).toBe('model-retire: 19 errors, 3 warnings. Scanned 11 files.');
  });
});

describe('scan options', () => {
  it('skips lockfiles unless --include-lockfiles', () => {
    const a = JSON.parse(cli([...fixtureData, '-f', 'json']).stdout);
    const b = JSON.parse(cli([...fixtureData, '-f', 'json', '--include-lockfiles']).stdout);
    expect(a.findings.some((f: { file: string }) => f.file === 'package-lock.json')).toBe(false);
    expect(b.findings.some((f: { file: string }) => f.file === 'package-lock.json')).toBe(true);
  });

  it('reads .gitignore unless --no-gitignore', () => {
    const files = (args: string[]) =>
      new Set(JSON.parse(cli([...fixtureData, '-f', 'json', ...args]).stdout).findings.map((f: { file: string }) => f.file));
    expect(files([]).has('ignored/old.js')).toBe(false);
    expect(files([]).has('debug.log')).toBe(false);
    expect(files([]).has('keep.log')).toBe(true);
    expect(files(['--no-gitignore']).has('ignored/old.js')).toBe(true);
    expect(files(['--no-gitignore']).has('debug.log')).toBe(true);
  });

  it('accepts repeatable --ignore and --include', () => {
    const files = (args: string[]) =>
      [...new Set(JSON.parse(cli([...fixtureData, '-f', 'json', ...args]).stdout).findings.map((f: { file: string }) => f.file))];
    expect(files(['--include', '*.py'])).toEqual(['src/agent.py', 'src/vertex.py']);
    expect(files(['--include', '*.py', '--include', '*.yaml', '--ignore', 'vertex.py'])).toEqual(['config/models.yaml', 'src/agent.py']);
  });

  it('scans the paths it is given', () => {
    const json = JSON.parse(cli([...fixtureData, '-f', 'json', 'src/agent.py', 'config']).stdout);
    expect([...new Set(json.findings.map((f: { file: string }) => f.file))]).toEqual(['config/models.yaml', 'src/agent.py']);
  });
});

describe('data', () => {
  it('merges --data over the bundled dataset', () => {
    const d = dir({
      'a.ts': '"internal-model-v1" "claude-3-opus-20240229"',
      'extra.json': JSON.stringify({
        models: [
          { provider: 'internal', id: 'internal-model-v1', status: 'deprecated', retires_on: '2026-12-01' },
          { provider: 'anthropic', id: 'claude-3-opus-20240229', status: 'retired', replacement: 'custom-choice' },
        ],
      }),
    });
    const json = JSON.parse(cli(['--today', '2026-10-16', '--data', 'extra.json', '-f', 'json', 'a.ts'], d).stdout);
    expect(json.findings.map((f: { id: string; replacement: string | null; source: string | null }) => [f.id, f.replacement, f.source])).toEqual([
      ['internal-model-v1', null, null],
      ['claude-3-opus-20240229', 'custom-choice', null],
    ]);
  });
});

describe('list', () => {
  it('prints the dataset as a table', () => {
    const r = cli(['list', '--provider', 'anthropic', '--today', '2026-10-16']);
    expect(r.code).toBe(0);
    const lines = r.stdout.split('\n');
    expect(lines[0]).toMatch(/^PROVIDER\s+ID\s+STATUS\s+RETIRES\s+REPLACEMENT$/);
    expect(r.stdout).toMatch(/anthropic\s+claude-3-opus-20240229\s+retired\s+2026-01-05\s+claude-opus-4-8/);
    expect(r.stdout).toMatch(/anthropic\s+claude-mythos-preview\s+deprecated\s+-\s+-/);
    expect(r.stdout).not.toContain('openai');
    expect(r.stdout).toMatch(/\d+ models\. Data checked \d{4}-\d{2}-\d{2}\.\n$/);
  });

  it('prints JSON entries as stored', () => {
    const json = JSON.parse(cli(['list', '--provider', 'cohere', '-f', 'json']).stdout);
    expect(json.models.length).toBeGreaterThan(0);
    expect(json.models.every((m: { provider: string }) => m.provider === 'cohere')).toBe(true);
  });
});

describe('help and version', () => {
  it('prints help', () => {
    const r = cli(['--help']);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('Usage:');
  });

  it('prints the package version', () => {
    expect(cli(['--version']).stdout).toMatch(/^\d+\.\d+\.\d+\n$/);
  });
});

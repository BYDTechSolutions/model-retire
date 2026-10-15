#!/usr/bin/env node
// Runs the Node CLI (dist/cli.js) and the Python CLI (python -m model_retire)
// with the same arguments over test/fixtures/project and fails on any
// difference in stdout or exit code. Build first: npm run build.
// The Python interpreter comes from $PYTHON (default python3).
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const project = join(root, 'test/fixtures/project');
const nodeCli = join(root, 'dist/cli.js');
const python = process.env.PYTHON ?? 'python3';
if (!existsSync(nodeCli)) {
  console.error('parity: dist/cli.js not found. Run npm run build first.');
  process.exit(2);
}

const day = ['--today', '2026-10-16'];
const cases = [
  [...day, '-f', 'json'],
  [...day, '-f', 'text'],
  [...day, '-f', 'github'],
  [...day, '-f', 'json', '--warn-only'],
  [...day, '-f', 'json', '--warn-days', '10'],
  [...day, '-f', 'json', '--no-gitignore', '--include-lockfiles'],
  [...day, '-f', 'json', '--include', '*.py', '--include', 'config/**'],
  [...day, '-f', 'json', '--ignore', 'src/', '--ignore', '*.md'],
  [...day, '-f', 'json', 'src/agent.py', 'config'],
  [...day, '-f', 'json', '--no-default-data', '--data', '../models.json'],
  ['--today', '2027-06-01', '-f', 'json'],
  ['list', ...day],
  ['list', '--provider', 'mistral', ...day],
  ['list', '-f', 'json'],
  [...day, '--format', 'nope'],
  [...day, 'missing-path'],
];

let failed = 0;
for (const args of cases) {
  const n = spawnSync(process.execPath, [nodeCli, ...args], { cwd: project, encoding: 'utf8' });
  const p = spawnSync(python, ['-m', 'model_retire', ...args], {
    cwd: project,
    encoding: 'utf8',
    env: { ...process.env, PYTHONPATH: join(root, 'python/src'), PYTHONIOENCODING: 'utf-8' },
  });
  const same = n.status === p.status && n.stdout === p.stdout;
  console.log(`${same ? 'same' : 'DIFF'}  exit ${n.status}/${p.status}  ${args.join(' ')}`);
  if (!same) {
    failed += 1;
    const a = n.stdout.split('\n');
    const b = p.stdout.split('\n');
    const i = a.findIndex((line, k) => line !== b[k]);
    console.log(`  first differing line ${i + 1}:\n  node:   ${a[i]}\n  python: ${b[i]}`);
    if (p.stderr) console.log(`  python stderr: ${p.stderr.trim()}`);
  }
}
if (failed > 0) {
  console.error(`parity: ${failed} of ${cases.length} cases differ.`);
  process.exitCode = 1;
} else {
  console.log(`parity: all ${cases.length} cases match.`);
}

#!/usr/bin/env node
// Copies data/models.json into the Python package, which ships its own copy.
// Tests in both packages fail when the two files differ.
import { copyFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, 'data/models.json');
const to = join(root, 'python/src/model_retire/models.json');
const check = process.argv.includes('--check');

let same = false;
try {
  same = readFileSync(from).equals(readFileSync(to));
} catch {
  same = false;
}
if (check) {
  if (!same) {
    console.error('sync-data: python/src/model_retire/models.json differs from data/models.json. Run npm run sync-data.');
    process.exitCode = 1;
  } else {
    console.log('sync-data: copies match.');
  }
} else if (same) {
  console.log('sync-data: already in sync.');
} else {
  copyFileSync(from, to);
  console.log('sync-data: copied data/models.json to python/src/model_retire/models.json.');
}

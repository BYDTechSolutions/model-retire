import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isIgnored, parseIgnoreFile, parseRule, ruleMatches, type GlobRule } from './glob.js';

/** Directory names that are never walked. */
export const SKIP_DIRS: readonly string[] = [
  '.git',
  '.hg',
  '.svn',
  '.mypy_cache',
  '.next',
  '.pytest_cache',
  '.tox',
  '.venv',
  '__pycache__',
  'build',
  'dist',
  'node_modules',
  'vendor',
  'venv',
];

/** Lockfile names skipped unless `includeLockfiles` is set. */
export const LOCKFILES: readonly string[] = [
  'Cargo.lock',
  'Gemfile.lock',
  'Pipfile.lock',
  'bun.lock',
  'bun.lockb',
  'composer.lock',
  'flake.lock',
  'go.sum',
  'npm-shrinkwrap.json',
  'package-lock.json',
  'pdm.lock',
  'pnpm-lock.yaml',
  'poetry.lock',
  'uv.lock',
  'yarn.lock',
];

export interface WalkOptions {
  ignore: readonly string[];
  include: readonly string[];
  gitignore: boolean;
  includeLockfiles: boolean;
}

function readIgnore(dirAbs: string, base: string): GlobRule[] {
  try {
    return parseIgnoreFile(readFileSync(join(dirAbs, '.gitignore'), 'utf8'), base);
  } catch {
    return [];
  }
}

/**
 * Lists the files under `rootAbs` that should be scanned, as absolute paths in
 * a stable order. Symbolic links are not followed.
 */
export function walkFiles(rootAbs: string, opts: WalkOptions): string[] {
  const userIgnore = opts.ignore.map((g) => parseRule(g, '', false)).filter((r): r is GlobRule => r !== null);
  const include = opts.include.map((g) => parseRule(g, '', false)).filter((r): r is GlobRule => r !== null);
  const skipDirs = new Set(SKIP_DIRS);
  const lockfiles = new Set(LOCKFILES);
  const out: string[] = [];

  const visit = (dirAbs: string, rel: string, inherited: GlobRule[]): void => {
    const rules = opts.gitignore ? [...inherited, ...readIgnore(dirAbs, rel)] : inherited;
    let names: string[];
    try {
      names = readdirSync(dirAbs);
    } catch {
      return;
    }
    names.sort();
    for (const name of names) {
      const abs = join(dirAbs, name);
      const childRel = rel === '' ? name : `${rel}/${name}`;
      let st;
      try {
        st = lstatSync(abs);
      } catch {
        continue;
      }
      if (st.isSymbolicLink()) continue;
      const isDir = st.isDirectory();
      if (!isDir && !st.isFile()) continue;
      if (isDir && skipDirs.has(name)) continue;
      if (!isDir && !opts.includeLockfiles && lockfiles.has(name)) continue;
      if (isIgnored(rules, childRel, isDir)) continue;
      if (userIgnore.some((r) => ruleMatches(r, childRel, isDir))) continue;
      if (isDir) {
        visit(abs, childRel, rules);
      } else if (include.length === 0 || include.some((r) => ruleMatches(r, childRel, false))) {
        out.push(abs);
      }
    }
  };

  visit(rootAbs, '', []);
  return out;
}

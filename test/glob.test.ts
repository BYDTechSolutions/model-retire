import { describe, expect, it } from 'vitest';
import { globToRegexSource, parseRule } from '../src/index.js';
import { isIgnored, parseIgnoreFile, ruleMatches } from '../src/glob.js';

const re = (g: string) => new RegExp(globToRegexSource(g));

describe('globToRegexSource', () => {
  it('translates * and ? without crossing /', () => {
    expect(re('*.ts').test('a.ts')).toBe(true);
    expect(re('*.ts').test('src/a.ts')).toBe(false);
    expect(re('a?c').test('abc')).toBe(true);
    expect(re('a?c').test('a/c')).toBe(false);
  });

  it('translates ** in leading, middle and trailing position', () => {
    expect(re('**/a.ts').test('a.ts')).toBe(true);
    expect(re('**/a.ts').test('x/y/a.ts')).toBe(true);
    expect(re('src/**').test('src/x/y.ts')).toBe(true);
    expect(re('src/**/a.ts').test('src/a.ts')).toBe(true);
    expect(re('src/**/a.ts').test('src/x/y/a.ts')).toBe(true);
  });

  it('translates character classes and negated classes', () => {
    expect(re('[ab].txt').test('a.txt')).toBe(true);
    expect(re('[ab].txt').test('c.txt')).toBe(false);
    expect(re('[!ab].txt').test('c.txt')).toBe(true);
    expect(re('[!ab].txt').test('a.txt')).toBe(false);
    expect(re('[a-c]x').test('bx')).toBe(true);
  });

  it('escapes regular expression characters and honors backslash escapes', () => {
    expect(re('a+b.(c)').test('a+b.(c)')).toBe(true);
    expect(re('a+b.(c)').test('aab.(c)')).toBe(false);
    expect(re('\\*.md').test('*.md')).toBe(true);
    expect(re('\\*.md').test('a.md')).toBe(false);
  });
});

describe('parseRule', () => {
  it('skips blanks and comments', () => {
    expect(parseRule('')).toBeNull();
    expect(parseRule('   ')).toBeNull();
    expect(parseRule('# comment')).toBeNull();
  });

  it('reads negation, directory-only and anchoring', () => {
    expect(parseRule('!keep.log')).toMatchObject({ negate: true, anchored: false });
    expect(parseRule('build/')).toMatchObject({ dirOnly: true, anchored: false });
    expect(parseRule('/root.txt')).toMatchObject({ anchored: true });
    expect(parseRule('docs/*.md')).toMatchObject({ anchored: true });
    expect(parseRule('!x', '', false)).toMatchObject({ negate: false });
  });
});

describe('gitignore semantics', () => {
  it('matches unanchored patterns at any depth and anchored ones from the base', () => {
    const rules = parseIgnoreFile('*.log\n/top.txt\ndocs/gen/\n', '');
    expect(isIgnored(rules, 'a.log', false)).toBe(true);
    expect(isIgnored(rules, 'x/y/a.log', false)).toBe(true);
    expect(isIgnored(rules, 'top.txt', false)).toBe(true);
    expect(isIgnored(rules, 'sub/top.txt', false)).toBe(false);
    expect(isIgnored(rules, 'docs/gen', true)).toBe(true);
    expect(isIgnored(rules, 'docs/gen', false)).toBe(false);
  });

  it('lets a later negation re-include a file', () => {
    const rules = parseIgnoreFile('*.log\n!keep.log\n', '');
    expect(isIgnored(rules, 'debug.log', false)).toBe(true);
    expect(isIgnored(rules, 'keep.log', false)).toBe(false);
  });

  it('scopes rules from a nested .gitignore to its directory', () => {
    const rules = parseIgnoreFile('secret.txt\n/local.txt\n', 'pkg');
    expect(isIgnored(rules, 'pkg/secret.txt', false)).toBe(true);
    expect(isIgnored(rules, 'pkg/deep/secret.txt', false)).toBe(true);
    expect(isIgnored(rules, 'secret.txt', false)).toBe(false);
    expect(isIgnored(rules, 'pkg/local.txt', false)).toBe(true);
    expect(isIgnored(rules, 'pkg/deep/local.txt', false)).toBe(false);
  });

  it('matches a directory name pattern against directories too', () => {
    const r = parseRule('generated')!;
    expect(ruleMatches(r, 'src/generated', true)).toBe(true);
  });
});

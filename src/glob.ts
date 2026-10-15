/**
 * A small subset of gitignore pattern syntax, implemented the same way in the
 * Node and Python packages so both skip exactly the same files.
 *
 * Supported: `*`, `?`, `[abc]`, `[!abc]`, `**` (leading, trailing, middle),
 * a trailing `/` (directories only), a leading or inner `/` (anchored to the
 * directory holding the rule), `!` negation in `.gitignore` files, `#` comments
 * and `\` escapes.
 */

/** One parsed pattern. */
export interface GlobRule {
  /** Directory the rule is relative to (posix, `""` for the scan root). */
  base: string;
  regex: RegExp;
  negate: boolean;
  dirOnly: boolean;
  /** Anchored rules match the path relative to `base`; others match the basename. */
  anchored: boolean;
}

function escapeChar(c: string): string {
  return /[.*+?^${}()|[\]\\/-]/.test(c) ? `\\${c}` : c;
}

/** Translates one glob (without leading `!` or trailing `/`) to an anchored regular expression source. */
export function globToRegexSource(glob: string): string {
  let out = '';
  let i = 0;
  while (i < glob.length) {
    const c = glob[i] as string;
    if (c === '*') {
      if (glob[i + 1] === '*') {
        const atStart = i === 0 || glob[i - 1] === '/';
        if (atStart && glob[i + 2] === '/') {
          out += '(?:.*/)?';
          i += 3;
          continue;
        }
        out += '.*';
        i += 2;
        continue;
      }
      out += '[^/]*';
      i += 1;
      continue;
    }
    if (c === '?') {
      out += '[^/]';
      i += 1;
      continue;
    }
    if (c === '[') {
      const close = glob.indexOf(']', i + 2);
      if (close === -1) {
        out += '\\[';
        i += 1;
        continue;
      }
      let body = glob.slice(i + 1, close);
      let negate = false;
      if (body.startsWith('!') || body.startsWith('^')) {
        negate = true;
        body = body.slice(1);
      }
      body = body.replace(/[\\[\]^]/g, (ch) => `\\${ch}`);
      out += negate ? `[^/${body}]` : `[${body}]`;
      i = close + 1;
      continue;
    }
    if (c === '\\' && i + 1 < glob.length) {
      out += escapeChar(glob[i + 1] as string);
      i += 2;
      continue;
    }
    out += escapeChar(c);
    i += 1;
  }
  return `^${out}$`;
}

/**
 * Parses one pattern line. Returns `null` for blank lines and comments.
 * With `allowNegation` false, a leading `!` is taken literally.
 */
export function parseRule(line: string, base = '', allowNegation = true): GlobRule | null {
  let p = line.replace(/\r$/, '');
  if (p.trim() === '' || p.startsWith('#')) return null;
  p = p.replace(/ +$/, '');
  let negate = false;
  if (allowNegation && p.startsWith('!')) {
    negate = true;
    p = p.slice(1);
  }
  let dirOnly = false;
  if (p.endsWith('/')) {
    dirOnly = true;
    p = p.replace(/\/+$/, '');
  }
  const anchored = p.includes('/');
  p = p.replace(/^\/+/, '');
  if (p === '') return null;
  return { base, regex: new RegExp(globToRegexSource(p)), negate, dirOnly, anchored };
}

/** Parses the text of a `.gitignore` file found in directory `base`. */
export function parseIgnoreFile(text: string, base: string): GlobRule[] {
  const rules: GlobRule[] = [];
  for (const line of text.split('\n')) {
    const r = parseRule(line, base, true);
    if (r) rules.push(r);
  }
  return rules;
}

/** True when `rule` matches `relPath` (posix, relative to the scan root). */
export function ruleMatches(rule: GlobRule, relPath: string, isDir: boolean): boolean {
  if (rule.dirOnly && !isDir) return false;
  let sub = relPath;
  if (rule.base !== '') {
    if (!relPath.startsWith(`${rule.base}/`)) return false;
    sub = relPath.slice(rule.base.length + 1);
  }
  const target = rule.anchored ? sub : (sub.split('/').pop() as string);
  return rule.regex.test(target);
}

/** Applies rules in order; the last matching rule decides. Returns true when the path is ignored. */
export function isIgnored(rules: readonly GlobRule[], relPath: string, isDir: boolean): boolean {
  let ignored = false;
  for (const r of rules) {
    if (ruleMatches(r, relPath, isDir)) ignored = !r.negate;
  }
  return ignored;
}

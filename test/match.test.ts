import { describe, expect, it } from 'vitest';
import { createMatcher, type ModelEntry } from '../src/index.js';

function entry(id: string, aliases?: string[], provider = 'test'): ModelEntry {
  return { provider, id, status: 'deprecated', ...(aliases ? { aliases } : {}) };
}

const matcher = createMatcher([
  entry('gpt-4-0613', ['gpt-4']),
  entry('gpt-4-turbo'),
  entry('claude-3-opus-20240229'),
  entry('text-bison'),
  entry('anthropic.claude-3-haiku-20240307-v1:0'),
  entry('command-r-03-2024', ['command-r']),
  entry('minimax.minimax-m2'),
  entry('minimax.minimax-m2.1'),
]);

const found = (line: string) => matcher.findInLine(line).map((m) => m.match);

describe('boundaries', () => {
  it('does not match gpt-4 inside longer IDs', () => {
    for (const s of ['gpt-4o', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4o-mini', 'gpt-4-32k', 'gpt-4-0613x', 'gpt-4_beta']) {
      expect(found(`model = "${s}"`), s).toEqual([]);
    }
  });

  it('does not match gpt-4 with an ID character before it', () => {
    for (const s of ['xgpt-4', '1gpt-4', '.gpt-4', '-gpt-4', '_gpt-4']) {
      expect(found(s), s).toEqual([]);
    }
  });

  it('matches gpt-4-turbo as itself, not as the alias gpt-4', () => {
    expect(found('"gpt-4-turbo"')).toEqual(['gpt-4-turbo']);
  });

  it('matches the alias when it stands alone', () => {
    for (const s of ['"gpt-4"', "'gpt-4'", '`gpt-4`', 'model=gpt-4', '(gpt-4)', 'gpt-4,', 'gpt-4:', '/gpt-4/', '[gpt-4]', 'gpt-4 ']) {
      expect(found(s), s).toEqual(['gpt-4']);
    }
  });

  it('matches at the start and end of a line', () => {
    expect(found('gpt-4')).toEqual(['gpt-4']);
    expect(found('use gpt-4')).toEqual(['gpt-4']);
    expect(found('gpt-4 is used')).toEqual(['gpt-4']);
  });

  it('matches a dated ID only as itself', () => {
    expect(found('"claude-3-opus-20240229"')).toEqual(['claude-3-opus-20240229']);
    expect(found('"claude-3-opus-20240229-v2"')).toEqual([]);
    expect(found('"claude-3-opus-2024022"')).toEqual([]);
    expect(found('"claude-3-opus-202402291"')).toEqual([]);
    expect(found('"claude-3-opus"')).toEqual([]);
  });

  it('is case-sensitive', () => {
    expect(found('GPT-4 Claude-3-Opus-20240229')).toEqual([]);
  });

  it('matches inside a fine-tuned model name, since ":" is not an ID character', () => {
    expect(found('ft:gpt-4-0613:my-org::abc')).toEqual(['gpt-4-0613']);
  });

  it('treats "@" as a boundary, so a versioned name matches its base ID', () => {
    expect(found('text-bison@001')).toEqual(['text-bison']);
  });

  it('matches Bedrock IDs with ":" and does not match inside an inference profile', () => {
    expect(found('"anthropic.claude-3-haiku-20240307-v1:0"')).toEqual(['anthropic.claude-3-haiku-20240307-v1:0']);
    expect(found('"us.anthropic.claude-3-haiku-20240307-v1:0"')).toEqual([]);
    expect(found('"anthropic.claude-3-haiku-20240307-v1:01"')).toEqual([]);
  });

  it('does not match an alias inside a dotted provider ID', () => {
    expect(found('cohere.command-r-v1:0')).toEqual([]);
  });

  it('keeps IDs that differ only by a dotted suffix apart', () => {
    expect(found('minimax.minimax-m2')).toEqual(['minimax.minimax-m2']);
    expect(found('minimax.minimax-m2.1')).toEqual(['minimax.minimax-m2.1']);
    expect(found('minimax.minimax-m2.10')).toEqual([]);
  });

  it('finds several hits in one line, left to right', () => {
    expect(found('["gpt-4", "gpt-4o", "gpt-4-turbo", "gpt-4"]')).toEqual(['gpt-4', 'gpt-4-turbo', 'gpt-4']);
  });
});

describe('columns', () => {
  it('is 1-based', () => {
    expect(matcher.findInLine('gpt-4')[0]?.column).toBe(1);
    expect(matcher.findInLine('  gpt-4')[0]?.column).toBe(3);
  });

  it('counts code points, not UTF-16 units', () => {
    expect(matcher.findInLine('\u{1F680} gpt-4')[0]?.column).toBe(3);
    expect(matcher.findInLine('café gpt-4')[0]?.column).toBe(6);
  });
});

describe('entries', () => {
  it('maps an alias back to its entry', () => {
    expect(matcher.entriesFor('gpt-4').map((e) => e.id)).toEqual(['gpt-4-0613']);
  });

  it('returns every provider that lists the same ID', () => {
    const m = createMatcher([entry('gemini-2.0-flash', undefined, 'a'), entry('gemini-2.0-flash', undefined, 'b')]);
    expect(m.entriesFor('gemini-2.0-flash').map((e) => e.provider)).toEqual(['a', 'b']);
    expect(m.findInLine('gemini-2.0-flash')).toHaveLength(1);
  });

  it('finds nothing with an empty dataset', () => {
    expect(createMatcher([]).findInLine('gpt-4 anything')).toEqual([]);
  });

  it('escapes regular expression characters in IDs', () => {
    const m = createMatcher([entry('a+b(c)'), entry('x.y')]);
    expect(m.findInLine('a+b(c) xzy x.y').map((h) => h.match)).toEqual(['a+b(c)', 'x.y']);
  });
});

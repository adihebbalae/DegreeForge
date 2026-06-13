import { describe, it, expect } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { extractText, parseModelJson, ModelOutputError } from './llm';
import { z } from 'zod';

const msg = (content: unknown[]): Anthropic.Messages.Message =>
  ({ content } as unknown as Anthropic.Messages.Message);

describe('extractText', () => {
  it('returns the text when the first block is text', () => {
    expect(extractText(msg([{ type: 'text', text: 'Hello' }]))).toBe('Hello');
  });

  it('returns the text even when a tool_use block comes first (the old crash case)', () => {
    // (response.content[0] as any).text was undefined here → the handler threw an
    // opaque 500 the moment Claude emitted a tool_use/thinking block first.
    const result = extractText(
      msg([
        { type: 'tool_use', id: 't1', name: 'do_thing', input: {} },
        { type: 'text', text: 'the answer' },
      ])
    );
    expect(result).toBe('the answer');
  });

  it('returns an empty string when there are no text blocks', () => {
    expect(extractText(msg([{ type: 'tool_use', id: 't1', name: 'do_thing', input: {} }]))).toBe('');
  });

  it('concatenates multiple text blocks in order', () => {
    expect(extractText(msg([{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }]))).toBe('ab');
  });
});

describe('parseModelJson — ReDoS fix', () => {
  const schema = z.object({ a: z.number() });

  it('extracts JSON from normal prose wrapping', () => {
    const result = parseModelJson('Here is the answer: {"a":1} done.', schema);
    expect(result).toEqual({ a: 1 });
  });

  it('pathological input (5000 open braces) completes quickly without hanging', () => {
    const pathological = '{'.repeat(5000);
    const start = Date.now();
    expect(() => parseModelJson(pathological, schema)).toThrow(ModelOutputError);
    const elapsed = Date.now() - start;
    // Must complete in under 500ms — catastrophic backtracking with the old regex
    // would take many seconds on this input.
    expect(elapsed).toBeLessThan(500);
  });

  it('returns ModelOutputError when no valid JSON object is present', () => {
    expect(() => parseModelJson('no braces here', schema)).toThrow(ModelOutputError);
  });

  it('returns ModelOutputError when JSON does not match schema', () => {
    expect(() => parseModelJson('{"b": "wrong"}', schema)).toThrow(ModelOutputError);
  });
});

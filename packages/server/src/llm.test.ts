import { describe, it, expect } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { extractText } from './llm';

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

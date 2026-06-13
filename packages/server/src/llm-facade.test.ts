import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import type Anthropic from '@anthropic-ai/sdk';
import { callLLM, parseModelJson, ModelOutputError } from './llm';

// A minimal fake Anthropic client whose messages.create returns a text block.
function fakeAnthropic(text: string): Anthropic {
  return {
    messages: {
      create: vi.fn(async () => ({ content: [{ type: 'text', text }] })),
    },
  } as unknown as Anthropic;
}

const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;

describe('callLLM provider facade', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
  });

  it('routes to Anthropic and returns extracted text when ANTHROPIC_API_KEY is set', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    const client = fakeAnthropic('{"ok":true}');
    const out = await callLLM(client, 'sys', 'user', { maxTokens: 100 });
    expect(out).toBe('{"ok":true}');
    expect(client.messages.create).toHaveBeenCalledOnce();
  });

  it('routes to Ollama and returns response text when ANTHROPIC_API_KEY is unset', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const client = fakeAnthropic('should-not-be-used');
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ response: '{"from":"ollama"}' }), { status: 200 })
      );
    const out = await callLLM(client, 'sys', 'user', { maxTokens: 100 });
    expect(out).toBe('{"from":"ollama"}');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(client.messages.create).not.toHaveBeenCalled();
  });

  it('throws a descriptive error when Ollama responds non-2xx', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const client = fakeAnthropic('x');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'model not found' }), { status: 500 })
    );
    await expect(callLLM(client, 'sys', 'user', { maxTokens: 100 })).rejects.toThrow(
      /Ollama API error: model not found/
    );
  });
});

describe('parseModelJson', () => {
  const schema = z.object({ techCoreId: z.string(), mathBA: z.boolean() });

  it('parses a clean JSON object', () => {
    const out = parseModelJson('{"techCoreId":"a","mathBA":false}', schema);
    expect(out).toEqual({ techCoreId: 'a', mathBA: false });
  });

  it('slices the outer object out of surrounding prose/markdown', () => {
    const out = parseModelJson(
      'Sure! Here is the answer:\n```json\n{"techCoreId":"b","mathBA":true}\n```',
      schema
    );
    expect(out).toEqual({ techCoreId: 'b', mathBA: true });
  });

  it('throws ModelOutputError when there is no JSON', () => {
    expect(() => parseModelJson('no json here', schema)).toThrow(ModelOutputError);
  });

  it('throws ModelOutputError when JSON fails the schema', () => {
    // missing mathBA → schema rejects
    expect(() => parseModelJson('{"techCoreId":"a"}', schema)).toThrow(ModelOutputError);
  });

  it('carries the raw text on the error for server-side logging', () => {
    try {
      parseModelJson('totally not json', schema);
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ModelOutputError);
      expect((e as ModelOutputError).rawText).toContain('totally not json');
    }
  });
});

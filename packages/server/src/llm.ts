import type Anthropic from '@anthropic-ai/sdk';
import type { z } from 'zod';

/**
 * Extract the concatenated text from an Anthropic Messages response, narrowing the
 * ContentBlock union on `type === 'text'` (the same narrowing /api/agent-turn does
 * inline).
 *
 * Returns '' when the response leads with a tool_use / thinking block, or contains
 * no text at all. The two non-streaming handlers previously read
 * `(response.content[0] as any).text`, which is `undefined` the moment Claude emits
 * a non-text block first and threw an opaque 500 downstream in JSON.parse.
 */
export function extractText(response: Anthropic.Messages.Message): string {
  let text = '';
  for (const block of response.content) {
    if (block.type === 'text') {
      text += block.text;
    }
  }
  return text;
}

/**
 * Thrown when a model's text output cannot be parsed into the expected JSON
 * shape — either it contained no JSON object at all, or it failed the supplied
 * Zod schema. Carries the offending raw text (truncated) for server-side logging
 * without leaking it to the client.
 */
export class ModelOutputError extends Error {
  readonly rawText: string;

  constructor(message: string, rawText: string) {
    super(message);
    this.name = 'ModelOutputError';
    // Truncate so an oversized model response can't bloat logs.
    this.rawText = rawText.length > 2000 ? rawText.slice(0, 2000) + '…' : rawText;
  }
}

export interface CallLLMOptions {
  /** Max output tokens for this completion. */
  maxTokens: number;
  /**
   * Anthropic model id. Defaults to the recommend/questionnaire model. The agent
   * turn passes its own (env-overridable) model.
   */
  model?: string;
}

/**
 * Provider facade. Routes a single (systemPrompt, userContent) completion to
 * Anthropic when ANTHROPIC_API_KEY is set, otherwise to a local Ollama instance.
 * Returns the model's raw text — callers parse/validate it with parseModelJson.
 *
 * The Anthropic client is injected so this module stays import-time side-effect
 * free and unit-testable. Both branches were previously copy-pasted across the
 * /api/recommend and /api/generate-questionnaire handlers.
 */
export async function callLLM(
  anthropic: Anthropic,
  systemPrompt: string,
  userContent: string,
  opts: CallLLMOptions
): Promise<string> {
  const useAnthropic = !!process.env.ANTHROPIC_API_KEY;

  if (useAnthropic) {
    const response = await anthropic.messages.create({
      model: opts.model ?? 'claude-3-5-sonnet-20241022',
      max_tokens: opts.maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
    });
    return extractText(response);
  }

  const ollamaUrl = (process.env.OLLAMA_URL || 'http://127.0.0.1:11434').trim();
  const ollamaModel = (process.env.OLLAMA_MODEL || 'llama3').trim();

  const response = await fetch(`${ollamaUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: ollamaModel,
      // Ollama has no separate system/user channel here; the recommend handler
      // historically concatenated them, so keep that behavior identical.
      prompt: `${systemPrompt}\n\n${userContent}`,
      stream: false,
      format: 'json',
      system: 'You are an academic advisor. Output strictly raw JSON only.',
    }),
  });

  if (!response.ok) {
    let errMsg = response.statusText;
    try {
      const errData = (await response.json()) as { error?: string };
      if (errData.error) errMsg = errData.error;
    } catch {
      /* non-JSON error body — fall back to statusText */
    }
    throw new Error(`Ollama API error: ${errMsg}`);
  }

  const data = (await response.json()) as { response?: string };
  return data.response ?? '';
}

/**
 * Parse a model's text output into a typed, schema-validated object.
 *
 * Models occasionally wrap JSON in prose or markdown despite instructions, so we
 * first slice out the outermost `{ … }` (matching the previous inline regex) and
 * then validate against the supplied Zod schema. Any failure throws a
 * ModelOutputError carrying the raw text for server-side logging.
 */
export function parseModelJson<T>(text: string, schema: z.ZodType<T>): T {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  const candidate = jsonMatch ? jsonMatch[0] : text;

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    throw new ModelOutputError('Model output was not valid JSON', text);
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new ModelOutputError(
      `Model output failed schema validation: ${result.error.message}`,
      text
    );
  }
  return result.data;
}

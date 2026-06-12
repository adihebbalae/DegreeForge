import type Anthropic from '@anthropic-ai/sdk';

/**
 * Extract the concatenated text from an Anthropic Messages response, narrowing the
 * ContentBlock union on `type === 'text'` (the same narrowing /api/agent-turn does
 * inline).
 *
 * Returns '' when the response leads with a tool_use / thinking block, or contains
 * no text at all. The two non-streaming handlers previously read
 * `(response.content[0] as any).text`, which is `undefined` the moment Claude emits
 * a non-text block first and threw an opaque 500 downstream in JSON.parse.
 *
 * This is the first sliver of the server LLM facade (audit P5); the provider branch
 * + parseModelJson consolidation are left for Brief 2.
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

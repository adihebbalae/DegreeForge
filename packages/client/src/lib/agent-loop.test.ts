import { describe, it, expect } from 'vitest';
import { runAgentTurn } from './agent-loop';
import type { AgentMessage, AgentProvider, AgentTurnResult } from './agent-loop';
import type { ToolContext, ToolDefinition } from './agent-tools/types';

// Minimal ToolContext — the tools under test ignore it.
const ctx = {} as ToolContext;

/**
 * Scripted provider: returns the queued AgentTurnResult per call, and records
 * the message history it was handed each turn so the test can inspect the
 * synthesized tool_result.
 */
function scriptedProvider(script: AgentTurnResult[]): {
  provider: AgentProvider;
  seen: AgentMessage[][];
} {
  const seen: AgentMessage[][] = [];
  let i = 0;
  const provider: AgentProvider = {
    async complete(messages) {
      seen.push(messages.map((m) => ({ ...m })));
      const next = script[i] ?? { text: '', toolCall: null };
      i += 1;
      return next;
    },
  };
  return { provider, seen };
}

const throwingTool: ToolDefinition = {
  name: 'boom',
  description: 'always throws',
  schema: {},
  defaultEnabled: true,
  fn: () => {
    throw new Error('kaboom');
  },
};

describe('runAgentTurn — throwing tool degrades instead of aborting', () => {
  it('synthesizes an {isError:true} tool_result and the chat turn continues', async () => {
    const { provider, seen } = scriptedProvider([
      // turn 1: model calls the throwing tool
      { text: '', toolCall: { name: 'boom', args: {} } },
      // turn 2: model answers in prose after seeing the error result
      { text: 'I could not run that, here is what I can say instead.', toolCall: null },
    ]);

    // The whole turn must resolve, not reject.
    const result = await runAgentTurn([], 'do the thing', {
      provider,
      tools: [throwingTool],
      toolContext: ctx,
      systemPrompt: 'sys',
    });

    // The chat turn continued to a final answer.
    expect(result.finalText).toBe('I could not run that, here is what I can say instead.');
    expect(result.toolCallMade).toEqual({ name: 'boom', args: {} });

    // The second provider call saw a tool_result message carrying the error.
    const secondTurnMessages = seen[1];
    const toolResultMsg = secondTurnMessages.find((m) => m.role === 'tool_result');
    expect(toolResultMsg).toBeDefined();
    expect(toolResultMsg?.tool_name).toBe('boom');

    // The serialized content is an {isError:true} payload mentioning the failure.
    const payload = JSON.parse(toolResultMsg!.content) as { content: string; isError: boolean };
    expect(payload.isError).toBe(true);
    expect(payload.content).toContain('boom');
    expect(payload.content).toContain('kaboom');
  });
});

import { describe, it, expect } from 'vitest';
import { runAgentTurn } from '../../agent-loop';
import type { AgentProvider, AgentTurnResult, AgentMessage } from '../../agent-loop';
import type { ToolDefinition } from '../types';
import { FIXTURE_CTX } from './fixture';

const DUMMY_TOOL: ToolDefinition = {
  name: 'get_course_info',
  description: 'Get course info',
  schema: { type: 'object', properties: { course_id: { type: 'string' } }, required: ['course_id'] },
  defaultEnabled: true,
  fn: (_ctx, args) => ({
    content: { id: String(args.course_id), title: 'Test Course' },
  }),
};

const SYSTEM_PROMPT = 'You are a test advisor.';

describe('runAgentTurn - 1-tool-call cap', () => {
  it('returns text directly when model returns no tool call', async () => {
    const provider: AgentProvider = {
      async complete(): Promise<AgentTurnResult> {
        return { text: 'Here is my answer.', toolCall: null };
      },
    };

    const result = await runAgentTurn([], 'What is ECE?', {
      provider,
      tools: [DUMMY_TOOL],
      toolContext: FIXTURE_CTX,
      systemPrompt: SYSTEM_PROMPT,
    });

    expect(result.finalText).toBe('Here is my answer.');
    expect(result.toolCallMade).toBeNull();
    expect(result.toolResult).toBeNull();
  });

  it('executes the first tool call and does NOT make a second model call', async () => {
    let callCount = 0;
    const provider: AgentProvider = {
      async complete(): Promise<AgentTurnResult> {
        callCount++;
        // Simulate model returning a tool call on first call
        return {
          text: '',
          toolCall: { name: 'get_course_info', args: { course_id: 'ECE 302' } },
        };
      },
    };

    const result = await runAgentTurn([], 'Tell me about ECE 302', {
      provider,
      tools: [DUMMY_TOOL],
      toolContext: FIXTURE_CTX,
      systemPrompt: SYSTEM_PROMPT,
    });

    // Provider should only have been called once — no second call after tool execution
    expect(callCount).toBe(1);
    expect(result.toolCallMade).not.toBeNull();
    expect(result.toolCallMade?.name).toBe('get_course_info');
    expect(result.toolResult).not.toBeNull();
  });

  it('returns fallback message for an unknown tool name', async () => {
    const provider: AgentProvider = {
      async complete(): Promise<AgentTurnResult> {
        return {
          text: '',
          toolCall: { name: 'nonexistent_tool', args: {} },
        };
      },
    };

    const result = await runAgentTurn([], 'use bad tool', {
      provider,
      tools: [DUMMY_TOOL],
      toolContext: FIXTURE_CTX,
      systemPrompt: SYSTEM_PROMPT,
    });

    expect(result.finalText).toContain('nonexistent_tool');
    expect(result.toolCallMade?.name).toBe('nonexistent_tool');
    expect(result.toolResult).toBeNull();
  });

  it('passes conversation history to the provider', async () => {
    const capturedMessages: AgentMessage[] = [];
    const provider: AgentProvider = {
      async complete(messages): Promise<AgentTurnResult> {
        capturedMessages.push(...messages);
        return { text: 'ok', toolCall: null };
      },
    };

    const history: AgentMessage[] = [
      { role: 'user', content: 'Previous message' },
      { role: 'assistant', content: 'Previous reply' },
    ];

    await runAgentTurn(history, 'New message', {
      provider,
      tools: [DUMMY_TOOL],
      toolContext: FIXTURE_CTX,
      systemPrompt: SYSTEM_PROMPT,
    });

    expect(capturedMessages.length).toBe(3); // 2 history + 1 new user message
    expect(capturedMessages[capturedMessages.length - 1].content).toBe('New message');
  });
});

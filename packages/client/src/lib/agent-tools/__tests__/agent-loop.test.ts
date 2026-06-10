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

const PROPOSE_PLAN_TOOL: ToolDefinition = {
  name: 'propose_plan_edit',
  description: 'Propose plan edits',
  schema: { type: 'object', properties: {}, required: [] },
  defaultEnabled: true,
  fn: (_ctx, _args) => ({
    content: { type: 'plan_edit_proposal', proposal: { operations: [], reasoning: 'test' } },
  }),
};

const SYSTEM_PROMPT = 'You are a test advisor.';

describe('runAgentTurn - no tool call', () => {
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
});

describe('runAgentTurn - synthesis turn for read tools', () => {
  it('makes a second provider call after executing a non-passthrough tool', async () => {
    let callCount = 0;
    const provider: AgentProvider = {
      async complete(): Promise<AgentTurnResult> {
        callCount++;
        if (callCount === 1) {
          return {
            text: '',
            toolCall: { name: 'get_course_info', args: { course_id: 'ECE 302' } },
          };
        }
        // Second call: synthesis — return natural language
        return { text: 'ECE 302 is a great course.', toolCall: null };
      },
    };

    const result = await runAgentTurn([], 'Tell me about ECE 302', {
      provider,
      tools: [DUMMY_TOOL],
      toolContext: FIXTURE_CTX,
      systemPrompt: SYSTEM_PROMPT,
    });

    expect(callCount).toBe(2);
    expect(result.finalText).toBe('ECE 302 is a great course.');
    expect(result.toolCallMade?.name).toBe('get_course_info');
    expect(result.toolResult).toEqual({ id: 'ECE 302', title: 'Test Course' });
  });

  it('passes tool_result message with tool_name to the synthesis call', async () => {
    const capturedMessages: AgentMessage[][] = [];
    let callCount = 0;
    const provider: AgentProvider = {
      async complete(messages): Promise<AgentTurnResult> {
        capturedMessages.push([...messages]);
        callCount++;
        if (callCount === 1) {
          return {
            text: '',
            toolCall: { name: 'get_course_info', args: { course_id: 'ECE 302' } },
          };
        }
        return { text: 'Synthesized answer.', toolCall: null };
      },
    };

    await runAgentTurn([], 'Tell me about ECE 302', {
      provider,
      tools: [DUMMY_TOOL],
      toolContext: FIXTURE_CTX,
      systemPrompt: SYSTEM_PROMPT,
    });

    // Second call should include a tool_result message
    const secondCallMessages = capturedMessages[1];
    const toolResultMsg = secondCallMessages.find(m => m.role === 'tool_result');
    expect(toolResultMsg).toBeDefined();
    expect(toolResultMsg?.tool_name).toBe('get_course_info');
    const parsed = JSON.parse(toolResultMsg?.content ?? '{}');
    expect(parsed).toEqual({ id: 'ECE 302', title: 'Test Course' });
  });

  it('passes full tools array on the loop continuation call, empty tools only on forced synthesis', async () => {
    // In the multi-step loop, continuation calls use the full tools array.
    // The empty-tools synthesis call only occurs when MAX_TOOL_CALLS is reached.
    type CompleteArgs = Parameters<AgentProvider['complete']>;
    const capturedCalls: Array<{ tools: CompleteArgs[1]; systemPrompt: CompleteArgs[2] }> = [];
    let callCount = 0;
    const provider: AgentProvider = {
      async complete(messages, tools, systemPrompt): Promise<AgentTurnResult> {
        capturedCalls.push({ tools, systemPrompt });
        callCount++;
        if (callCount === 1) {
          return {
            text: '',
            toolCall: { name: 'get_course_info', args: { course_id: 'ECE 302' } },
          };
        }
        return { text: 'Synthesized answer.', toolCall: null };
      },
    };

    await runAgentTurn([], 'Tell me about ECE 302', {
      provider,
      tools: [DUMMY_TOOL],
      toolContext: FIXTURE_CTX,
      systemPrompt: SYSTEM_PROMPT,
    });

    expect(callCount).toBe(2);

    // First call: original tools and system prompt unchanged
    expect(capturedCalls[0].tools).toEqual([DUMMY_TOOL]);
    expect(capturedCalls[0].systemPrompt).toBe(SYSTEM_PROMPT);

    // Second call is a regular loop iteration — tools array is full, not empty
    expect(capturedCalls[1].tools).toEqual([DUMMY_TOOL]);
    // System prompt is also the original one on loop iterations
    expect(capturedCalls[1].systemPrompt).toBe(SYSTEM_PROMPT);
  });

  it('passes empty tools array and augmented system prompt only on forced MAX_TOOL_CALLS synthesis', async () => {
    type CompleteArgs = Parameters<AgentProvider['complete']>;
    const capturedCalls: Array<{ tools: CompleteArgs[1]; systemPrompt: CompleteArgs[2] }> = [];
    const provider: AgentProvider = {
      async complete(messages, tools, systemPrompt): Promise<AgentTurnResult> {
        capturedCalls.push({ tools, systemPrompt });
        // Keep requesting tools when available; return prose on synthesis call
        if (tools.length > 0) {
          return { text: '', toolCall: { name: 'get_course_info', args: { course_id: 'ECE 302' } } };
        }
        return { text: 'Final synthesis answer.', toolCall: null };
      },
    };

    await runAgentTurn([], 'Keep looking things up', {
      provider,
      tools: [DUMMY_TOOL],
      toolContext: FIXTURE_CTX,
      systemPrompt: SYSTEM_PROMPT,
    });

    // Last captured call is the synthesis call (tools=[])
    const synthesisCall = capturedCalls[capturedCalls.length - 1];
    expect(synthesisCall.tools).toEqual([]);
    expect(synthesisCall.systemPrompt).toContain(SYSTEM_PROMPT);
    expect(synthesisCall.systemPrompt).toContain('You have already retrieved the tool result');
    expect(synthesisCall.systemPrompt).toContain('Do NOT say you will look something up');
  });

  it('returns empty text when the loop continuation call returns empty text and no tool', async () => {
    // Under the multi-step loop, when the model returns { text: '', toolCall: null }
    // after a tool execution the answer IS the empty string — buildFallbackSummary
    // is only invoked on the cap-triggered synthesis path.
    let callCount = 0;
    const provider: AgentProvider = {
      async complete(): Promise<AgentTurnResult> {
        callCount++;
        if (callCount === 1) {
          return {
            text: '',
            toolCall: { name: 'get_course_info', args: { course_id: 'ECE 302' } },
          };
        }
        // Loop continuation returns empty text with no tool call
        return { text: '', toolCall: null };
      },
    };

    const result = await runAgentTurn([], 'Tell me about ECE 302', {
      provider,
      tools: [DUMMY_TOOL],
      toolContext: FIXTURE_CTX,
      systemPrompt: SYSTEM_PROMPT,
    });

    expect(callCount).toBe(2);
    // Empty string is returned directly — toolCallMade is the last executed tool
    expect(result.finalText).toBe('');
    expect(result.toolCallMade?.name).toBe('get_course_info');
  });

  it('continues the loop when a model response includes both text and a tool call', async () => {
    // Under the multi-step loop, a tool call in the response always triggers
    // execution regardless of whether text is also present.
    let callCount = 0;
    const provider: AgentProvider = {
      async complete(): Promise<AgentTurnResult> {
        callCount++;
        if (callCount === 1) {
          return {
            text: '',
            toolCall: { name: 'get_course_info', args: { course_id: 'ECE 302' } },
          };
        }
        if (callCount === 2) {
          // Model returns text AND a tool call — loop should execute the tool call
          return {
            text: 'Also checking ECE 311K...',
            toolCall: { name: 'get_course_info', args: { course_id: 'ECE 311K' } },
          };
        }
        // Final answer after second tool result
        return { text: 'Both courses looked up.', toolCall: null };
      },
    };

    const result = await runAgentTurn([], 'Tell me about ECE 302', {
      provider,
      tools: [DUMMY_TOOL],
      toolContext: FIXTURE_CTX,
      systemPrompt: SYSTEM_PROMPT,
    });

    // 3 calls: tool1, tool2, final answer
    expect(callCount).toBe(3);
    expect(result.finalText).toBe('Both courses looked up.');
    // toolCallMade is the LAST executed tool call
    expect(result.toolCallMade?.name).toBe('get_course_info');
    expect(result.toolCallMade?.args).toEqual({ course_id: 'ECE 311K' });
  });
});

describe('runAgentTurn - propose_plan_edit passthrough (no synthesis)', () => {
  it('does NOT make a second provider call for propose_plan_edit', async () => {
    let callCount = 0;
    const provider: AgentProvider = {
      async complete(): Promise<AgentTurnResult> {
        callCount++;
        return {
          text: '',
          toolCall: { name: 'propose_plan_edit', args: { operations: [], reasoning: 'test' } },
        };
      },
    };

    const result = await runAgentTurn([], 'Move ECE 302 to fall', {
      provider,
      tools: [PROPOSE_PLAN_TOOL],
      toolContext: FIXTURE_CTX,
      systemPrompt: SYSTEM_PROMPT,
    });

    expect(callCount).toBe(1);
    expect(result.toolCallMade?.name).toBe('propose_plan_edit');
    // toolResult should be the raw structured proposal, not prose
    expect(result.toolResult).toEqual({
      type: 'plan_edit_proposal',
      proposal: { operations: [], reasoning: 'test' },
    });
    // finalText is JSON stringified (as before) — ChatPanel extracts proposal from toolResult
    expect(typeof result.finalText).toBe('string');
  });
});

describe('runAgentTurn - unknown tool name', () => {
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
});

describe('runAgentTurn - conversation history', () => {
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

// ─── Multi-step loop tests (added with MAX_TOOL_CALLS support) ─────────────────

describe('runAgentTurn - 2-tool chain answered by model', () => {
  it('executes two tools then returns the model text answer (no forced synthesis)', async () => {
    let callCount = 0;
    const provider: AgentProvider = {
      async complete(): Promise<AgentTurnResult> {
        callCount++;
        if (callCount === 1) {
          return { text: '', toolCall: { name: 'get_course_info', args: { course_id: 'ECE 302' } } };
        }
        if (callCount === 2) {
          // After first tool result, model wants a second tool
          return { text: '', toolCall: { name: 'get_course_info', args: { course_id: 'ECE 311K' } } };
        }
        // After second tool result, model answers directly
        return { text: 'ECE 302 is followed by ECE 311K.', toolCall: null };
      },
    };

    const result = await runAgentTurn([], 'What comes after ECE 302?', {
      provider,
      tools: [DUMMY_TOOL],
      toolContext: FIXTURE_CTX,
      systemPrompt: SYSTEM_PROMPT,
    });

    // 3 provider calls: tool1, tool2, final answer
    expect(callCount).toBe(3);
    expect(result.finalText).toBe('ECE 302 is followed by ECE 311K.');
    // toolCallMade is the LAST executed tool call
    expect(result.toolCallMade?.name).toBe('get_course_info');
    expect(result.toolCallMade?.args).toEqual({ course_id: 'ECE 311K' });
    expect(result.toolResult).toEqual({ id: 'ECE 311K', title: 'Test Course' });
  });

  it('appends both tool_result messages to context before final answer', async () => {
    let callCount = 0;
    const capturedMessages: AgentMessage[][] = [];
    const provider: AgentProvider = {
      async complete(messages): Promise<AgentTurnResult> {
        capturedMessages.push([...messages]);
        callCount++;
        if (callCount === 1) {
          return { text: '', toolCall: { name: 'get_course_info', args: { course_id: 'ECE 302' } } };
        }
        if (callCount === 2) {
          return { text: '', toolCall: { name: 'get_course_info', args: { course_id: 'ECE 311K' } } };
        }
        return { text: 'Both looked up.', toolCall: null };
      },
    };

    await runAgentTurn([], 'Compare ECE 302 and ECE 311K', {
      provider,
      tools: [DUMMY_TOOL],
      toolContext: FIXTURE_CTX,
      systemPrompt: SYSTEM_PROMPT,
    });

    // On the third call, messages should include two tool_result entries
    const finalCallMessages = capturedMessages[2];
    const toolResults = finalCallMessages.filter(m => m.role === 'tool_result');
    expect(toolResults.length).toBe(2);
    expect(toolResults[0].tool_name).toBe('get_course_info');
    expect(toolResults[1].tool_name).toBe('get_course_info');
  });
});

describe('runAgentTurn - MAX_TOOL_CALLS ceiling triggers forced synthesis', () => {
  it('stops at MAX_TOOL_CALLS and makes one final tool-less synthesis call', async () => {
    let callCount = 0;
    const provider: AgentProvider = {
      async complete(_messages, tools): Promise<AgentTurnResult> {
        callCount++;
        // Keep requesting tools as long as tools are available (simulates runaway chaining)
        if (tools.length > 0) {
          return { text: '', toolCall: { name: 'get_course_info', args: { course_id: `ECE ${callCount}` } } };
        }
        // Synthesis call (tools=[]) — return prose
        return { text: 'Here is what I found.', toolCall: null };
      },
    };

    const result = await runAgentTurn([], 'Keep looking things up', {
      provider,
      tools: [DUMMY_TOOL],
      toolContext: FIXTURE_CTX,
      systemPrompt: SYSTEM_PROMPT,
    });

    // 4 tool calls + 1 synthesis = 5 total provider invocations
    expect(callCount).toBe(5);
    expect(result.finalText).toBe('Here is what I found.');
  });

  it('falls back to buildFallbackSummary when forced synthesis returns empty text', async () => {
    let callCount = 0;
    const provider: AgentProvider = {
      async complete(_messages, tools): Promise<AgentTurnResult> {
        callCount++;
        if (tools.length > 0) {
          return { text: '', toolCall: { name: 'get_course_info', args: { course_id: 'ECE 302' } } };
        }
        // Synthesis returns nothing
        return { text: '', toolCall: null };
      },
    };

    const result = await runAgentTurn([], 'Look up everything', {
      provider,
      tools: [DUMMY_TOOL],
      toolContext: FIXTURE_CTX,
      systemPrompt: SYSTEM_PROMPT,
    });

    expect(result.finalText.length).toBeGreaterThan(0);
    expect(result.finalText).toContain('get_course_info');
  });
});

describe('runAgentTurn - propose_plan_edit is still terminal passthrough in multi-step context', () => {
  it('returns immediately on propose_plan_edit even when it is not the first call', async () => {
    let callCount = 0;
    const provider: AgentProvider = {
      async complete(): Promise<AgentTurnResult> {
        callCount++;
        if (callCount === 1) {
          // First call: a read tool
          return { text: '', toolCall: { name: 'get_course_info', args: { course_id: 'ECE 302' } } };
        }
        // Second call: switches to propose_plan_edit — must be terminal
        return {
          text: '',
          toolCall: { name: 'propose_plan_edit', args: { operations: [], reasoning: 'test' } },
        };
      },
    };

    const result = await runAgentTurn([], 'Add ECE 302 to my plan', {
      provider,
      tools: [DUMMY_TOOL, PROPOSE_PLAN_TOOL],
      toolContext: FIXTURE_CTX,
      systemPrompt: SYSTEM_PROMPT,
    });

    // Only 2 calls — passthrough must be terminal after the read tool
    expect(callCount).toBe(2);
    expect(result.toolCallMade?.name).toBe('propose_plan_edit');
    expect(result.toolResult).toEqual({
      type: 'plan_edit_proposal',
      proposal: { operations: [], reasoning: 'test' },
    });
  });
});

describe('runAgentTurn - direct answer (no tool) still works', () => {
  it('returns text directly with null toolCallMade when model never uses a tool', async () => {
    let callCount = 0;
    const provider: AgentProvider = {
      async complete(): Promise<AgentTurnResult> {
        callCount++;
        return { text: 'Direct answer, no tools needed.', toolCall: null };
      },
    };

    const result = await runAgentTurn([], 'What is ECE?', {
      provider,
      tools: [DUMMY_TOOL],
      toolContext: FIXTURE_CTX,
      systemPrompt: SYSTEM_PROMPT,
    });

    expect(callCount).toBe(1);
    expect(result.finalText).toBe('Direct answer, no tools needed.');
    expect(result.toolCallMade).toBeNull();
    expect(result.toolResult).toBeNull();
  });
});

describe('runAgentTurn - text answer after one tool (no forced synthesis)', () => {
  it('returns model text directly after one tool without an extra synthesis call', async () => {
    // This tests the key new behavior: when the model answers after tool calls,
    // the forced synthesis call should NOT be made.
    let callCount = 0;
    const provider: AgentProvider = {
      async complete(): Promise<AgentTurnResult> {
        callCount++;
        if (callCount === 1) {
          return { text: '', toolCall: { name: 'get_course_info', args: { course_id: 'ECE 302' } } };
        }
        // After tool result, model answers directly
        return { text: 'ECE 302 covers signals and systems.', toolCall: null };
      },
    };

    const result = await runAgentTurn([], 'Tell me about ECE 302', {
      provider,
      tools: [DUMMY_TOOL],
      toolContext: FIXTURE_CTX,
      systemPrompt: SYSTEM_PROMPT,
    });

    // Exactly 2 calls — the model answered after the tool, no third synthesis call needed
    expect(callCount).toBe(2);
    expect(result.finalText).toBe('ECE 302 covers signals and systems.');
    expect(result.toolCallMade?.name).toBe('get_course_info');
  });
});

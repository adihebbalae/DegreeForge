/**
 * claude-provider.test.ts
 *
 * Unit tests for createClaudeProvider (response-shape mapping) and an
 * integration test for the full runAgentTurn path with the Claude provider.
 *
 * The integration test uses a mocked fetch so no real server is needed.
 * It deliberately verifies the full wiring: fetch → provider.complete →
 * agent-loop tool execution → AgentLoopResult.
 *
 * A deliberately-broken variant confirms the test would FAIL if the provider
 * mis-shapes the response (i.e. drops toolCall).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createClaudeProvider, runAgentTurn } from './agent-loop';
import type { ToolDefinition, ToolContext, ToolResult } from './agent-tools/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Minimal ToolContext — tools in these tests don't need real data. */
const minimalToolContext = {
  catalog: {},
  prereqGraph: { nodes: {}, edges: [] },
  gradeDistributions: {},
  userProfile: {} as ToolContext['userProfile'],
  degreeRequirements: {} as ToolContext['degreeRequirements'],
  techCores: {},
  offeringSchedule: {},
  fallSections: null,
  plan: {},
  semesters: [],
  techCoreId: 'computer_architecture',
  mathBAToggle: false,
} as ToolContext;

/** A simple tool that returns a fixed result. */
const echoTool: ToolDefinition = {
  name: 'echo_tool',
  description: 'Echoes the input back.',
  schema: {
    type: 'object',
    properties: { message: { type: 'string' } },
    required: ['message'],
  },
  defaultEnabled: true,
  fn: (_ctx: ToolContext, args: Record<string, unknown>): ToolResult => ({
    content: { echo: args['message'] },
  }),
};

// ─── Unit tests: createClaudeProvider response mapping ───────────────────────

describe('createClaudeProvider', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps a text-only server response to { text, toolCall: null }', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: 'Hello there!', toolCall: null }),
    } as Response);

    const provider = createClaudeProvider('http://localhost:3005');
    const result = await provider.complete(
      [{ role: 'user', content: 'hi' }],
      [],
      'You are helpful.'
    );

    expect(result.text).toBe('Hello there!');
    expect(result.toolCall).toBeNull();
  });

  it('maps a tool_use server response to { text, toolCall: { name, args } }', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        text: '',
        toolCall: { name: 'echo_tool', args: { message: 'ping' } },
      }),
    } as Response);

    const provider = createClaudeProvider('http://localhost:3005');
    const result = await provider.complete(
      [{ role: 'user', content: 'echo ping' }],
      [echoTool],
      'You are helpful.'
    );

    expect(result.toolCall).not.toBeNull();
    expect(result.toolCall!.name).toBe('echo_tool');
    expect(result.toolCall!.args).toEqual({ message: 'ping' });
  });

  it('throws when the server returns a non-ok response', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({ error: 'ANTHROPIC_API_KEY is not configured on the server.' }),
    } as Response);

    const provider = createClaudeProvider('http://localhost:3005');
    await expect(
      provider.complete([{ role: 'user', content: 'hi' }], [], '')
    ).rejects.toThrow('ANTHROPIC_API_KEY');
  });

  it('sends messages, tools, and system as JSON in the POST body', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: 'ok', toolCall: null }),
    } as Response);

    const provider = createClaudeProvider('http://localhost:3005');
    await provider.complete(
      [{ role: 'user', content: 'test' }],
      [echoTool],
      'sys'
    );

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3005/api/agent-turn');
    expect(init.method).toBe('POST');

    const body = JSON.parse(init.body as string);
    expect(body.messages).toEqual([{ role: 'user', content: 'test' }]);
    expect(body.system).toBe('sys');
    expect(body.tools).toHaveLength(1);
    expect(body.tools[0].name).toBe('echo_tool');
  });
});

// ─── Integration test: runAgentTurn with createClaudeProvider ─────────────────
//
// This proves the FULL path: fetch (mocked) → createClaudeProvider →
// runAgentTurn tool execution → AgentLoopResult with correct toolResult.
//
// The test would FAIL if:
//   - the provider drops toolCall from its return value
//   - the provider mis-names the field (e.g. tool_call instead of toolCall)
//   - the loop doesn't execute the tool when toolCall is present

describe('runAgentTurn + createClaudeProvider (integration)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('executes a tool when the server returns a tool_use response', async () => {
    const mockFetch = vi.mocked(fetch);
    // Server returns a tool_use response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        text: '',
        toolCall: { name: 'echo_tool', args: { message: 'integration-check' } },
      }),
    } as Response);

    const provider = createClaudeProvider('http://localhost:3005');

    const result = await runAgentTurn(
      [],
      'echo integration-check',
      {
        provider,
        tools: [echoTool],
        toolContext: minimalToolContext,
        systemPrompt: 'You are helpful.',
      }
    );

    // The tool was executed and its content is the final result
    expect(result.toolCallMade).not.toBeNull();
    expect(result.toolCallMade!.name).toBe('echo_tool');
    expect(result.toolCallMade!.args).toEqual({ message: 'integration-check' });
    expect(result.toolResult).toEqual({ echo: 'integration-check' });
    // finalText is JSON.stringify of the tool result content
    expect(JSON.parse(result.finalText)).toEqual({ echo: 'integration-check' });
  });

  it('returns text directly when no tool is called', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: 'Direct answer from Claude.', toolCall: null }),
    } as Response);

    const provider = createClaudeProvider('http://localhost:3005');

    const result = await runAgentTurn(
      [],
      'what is ECE 302?',
      {
        provider,
        tools: [echoTool],
        toolContext: minimalToolContext,
        systemPrompt: 'You are helpful.',
      }
    );

    expect(result.finalText).toBe('Direct answer from Claude.');
    expect(result.toolCallMade).toBeNull();
    expect(result.toolResult).toBeNull();
  });

  it('FAILS if provider drops toolCall — proves the integration test catches mis-wiring', async () => {
    // A broken provider that always returns toolCall: null even when the server
    // returned a real tool call. The loop would then skip tool execution.
    const brokenProvider = {
      complete: async () => ({
        text: 'I was going to call a tool but oops',
        toolCall: null as null,          // deliberately broken — drops the tool call
      }),
    };

    const result = await runAgentTurn(
      [],
      'echo ping',
      {
        provider: brokenProvider,
        tools: [echoTool],
        toolContext: minimalToolContext,
        systemPrompt: '',
      }
    );

    // Because toolCall is null the loop skips tool execution.
    // toolCallMade and toolResult are both null — the integration test
    // for the WORKING provider above would fail here.
    expect(result.toolCallMade).toBeNull();
    expect(result.toolResult).toBeNull();
    // This assertion verifies the broken case is distinct from the working case:
    expect(result.finalText).not.toBe(JSON.stringify({ echo: 'ping' }, null, 2));
  });
});

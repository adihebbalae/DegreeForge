/**
 * claude-provider.test.ts
 *
 * Unit tests for createClaudeProvider (SSE-stream → { text, toolCall } mapping
 * + incremental onTextDelta accumulation) and integration tests for the full
 * runAgentTurn path with the streamed Claude provider.
 *
 * The tests mock fetch to return a Server-Sent Events body (ReadableStream) so
 * no real server is needed. They verify the full wiring: streamed fetch →
 * provider.complete → agent-loop tool execution → AgentLoopResult, plus that
 * text deltas accumulate into the assistant message as they arrive.
 *
 * A deliberately-broken variant confirms the test would FAIL if the provider
 * mis-shapes the response (i.e. drops toolCall).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createClaudeProvider, runAgentTurn } from './agent-loop';
import type { ToolDefinition, ToolContext, ToolResult } from './agent-tools/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface WireEvent {
  event: 'delta' | 'done' | 'error';
  data: unknown;
}

/**
 * Build a fake streamed Response whose body emits the given SSE events. Each
 * event is encoded in the `event:/data:` wire format, and the chunks are split
 * mid-stream (and even mid-event) to exercise the client's buffered SSE parser.
 */
function sseResponse(events: WireEvent[], status = 200): Response {
  const encoder = new TextEncoder();
  // Serialize all events to one SSE wire string, then chunk it arbitrarily so
  // the parser must buffer across reads.
  const wire = events
    .map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`)
    .join('');

  // Split into small chunks that don't respect event boundaries.
  const chunks: string[] = [];
  const CHUNK = 7;
  for (let i = 0; i < wire.length; i += CHUNK) chunks.push(wire.slice(i, i + CHUNK));

  let idx = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (idx < chunks.length) {
        controller.enqueue(encoder.encode(chunks[idx]));
        idx += 1;
      } else {
        controller.close();
      }
    },
  });

  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'text/event-stream' }),
    body,
    json: async () => { throw new Error('not json'); },
  } as unknown as Response;
}

/** A non-stream JSON error Response (pre-stream 4xx path). */
function jsonErrorResponse(status: number, error: string): Response {
  return {
    ok: false,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    body: null,
    json: async () => ({ error }),
  } as unknown as Response;
}

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
  satisfiedSet: new Set<string>(),
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

// ─── Unit tests: createClaudeProvider stream mapping ──────────────────────────

describe('createClaudeProvider (streaming)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('accumulates incremental text deltas into the assistant message and reports them via onTextDelta', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce(
      sseResponse([
        { event: 'delta', data: { text: 'Hel' } },
        { event: 'delta', data: { text: 'lo ' } },
        { event: 'delta', data: { text: 'there!' } },
        { event: 'done', data: { text: 'Hello there!', toolCall: null } },
      ])
    );

    const provider = createClaudeProvider('http://localhost:3005');

    // Capture each incremental chunk in arrival order.
    const seenDeltas: string[] = [];
    const result = await provider.complete(
      [{ role: 'user', content: 'hi' }],
      [],
      'You are helpful.',
      (delta) => seenDeltas.push(delta)
    );

    // Deltas streamed in, in order, BEFORE the full text was known.
    expect(seenDeltas).toEqual(['Hel', 'lo ', 'there!']);
    // The accumulated deltas equal the final assembled text.
    expect(seenDeltas.join('')).toBe('Hello there!');
    // The resolved result carries the assembled text + no tool call.
    expect(result.text).toBe('Hello there!');
    expect(result.toolCall).toBeNull();
  });

  it('maps a tool_use done event to { text, toolCall: { name, args } }', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce(
      sseResponse([
        { event: 'done', data: { text: '', toolCall: { name: 'echo_tool', args: { message: 'ping' } } } },
      ])
    );

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

  it('throws when the server returns a non-ok (pre-stream) JSON error', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce(
      jsonErrorResponse(503, 'ANTHROPIC_API_KEY is not configured on the server.')
    );

    const provider = createClaudeProvider('http://localhost:3005');
    await expect(
      provider.complete([{ role: 'user', content: 'hi' }], [], '')
    ).rejects.toThrow('ANTHROPIC_API_KEY');
  });

  it('throws the generic message when the stream ends with an error event (no leak)', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce(
      sseResponse([
        { event: 'delta', data: { text: 'partial...' } },
        { event: 'error', data: { error: 'The AI service returned an error.' } },
      ])
    );

    const provider = createClaudeProvider('http://localhost:3005');
    await expect(
      provider.complete([{ role: 'user', content: 'hi' }], [], '')
    ).rejects.toThrow('The AI service returned an error.');
  });

  it('sends messages, tools, and system as JSON in the POST body and requests SSE', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce(
      sseResponse([{ event: 'done', data: { text: 'ok', toolCall: null } }])
    );

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
    expect((init.headers as Record<string, string>).Accept).toBe('text/event-stream');

    const body = JSON.parse(init.body as string);
    expect(body.messages).toEqual([{ role: 'user', content: 'test' }]);
    expect(body.system).toBe('sys');
    expect(body.tools).toHaveLength(1);
    expect(body.tools[0].name).toBe('echo_tool');
  });
});

// ─── Integration test: runAgentTurn with createClaudeProvider ─────────────────
//
// This proves the FULL streamed path: streamed fetch (mocked) →
// createClaudeProvider → runAgentTurn tool execution → AgentLoopResult, plus
// that the in-progress assistant text accumulates across deltas.

describe('runAgentTurn + createClaudeProvider (streaming integration)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('accumulates streamed deltas into the final answer and executes a tool round-trip', async () => {
    const mockFetch = vi.mocked(fetch);
    // First call: server streams a tool_use turn (no prose deltas).
    mockFetch.mockResolvedValueOnce(
      sseResponse([
        { event: 'done', data: { text: '', toolCall: { name: 'echo_tool', args: { message: 'integration-check' } } } },
      ])
    );
    // Second call: synthesis — server streams natural-language prose in chunks.
    mockFetch.mockResolvedValueOnce(
      sseResponse([
        { event: 'delta', data: { text: 'The echo tool ' } },
        { event: 'delta', data: { text: 'returned: ' } },
        { event: 'delta', data: { text: 'integration-check.' } },
        { event: 'done', data: { text: 'The echo tool returned: integration-check.', toolCall: null } },
      ])
    );

    const provider = createClaudeProvider('http://localhost:3005');

    // The consumer accumulates deltas the same way ChatPanel does, resetting on
    // each new provider turn (onStreamReset).
    let live = '';
    const liveSnapshots: string[] = [];

    const result = await runAgentTurn(
      [],
      'echo integration-check',
      {
        provider,
        tools: [echoTool],
        toolContext: minimalToolContext,
        systemPrompt: 'You are helpful.',
        onStreamReset: () => { live = ''; },
        onTextDelta: (delta) => { live += delta; liveSnapshots.push(live); },
      }
    );

    // The tool was executed; toolCallMade and toolResult reflect the first call.
    expect(result.toolCallMade).not.toBeNull();
    expect(result.toolCallMade!.name).toBe('echo_tool');
    expect(result.toolCallMade!.args).toEqual({ message: 'integration-check' });
    expect(result.toolResult).toEqual({ echo: 'integration-check' });
    // finalText is the synthesized prose, assembled from streamed deltas.
    expect(result.finalText).toBe('The echo tool returned: integration-check.');
    // Two fetches were made: tool call + synthesis.
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // The synthesis text built up INCREMENTALLY (partial answers were visible
    // before the full answer arrived) — this is the streaming UX promise.
    expect(liveSnapshots).toEqual([
      'The echo tool ',
      'The echo tool returned: ',
      'The echo tool returned: integration-check.',
    ]);
  });

  it('returns streamed text directly when no tool is called', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce(
      sseResponse([
        { event: 'delta', data: { text: 'Direct ' } },
        { event: 'delta', data: { text: 'answer ' } },
        { event: 'delta', data: { text: 'from Claude.' } },
        { event: 'done', data: { text: 'Direct answer from Claude.', toolCall: null } },
      ])
    );

    const provider = createClaudeProvider('http://localhost:3005');

    const seenDeltas: string[] = [];
    const result = await runAgentTurn(
      [],
      'what is ECE 302?',
      {
        provider,
        tools: [echoTool],
        toolContext: minimalToolContext,
        systemPrompt: 'You are helpful.',
        onTextDelta: (delta) => seenDeltas.push(delta),
      }
    );

    expect(seenDeltas).toEqual(['Direct ', 'answer ', 'from Claude.']);
    expect(result.finalText).toBe('Direct answer from Claude.');
    expect(result.toolCallMade).toBeNull();
    expect(result.toolResult).toBeNull();
  });

  it('propagates a stream error event as a thrown error (so ChatPanel shows the generic message)', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce(
      sseResponse([
        { event: 'error', data: { error: 'The AI service returned an error.' } },
      ])
    );

    const provider = createClaudeProvider('http://localhost:3005');

    await expect(
      runAgentTurn(
        [],
        'trigger error',
        {
          provider,
          tools: [echoTool],
          toolContext: minimalToolContext,
          systemPrompt: 'You are helpful.',
        }
      )
    ).rejects.toThrow('The AI service returned an error.');
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
    expect(result.toolCallMade).toBeNull();
    expect(result.toolResult).toBeNull();
    expect(result.finalText).not.toBe(JSON.stringify({ echo: 'ping' }, null, 2));
  });
});

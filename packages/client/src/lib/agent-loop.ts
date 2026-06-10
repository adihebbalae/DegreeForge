/**
 * agent-loop.ts
 *
 * Provider-agnostic agentic chat loop.
 * Supports up to MAX_TOOL_CALLS sequential tool executions per user turn.
 * The loop continues until the model returns text without a tool call, a
 * passthrough tool (propose_plan_edit) is executed, or the cap is reached.
 * On cap, a final tool-less synthesis call produces the prose answer.
 *
 * Currently ships an Ollama adapter and a Claude adapter.
 */

import type { ToolContext, ToolDefinition } from './agent-tools/types';

// ─── Provider-agnostic types ──────────────────────────────────────────────────

export interface AgentMessage {
  role: 'user' | 'assistant' | 'tool_result';
  content: string;
  /** Present only on tool_result messages */
  tool_name?: string;
}

export interface AgentToolCall {
  name: string;
  args: Record<string, unknown>;
}

/** What the model returns for a single turn */
export interface AgentTurnResult {
  text: string;
  toolCall: AgentToolCall | null;
}

/**
 * A provider wraps one LLM backend. It receives the conversation history +
 * tool schemas, and returns either a text response or a single tool call.
 */
export interface AgentProvider {
  complete(
    messages: AgentMessage[],
    tools: ToolDefinition[],
    systemPrompt: string
  ): Promise<AgentTurnResult>;
}

// ─── Ollama adapter ───────────────────────────────────────────────────────────

export interface OllamaAdapterOptions {
  baseUrl?: string;
  model?: string;
}

/**
 * Ollama adapter — calls /api/chat with tool schemas in Ollama's JSON format.
 * Parses a tool_call from the response if present; otherwise returns text.
 */
export function createOllamaProvider(opts: OllamaAdapterOptions = {}): AgentProvider {
  const baseUrl = opts.baseUrl ?? (
    typeof import.meta !== 'undefined' && (import.meta as unknown as Record<string, unknown>).env
      ? ((import.meta as unknown as Record<string, Record<string, string>>).env['VITE_OLLAMA_URL'] ?? 'http://localhost:11434')
      : 'http://localhost:11434'
  );
  const model = opts.model ?? 'llama3';

  return {
    async complete(messages, tools, systemPrompt): Promise<AgentTurnResult> {
      const ollamaMessages = [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({ role: m.role === 'tool_result' ? 'tool' : m.role, content: m.content })),
      ];

      const ollamaTools = tools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.schema,
        },
      }));

      const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: ollamaMessages,
          tools: ollamaTools,
          stream: false,
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama error ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as {
        message?: {
          content?: string;
          tool_calls?: Array<{ function: { name: string; arguments: string | Record<string, unknown> } }>;
        };
      };

      const msg = data.message ?? {};
      const rawToolCalls = msg.tool_calls ?? [];

      if (rawToolCalls.length > 0) {
        // 1-tool-call cap: only process the first
        const first = rawToolCalls[0];
        let parsedArgs: Record<string, unknown> = {};
        if (typeof first.function.arguments === 'string') {
          try { parsedArgs = JSON.parse(first.function.arguments); } catch { parsedArgs = {}; }
        } else {
          parsedArgs = first.function.arguments;
        }
        return { text: msg.content ?? '', toolCall: { name: first.function.name, args: parsedArgs } };
      }

      return { text: msg.content ?? '', toolCall: null };
    },
  };
}

// ─── Shared base-URL helper ───────────────────────────────────────────────────

/**
 * Returns the backend server base URL.
 *
 * In dev, Vite proxies relative paths to :3005, but cross-origin fetches (e.g.
 * from components that need to reach the server directly) require an absolute
 * URL. Set VITE_SERVER_URL at build time for production deployments; the
 * localhost fallback is correct for local development.
 */
export function serverBaseUrl(): string {
  if (
    typeof import.meta !== 'undefined' &&
    (import.meta as unknown as Record<string, unknown>).env
  ) {
    return (
      (import.meta as unknown as Record<string, Record<string, string>>).env[
        'VITE_SERVER_URL'
      ] ?? 'http://localhost:3005'
    );
  }
  return 'http://localhost:3005';
}

// ─── Claude adapter ───────────────────────────────────────────────────────────

/**
 * Claude adapter — POSTs to the Express server's /api/agent-turn endpoint.
 * The server holds the Anthropic API key; the browser never sees it.
 * The endpoint runs one non-streaming tool-use turn and returns { text, toolCall }.
 *
 * accessCode is sent as `x-access-code` for the invite-beta gate.
 * An empty string is safe — the server ignores it when BETA_ACCESS_SECRET is unset.
 */
export function createClaudeProvider(baseUrl?: string, accessCode = ''): AgentProvider {
  const resolvedBaseUrl = baseUrl ?? serverBaseUrl();

  return {
    async complete(messages, tools, systemPrompt): Promise<AgentTurnResult> {
      let response: Response;
      try {
        response = await fetch(`${resolvedBaseUrl}/api/agent-turn`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-access-code': accessCode,
          },
          body: JSON.stringify({
            messages,
            tools: tools.map(t => ({ name: t.name, description: t.description, schema: t.schema })),
            system: systemPrompt,
          }),
          signal: AbortSignal.timeout(60000),
        });
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'TimeoutError') {
          throw new Error('The AI service did not respond within 60 seconds. Please try again.');
        }
        throw err;
      }

      if (!response.ok) {
        let errMsg = `Server error ${response.status}`;
        try {
          const errData = await response.json() as { error?: string };
          if (errData.error) errMsg = errData.error;
        } catch { /* ignore json parse failure */ }
        throw new Error(errMsg);
      }

      const data = await response.json() as {
        text?: string;
        toolCall?: { name: string; args: Record<string, unknown> } | null;
      };

      return {
        text: data.text ?? '',
        toolCall: data.toolCall ?? null,
      };
    },
  };
}

// ─── Agent loop ───────────────────────────────────────────────────────────────

export interface AgentLoopOptions {
  provider: AgentProvider;
  tools: ToolDefinition[];
  toolContext: ToolContext;
  systemPrompt: string;
}

export interface AgentLoopResult {
  /** Final text response shown to the user */
  finalText: string;
  /** Tool that was called (null if model answered directly) */
  toolCallMade: AgentToolCall | null;
  /** Serialized tool result (null if no tool was called) */
  toolResult: unknown | null;
}

/**
 * Tools that produce structured UI output consumed directly by ChatPanel.
 * These are NOT synthesized into prose — their raw toolResult drives the UI.
 */
const PASSTHROUGH_TOOLS = new Set(['propose_plan_edit']);

/**
 * Maximum number of read-tool executions allowed in a single user turn.
 * When reached, the loop breaks and a final tool-less synthesis call is made.
 */
const MAX_TOOL_CALLS = 4;

/**
 * Build a compact, human-readable summary of a tool result for use as a
 * synthesis fallback when the second model call also returns a tool call
 * (i.e. the model tries to chain tools, which we don't allow).
 */
function buildFallbackSummary(toolName: string, content: unknown): string {
  if (content === null || content === undefined) {
    return `The ${toolName} tool returned no data.`;
  }
  if (typeof content === 'string') {
    return content.length > 300 ? content.slice(0, 300) + '…' : content;
  }
  const json = JSON.stringify(content);
  return json.length > 300
    ? `Here is a summary from ${toolName}: ${json.slice(0, 300)}…`
    : `Here is the result from ${toolName}: ${json}`;
}

/**
 * Run one user turn through the agentic loop.
 *
 * Supports up to MAX_TOOL_CALLS sequential read-tool executions:
 *   - Each iteration: call provider.complete with the current message history.
 *   - No toolCall returned → return text directly as the final answer.
 *   - toolCall is a PASSTHROUGH tool (propose_plan_edit) → execute and return
 *     the raw structured result for the diff-card UI. Terminal — no looping.
 *   - Otherwise (read tool) → execute it, append the result as a tool_result
 *     message, and loop again up to MAX_TOOL_CALLS total executions.
 *   - When the counter hits MAX_TOOL_CALLS, break and make ONE final tool-less
 *     synthesis call; return its text (or buildFallbackSummary if empty).
 *
 * toolCallMade / toolResult are set to the LAST executed tool call + result so
 * existing ChatPanel rendering still works.
 */
export async function runAgentTurn(
  history: AgentMessage[],
  userMessage: string,
  opts: AgentLoopOptions
): Promise<AgentLoopResult> {
  const messages: AgentMessage[] = [
    ...history,
    { role: 'user', content: userMessage },
  ];

  const synthesisSystemPrompt =
    `${opts.systemPrompt}\n\nYou have already retrieved the tool result(s) above. Answer the user's question directly and concisely using them. Do NOT say you will look something up — you already have the data. If the data is insufficient to fully answer, say briefly what is missing.`;

  let toolCallsMade = 0;
  let lastToolCall: AgentToolCall | null = null;
  let lastToolResult: unknown | null = null;

  while (true) {
    const turn = await opts.provider.complete(messages, opts.tools, opts.systemPrompt);

    if (!turn.toolCall) {
      // Model answered directly — this is the final answer regardless of how
      // many tools were called before.
      return {
        finalText: turn.text,
        toolCallMade: lastToolCall,
        toolResult: lastToolResult,
      };
    }

    const toolDef = opts.tools.find(t => t.name === turn.toolCall!.name);
    if (!toolDef) {
      return {
        finalText: `I tried to use the tool "${turn.toolCall.name}" but it's not available.`,
        toolCallMade: turn.toolCall,
        toolResult: null,
      };
    }

    const result = toolDef.fn(opts.toolContext, turn.toolCall.args);
    const toolCall = turn.toolCall;

    // Passthrough tools: return raw result so ChatPanel can render the UI widget.
    // Terminal — do not loop.
    if (PASSTHROUGH_TOOLS.has(toolCall.name)) {
      return {
        finalText: JSON.stringify(result.content, null, 2),
        toolCallMade: toolCall,
        toolResult: result.content,
      };
    }

    // Track the most recently executed read-tool call + result.
    lastToolCall = toolCall;
    lastToolResult = result.content;
    toolCallsMade++;

    // Append the tool result to the conversation so the model has context on
    // the next iteration.
    messages.push({
      role: 'tool_result',
      content: JSON.stringify(result.content),
      tool_name: toolCall.name,
    });

    if (toolCallsMade >= MAX_TOOL_CALLS) {
      // Cap reached — force a final tool-less synthesis call so the model
      // answers in prose from the accumulated tool results.
      break;
    }
  }

  // Final tool-less synthesis call: empty tools array so the model cannot
  // request another tool; augmented system prompt reinforces direct answering.
  const synthesis = await opts.provider.complete(
    messages,
    [],
    synthesisSystemPrompt
  );

  const finalText = synthesis.text.trim()
    ? synthesis.text
    : buildFallbackSummary(lastToolCall!.name, lastToolResult);

  return {
    finalText,
    toolCallMade: lastToolCall,
    toolResult: lastToolResult,
  };
}

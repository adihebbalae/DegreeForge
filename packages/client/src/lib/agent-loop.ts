/**
 * agent-loop.ts
 *
 * Provider-agnostic agentic chat loop.
 * Enforces a 1-tool-call cap per turn: the model may return at most one tool
 * call per user message. If the model response contains a tool call, the loop:
 *   1. Executes the tool deterministically against ToolContext.
 *   2. Appends the result as a tool-result message.
 *   3. Returns the final text response (no recursive re-entry).
 *
 * Currently ships an Ollama adapter. Claude adapter is a TODO (see below).
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

// TODO: Claude adapter (drop-in, ~30 LOC)
// export function createClaudeProvider(opts: { apiKey?: string; model?: string }): AgentProvider { ... }
// The Claude adapter would POST to /api/chat with ?provider=claude and let the
// server proxy handle the Anthropic SDK call with tool_use blocks.

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
 * Run one user turn through the agentic loop.
 *
 * Cap: exactly one tool call per turn. If the model returns a tool call, we
 * execute it, append the result, and return. We do NOT loop back for a second
 * model call — the tool result itself becomes the assistant response content.
 * This prevents runaway tool storms and keeps UI latency predictable.
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

  const turn = await opts.provider.complete(messages, opts.tools, opts.systemPrompt);

  if (!turn.toolCall) {
    return { finalText: turn.text, toolCallMade: null, toolResult: null };
  }

  // Execute the tool (1-tool cap enforced — no second call)
  const toolDef = opts.tools.find(t => t.name === turn.toolCall!.name);
  if (!toolDef) {
    return {
      finalText: `I tried to use the tool "${turn.toolCall.name}" but it's not available.`,
      toolCallMade: turn.toolCall,
      toolResult: null,
    };
  }

  const result = toolDef.fn(opts.toolContext, turn.toolCall.args);
  return {
    finalText: JSON.stringify(result.content, null, 2),
    toolCallMade: turn.toolCall,
    toolResult: result.content,
  };
}

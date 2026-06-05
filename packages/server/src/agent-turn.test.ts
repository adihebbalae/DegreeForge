import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock the Anthropic SDK ────────────────────────────────────────────────────

const mockCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        create: mockCreate,
      },
    })),
  };
});

// Mock cache so no filesystem I/O happens
vi.mock('./cache', () => ({
  getCachedResponse: vi.fn().mockResolvedValue(null),
  setCachedResponse: vi.fn().mockResolvedValue(undefined),
}));

// ─── Import app after mocks are registered ────────────────────────────────────

// We build a minimal Express app that mirrors exactly the /api/agent-turn
// handler from index.ts so we can test the endpoint in isolation.
// This avoids importing the full index.ts (which calls app.listen).

import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { tokenCapMiddleware } from './middleware/tokenCap.js';

function buildTestApp(apiKey: string | undefined) {
  const app = express();
  app.use(express.json());

  const anthropic = new Anthropic({ apiKey });

  app.post('/api/agent-turn', tokenCapMiddleware, async (req: express.Request, res: express.Response) => {
    if (!apiKey) {
      return res.status(503).json({ error: 'ANTHROPIC_API_KEY is not configured on the server.' });
    }

    const { messages, tools, system } = req.body as {
      messages?: Array<{ role: string; content: string; tool_name?: string }>;
      tools?: Array<{ name: string; description: string; schema: Record<string, unknown> }>;
      system?: string;
    };

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages must be an array' });
    }
    if (messages.length > 100) {
      return res.status(400).json({ error: 'messages array exceeds 100 entries' });
    }

    const anthropicMessages: Anthropic.Messages.MessageParam[] = messages.map((m) => {
      if (m.role === 'tool_result') {
        return { role: 'user' as const, content: `[tool_result:${m.tool_name ?? 'unknown'}] ${m.content}` };
      }
      return { role: m.role as 'user' | 'assistant', content: m.content };
    });

    const anthropicTools: Anthropic.Messages.Tool[] = (tools ?? []).map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.schema as Anthropic.Messages.Tool['input_schema'],
    }));

    const model = 'claude-sonnet-4-6';

    try {
      const response = await anthropic.messages.create({
        model,
        max_tokens: 1024,
        system: system ?? '',
        messages: anthropicMessages,
        tools: anthropicTools.length > 0 ? anthropicTools : undefined,
      });

      let text = '';
      let toolCall: { name: string; args: Record<string, unknown> } | null = null;

      for (const block of response.content) {
        if (block.type === 'text') {
          text += (block as { type: 'text'; text: string }).text;
        } else if (block.type === 'tool_use' && toolCall === null) {
          const tb = block as { type: 'tool_use'; name: string; input: Record<string, unknown> };
          toolCall = { name: tb.name, args: tb.input };
        }
      }

      return res.json({ text, toolCall });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error from Anthropic SDK';
      return res.status(500).json({ error: msg });
    }
  });

  return app;
}

// ─── Supertest-style request helper ───────────────────────────────────────────
// We avoid importing supertest (not in deps) and use Node's built-in http instead.

import http from 'http';

function request(app: express.Express, method: string, path: string, body: unknown): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const port = (server.address() as { port: number }).port;
      const payload = JSON.stringify(body);
      const options: http.RequestOptions = {
        hostname: 'localhost',
        port,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      };
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          server.close();
          try {
            resolve({ status: res.statusCode ?? 0, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode ?? 0, body: data });
          }
        });
      });
      req.on('error', (err) => { server.close(); reject(err); });
      req.write(payload);
      req.end();
    });
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('/api/agent-turn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a text turn when the model responds with text content', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Hello from Claude!' }],
    });

    const app = buildTestApp('test-key');
    const res = await request(app, 'POST', '/api/agent-turn', {
      messages: [{ role: 'user', content: 'hi' }],
      tools: [],
      system: 'You are helpful.',
    });

    expect(res.status).toBe(200);
    expect((res.body as { text: string; toolCall: null }).text).toBe('Hello from Claude!');
    expect((res.body as { text: string; toolCall: null }).toolCall).toBeNull();
  });

  it('returns a tool_use turn when the model calls a tool', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        { type: 'tool_use', name: 'get_course_info', input: { courseId: 'ECE 302' } },
      ],
    });

    const app = buildTestApp('test-key');
    const res = await request(app, 'POST', '/api/agent-turn', {
      messages: [{ role: 'user', content: 'Tell me about ECE 302' }],
      tools: [{ name: 'get_course_info', description: 'Get course info', schema: { type: 'object', properties: { courseId: { type: 'string' } } } }],
      system: 'You are helpful.',
    });

    expect(res.status).toBe(200);
    const body = res.body as { text: string; toolCall: { name: string; args: Record<string, unknown> } };
    expect(body.toolCall).not.toBeNull();
    expect(body.toolCall.name).toBe('get_course_info');
    expect(body.toolCall.args).toEqual({ courseId: 'ECE 302' });
  });

  it('returns 503 when ANTHROPIC_API_KEY is not set', async () => {
    const app = buildTestApp(undefined);
    const res = await request(app, 'POST', '/api/agent-turn', {
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(res.status).toBe(503);
    expect((res.body as { error: string }).error).toContain('ANTHROPIC_API_KEY');
  });

  it('returns 400 when messages is missing', async () => {
    const app = buildTestApp('test-key');
    const res = await request(app, 'POST', '/api/agent-turn', {});

    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toContain('messages');
  });

  it('returns 500 and error message when the Anthropic SDK throws', async () => {
    mockCreate.mockRejectedValueOnce(new Error('SDK network failure'));

    const app = buildTestApp('test-key');
    const res = await request(app, 'POST', '/api/agent-turn', {
      messages: [{ role: 'user', content: 'hi' }],
      tools: [],
    });

    expect(res.status).toBe(500);
    expect((res.body as { error: string }).error).toContain('SDK network failure');
  });

  it('only returns the first tool_use block when the response contains multiple', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        { type: 'tool_use', name: 'first_tool', input: { a: 1 } },
        { type: 'tool_use', name: 'second_tool', input: { b: 2 } },
      ],
    });

    const app = buildTestApp('test-key');
    const res = await request(app, 'POST', '/api/agent-turn', {
      messages: [{ role: 'user', content: 'hi' }],
      tools: [],
    });

    expect(res.status).toBe(200);
    const body = res.body as { toolCall: { name: string } };
    expect(body.toolCall.name).toBe('first_tool');
  });
});

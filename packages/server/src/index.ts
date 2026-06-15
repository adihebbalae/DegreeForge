import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { getCachedResponse, setCachedResponse } from './cache';
import { callLLM, parseModelJson, ModelOutputError } from './llm';
import { tokenCapMiddleware } from './middleware/tokenCap';
import { requireAccessCode } from './middleware/accessCode';

dotenv.config({ path: '../../.env' });

// Startup visibility: warn when no explicit key is set so misconfiguration is
// obvious in logs, but a local `ant auth login` profile is a valid auth source
// and will be picked up automatically by the SDK.
if (!process.env.ANTHROPIC_API_KEY) {
  console.warn('[startup] No ANTHROPIC_API_KEY set; relying on ANTHROPIC_AUTH_TOKEN or an `ant auth login` profile (fine for local dev).');
}

const app = express();

// Trust the first proxy hop so req.ip reflects the real client IP from
// X-Forwarded-For. Required for rate limiting / per-IP caps to work correctly
// behind Render, Fly, or any other reverse proxy.
app.set('trust proxy', 1);

// Security headers — CSP is set here (HTTP header) instead of an HTML <meta>
// so dev tooling (Vite HMR inline scripts) isn't blocked. In production, the
// static client should be served behind a host that applies the same policy.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        connectSrc: ["'self'", 'http://localhost:3001'],
        imgSrc: ["'self'", 'data:'],
        workerSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
      },
    },
  })
);

// CORS — configurable via env, defaults to localhost dev server
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';
app.use(cors({ origin: CORS_ORIGIN }));

app.use(express.json({ limit: '100kb' }));

// Rate limiting on AI endpoints — 20 requests per minute per IP
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// Construct the client with no explicit apiKey so the SDK resolves credentials
// in its natural precedence: ANTHROPIC_API_KEY → ANTHROPIC_AUTH_TOKEN →
// `ant auth login` OAuth profile (~/.config/anthropic/).  Passing undefined
// explicitly would override that chain, so we omit the arg entirely.
const anthropic = new Anthropic();

// ─── Per-endpoint Zod schemas ──────────────────────────────────────────────────
//
// Request schemas validate the inbound body; output schemas validate the model's
// JSON before it reaches the client. Both replace the previous ad-hoc `!profile ||
// !gradeEntries` checks and unchecked JSON.parse results.

const recommendRequestSchema = z.object({
  profile: z.object({ preferences: z.unknown() }).passthrough(),
  gradeEntries: z.unknown().refine((v) => v != null, 'gradeEntries is required'),
  techCores: z.record(z.string(), z.object({ name: z.string() }).passthrough()),
  customInput: z.string().optional(),
});

const recommendOutputSchema = z.object({
  techCoreId: z.string(),
  mathBA: z.boolean(),
  reasoning: z.string(),
});

const questionnaireRequestSchema = z.object({
  profile: z.unknown().refine((v) => v != null, 'profile is required'),
  gradeEntries: z.unknown().refine((v) => v != null, 'gradeEntries is required'),
  techCores: z.unknown().refine((v) => v != null, 'techCores is required'),
});

const questionnaireOutputSchema = z.object({
  questions: z.array(z.string()),
});

// ─── /api/agent-turn ──────────────────────────────────────────────────────────
//
// Tool-capable STREAMING endpoint for the client agent loop.
// Accepts { messages, tools, system } and runs ONE Anthropic tool-use turn,
// streaming the assistant's text as Server-Sent Events so tokens render
// incrementally in the browser.
//
// Wire protocol (text/event-stream):
//   event: delta  data: { "text": "<chunk>" }   — one per text delta
//   event: done   data: { "text": "<full>", "toolCall": null | { name, args } }
//   event: error  data: { "error": "<generic message>" }
//
// The terminal `done` event carries the fully assembled assistant text and the
// first tool_use block (if any), preserving the { text, toolCall } semantics the
// client-orchestrated tool loop relies on. The API key never reaches the browser.

interface AgentTurnMessage {
  role: 'user' | 'assistant' | 'tool_result';
  content: string;
  tool_name?: string;
}

interface AgentTurnTool {
  name: string;
  description: string;
  schema: Record<string, unknown>;
}

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

app.post('/api/agent-turn', requireAccessCode, chatLimiter, tokenCapMiddleware, async (req, res) => {
  // No env-var precheck here: the SDK resolves auth from ANTHROPIC_API_KEY,
  // ANTHROPIC_AUTH_TOKEN, or a local `ant auth login` profile.  If none is
  // present the SDK will throw an AuthenticationError (401) which surfaces
  // through the catch block below as a generic 500 — detail logged server-side.

  const { messages, tools, system } = req.body as {
    messages?: AgentTurnMessage[];
    tools?: AgentTurnTool[];
    system?: string;
  };

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages must be an array' });
  }
  if (messages.length > 100) {
    return res.status(400).json({ error: 'messages array exceeds 100 entries' });
  }

  // Validate per-message content length and role
  const VALID_ROLES = new Set(['user', 'assistant', 'tool_result']);
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (!VALID_ROLES.has(m.role)) {
      return res.status(400).json({ error: 'Invalid message role' });
    }
    if (typeof m.content === 'string' && m.content.length > 16000) {
      return res.status(400).json({ error: 'Message content exceeds 16000 characters' });
    }
  }

  // Validate tools if provided
  if (tools !== undefined) {
    if (!Array.isArray(tools)) {
      return res.status(400).json({ error: 'tools must be an array' });
    }
    if (tools.length > 32) {
      return res.status(400).json({ error: 'tools array exceeds 32 entries' });
    }
    for (const tool of tools) {
      if (typeof tool.name !== 'string' || tool.name.length > 64) {
        return res.status(400).json({ error: 'Invalid tool: name exceeds 64 characters' });
      }
      if (typeof tool.description !== 'string' || tool.description.length > 1000) {
        return res.status(400).json({ error: 'Invalid tool: description exceeds 1000 characters' });
      }
      if (JSON.stringify(tool.schema).length > 8000) {
        return res.status(400).json({ error: 'Invalid tool: schema exceeds 8000 characters' });
      }
    }
  }

  // Validate system prompt if provided
  if (system !== undefined) {
    if (typeof system !== 'string' || system.length > 8000) {
      return res.status(400).json({ error: 'system prompt must be a string ≤ 8000 characters' });
    }
  }

  // Map agent-loop message roles to Anthropic roles.
  // tool_result messages are inserted as user-role content blocks in Anthropic's API.
  // For simplicity we encode them as plain user messages with the tool result inline.
  const anthropicMessages: Anthropic.Messages.MessageParam[] = messages.map(m => {
    if (m.role === 'tool_result') {
      return { role: 'user' as const, content: `[tool_result:${m.tool_name ?? 'unknown'}] ${m.content}` };
    }
    return { role: m.role as 'user' | 'assistant', content: m.content };
  });

  const anthropicTools: Anthropic.Messages.Tool[] = (tools ?? []).map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.schema as Anthropic.Messages.Tool['input_schema'],
  }));

  const model = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6';

  // Open the SSE stream. Once headers are flushed we can no longer send an HTTP
  // status, so any error after this point is reported as an `error` SSE event.
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Disable proxy buffering (nginx/Render) so deltas flush immediately.
    'X-Accel-Buffering': 'no',
  });

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const stream = anthropic.messages.stream({
      model,
      max_tokens: 1024,
      system: system ?? '',
      messages: anthropicMessages,
      tools: anthropicTools.length > 0 ? anthropicTools : undefined,
    });

    // Stream text deltas to the client as they arrive.
    stream.on('text', (textDelta: string) => {
      send('delta', { text: textDelta });
    });

    // Block until the model finishes; finalMessage() resolves with the fully
    // assembled Message (text + tool_use blocks).
    const finalMessage = await stream.finalMessage();

    // Extract text and the first tool_use block (1-tool-call cap matches client loop).
    let text = '';
    let toolCall: { name: string; args: Record<string, unknown> } | null = null;

    for (const block of finalMessage.content) {
      if (block.type === 'text') {
        text += block.text;
      } else if (block.type === 'tool_use' && toolCall === null) {
        toolCall = {
          name: block.name,
          args: block.input as Record<string, unknown>,
        };
      }
    }

    // Terminal event carries the full assembled message + any tool call so the
    // client can execute the tool and continue its orchestrated loop.
    send('done', { text, toolCall });
    res.end();
  } catch (error: unknown) {
    // Log full detail server-side only — never leak SDK internals to the client.
    console.error('agent-turn error:', error instanceof Error ? error.message : error);
    send('error', { error: 'The AI service returned an error.' });
    res.end();
  }
});

app.post('/api/recommend', requireAccessCode, chatLimiter, async (req, res) => {
  const parsedBody = recommendRequestSchema.safeParse(req.body);
  if (!parsedBody.success) {
    return res.status(400).json({ error: 'Missing required profile data' });
  }
  const { profile, gradeEntries, techCores, customInput: rawCustomInput } = parsedBody.data;

  // Cap customInput to 200 chars to limit prompt injection surface.
  // It is treated as a student preference note only — not a system instruction.
  const customInput = typeof rawCustomInput === 'string'
    ? rawCustomInput.slice(0, 200)
    : '';

  const systemPrompt = `You are an expert UT Austin ECE academic advisor.
Analyze the student's profile, grades, and preferences.
Select the single best Tech Core ID and decide on Math BA.
Base your decision on the student's academic strengths and stated preferences.
Also decide if they should pursue the Math BA double major (only if they excel in math).
You MUST respond with ONLY a valid JSON object in this exact format, with no markdown formatting or backticks:
{
  "techCoreId": "the_chosen_id",
  "mathBA": false,
  "reasoning": "A brief 2-sentence explanation of why this is the perfect fit based on their specific grades and preferences."
}`;

  const userContent = [
    'Student Profile Preferences:',
    JSON.stringify(profile.preferences, null, 2),
    '',
    'Grades (Course ID -> Grade):',
    JSON.stringify(gradeEntries, null, 2),
    '',
    'Available Tech Cores:',
    Object.keys(techCores).map((k) => `- ${k}: ${techCores[k].name}`).join('\n'),
    customInput ? `\nStudent preference note: ${customInput}` : '',
  ].join('\n');

  // Cache key stays prompt-equivalent to the prior implementation
  // (systemPrompt + '\n\n' + userContent) so existing cache entries still hit.
  const cacheKey = systemPrompt + '\n\n' + userContent;
  const cached = await getCachedResponse(cacheKey);
  if (cached) return res.json(cached);

  try {
    const text = await callLLM(anthropic, systemPrompt, userContent, { maxTokens: 500 });
    const parsed = parseModelJson(text, recommendOutputSchema);
    await setCachedResponse(cacheKey, parsed, 'json');
    return res.json(parsed);
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error('Recommend API Error:', detail);
    if (error instanceof ModelOutputError) console.error('Recommend raw output:', error.rawText);
    res.status(500).json({ error: 'Failed to generate recommendation' });
  }
});

app.post('/api/generate-questionnaire', requireAccessCode, chatLimiter, async (req, res) => {
  const parsedBody = questionnaireRequestSchema.safeParse(req.body);
  if (!parsedBody.success) {
    return res.status(400).json({ error: 'Missing required profile data' });
  }
  const { gradeEntries } = parsedBody.data;

  const systemPrompt = 'You are an academic advisor. Output raw JSON only. Do not wrap in ```json or any markdown.';

  const userContent = `You are an expert academic advisor.
Analyze this student's grades and current profile.
Grades: ${JSON.stringify(gradeEntries)}

Generate EXACTLY 3 insightful questions to ask the student to help determine which Tech Core track they should pursue.
The questions should be specific to their transcript (e.g. if they did poorly in a math class, ask if they want to avoid heavy math).

Respond with ONLY a valid JSON object in this exact format:
{
  "questions": [
    "Question 1?",
    "Question 2?",
    "Question 3?"
  ]
}`;

  // Cache key stays the analytic prompt (verbatim prior behavior) so existing
  // cache entries keep hitting.
  const cacheKey = userContent;
  const cached = await getCachedResponse(cacheKey);
  if (cached) return res.json(cached);

  try {
    const text = await callLLM(anthropic, systemPrompt, userContent, { maxTokens: 300 });
    const parsed = parseModelJson(text, questionnaireOutputSchema);
    await setCachedResponse(cacheKey, parsed, 'json');
    return res.json(parsed);
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error('Questionnaire API Error:', detail);
    if (error instanceof ModelOutputError) console.error('Questionnaire raw output:', error.rawText);
    res.status(500).json({ error: 'Failed to generate questionnaire questions' });
  }
});

const PORT = process.env.PORT || 3005;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

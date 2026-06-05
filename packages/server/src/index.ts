import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';
import { getCachedResponse, setCachedResponse } from './cache';
import { tokenCapMiddleware } from './middleware/tokenCap';

dotenv.config({ path: '../../.env' });

const app = express();

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

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ─── /api/agent-turn ──────────────────────────────────────────────────────────
//
// Tool-capable non-streaming endpoint for the client agent loop.
// Accepts { messages, tools, system } and runs ONE Anthropic tool-use turn.
// Returns { text, toolCall } where toolCall is null or { name, args }.
// The client createClaudeProvider calls this; the API key never reaches the browser.

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

app.post('/api/agent-turn', chatLimiter, tokenCapMiddleware, async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: 'ANTHROPIC_API_KEY is not configured on the server.' });
  }

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

  try {
    const response = await anthropic.messages.create({
      model,
      max_tokens: 1024,
      system: system ?? '',
      messages: anthropicMessages,
      tools: anthropicTools.length > 0 ? anthropicTools : undefined,
    });

    // Extract text and the first tool_use block (1-tool-call cap matches client loop)
    let text = '';
    let toolCall: { name: string; args: Record<string, unknown> } | null = null;

    for (const block of response.content) {
      if (block.type === 'text') {
        text += block.text;
      } else if (block.type === 'tool_use' && toolCall === null) {
        toolCall = {
          name: block.name,
          args: block.input as Record<string, unknown>,
        };
      }
    }

    return res.json({ text, toolCall });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error from Anthropic SDK';
    console.error('agent-turn error:', msg);
    return res.status(500).json({ error: msg });
  }
});

app.post('/api/recommend', chatLimiter, async (req, res) => {
  const { profile, gradeEntries, techCores, customInput } = req.body;
  const useAnthropic = !!process.env.ANTHROPIC_API_KEY;

  if (!profile || !gradeEntries || !techCores) {
    return res.status(400).json({ error: 'Missing required profile data' });
  }

  const prompt = `You are an expert UT Austin ECE academic advisor.
Analyze the student's profile, grades, and preferences.

Student Profile Preferences:
${JSON.stringify(profile.preferences, null, 2)}

Grades (Course ID -> Grade):
${JSON.stringify(gradeEntries, null, 2)}

Available Tech Cores:
${Object.keys(techCores).map(k => `- ${k}: ${techCores[k].name}`).join('\n')}

${customInput ? `\nCRITICAL USER INSTRUCTIONS:\n"""\n${customInput}\n"""\n\nYOU MUST OBEY THE USER'S INSTRUCTIONS ABOVE ABOVE ALL ELSE. If the user explicitly requests a field like 'Software' or 'Hardware', YOU MUST SELECT THE MATCHING TECH CORE, EVEN IF IT CONTRADICTS THEIR PAST GRADES OR PREFERENCES! Explain how you followed their instruction in your reasoning.\n` : `Based on their strengths (high grades in specific subjects) and preferences, select the BEST single Tech Core ID.`}

Also decide if they should pursue the Math BA double major (only if they excel in math).

You MUST respond with ONLY a valid JSON object in this exact format, with no markdown formatting or backticks:
{
  "techCoreId": "the_chosen_id",
  "mathBA": false,
  "reasoning": "A brief 2-sentence explanation of why this is the perfect fit based on their specific grades and preferences."
}`;

  const cached = await getCachedResponse(prompt);
  if (cached) return res.json(cached);

  try {
    if (useAnthropic) {
      const response = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 500,
        system: "You are an academic advisor. Output raw JSON only. Do not wrap in ```json or any markdown.",
        messages: [{ role: 'user', content: prompt }],
      });
      
      const text = (response.content[0] as any).text;
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
        await setCachedResponse(prompt, parsed, 'json');
        return res.json(parsed);
      } catch (e) {
        throw new Error('Failed to parse Anthropic JSON output: ' + text);
      }
    } else {
      const ollamaUrl = (process.env.OLLAMA_URL || 'http://127.0.0.1:11434').trim();
      const model = (process.env.OLLAMA_MODEL || 'llama3').trim();

      const response = await fetch(`${ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
          format: 'json',
          system: "You are an academic advisor. Output strictly raw JSON only."
        }),
      });

      if (!response.ok) {
        let errMsg = response.statusText;
        try {
          const errData: any = await response.json();
          if (errData.error) errMsg = errData.error;
        } catch (e) {}
        throw new Error(`Ollama API error: ${errMsg}`);
      }

      const data: any = await response.json();
      const text = data.response;
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
        await setCachedResponse(prompt, parsed, 'json');
        return res.json(parsed);
      } catch (e) {
        throw new Error('Failed to parse Ollama JSON output: ' + text);
      }
    }
  } catch (error: any) {
    console.error('Recommend API Error:', error?.message || error);
    res.status(500).json({ error: error?.message || 'Failed to generate recommendation' });
  }
});

app.post('/api/generate-questionnaire', chatLimiter, async (req, res) => {
  const { profile, gradeEntries, techCores } = req.body;
  const useAnthropic = !!process.env.ANTHROPIC_API_KEY;

  if (!profile || !gradeEntries || !techCores) {
    return res.status(400).json({ error: 'Missing required profile data' });
  }

  const prompt = `You are an expert academic advisor.
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

  const cached = await getCachedResponse(prompt);
  if (cached) return res.json(cached);

  try {
    if (useAnthropic) {
      const response = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 300,
        system: "You are an academic advisor. Output raw JSON only. Do not wrap in ```json or any markdown.",
        messages: [{ role: 'user', content: prompt }],
      });
      const text = (response.content[0] as any).text;
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
      await setCachedResponse(prompt, parsed, 'json');
      return res.json(parsed);
    } else {
      const ollamaUrl = (process.env.OLLAMA_URL || 'http://127.0.0.1:11434').trim();
      const model = (process.env.OLLAMA_MODEL || 'llama3').trim();
      const response = await fetch(`${ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
          format: 'json',
          system: "Output strictly raw JSON only."
        }),
      });
      if (!response.ok) throw new Error(response.statusText);
      const data: any = await response.json();
      const parsed = JSON.parse(data.response);
      await setCachedResponse(prompt, parsed, 'json');
      return res.json(parsed);
    }
  } catch (error: any) {
    console.error('Questionnaire API Error:', error?.message || error);
    res.status(500).json({ error: 'Failed to generate questionnaire' });
  }
});

const PORT = process.env.PORT || 3005;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

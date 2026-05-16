import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';
import { getCachedResponse, setCachedResponse } from './cache';

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

// Rate limiting on chat endpoint — 20 requests per minute per IP
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

interface ChatCourseRef {
  course: string;
  title: string;
}

interface ChatPlanContext {
  techCore: string;
  completedCourses: ChatCourseRef[];
  inProgress: ChatCourseRef[];
  targetGraduation: string;
  totalCoursesPlanned: number;
  semesterCount: number;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

function formatCourseList(refs: ChatCourseRef[]): string {
  if (refs.length === 0) return 'none';
  return refs.map(r => `${r.course} (${r.title})`).join('; ');
}

function buildSystemPrompt(ctx: ChatPlanContext): string {
  return `You are a helpful academic advisor for a UT Austin ECE student named Adi.

Current Plan Summary:
- Tech Core: ${ctx.techCore}
- Completed courses: ${formatCourseList(ctx.completedCourses)}
- Spring 2026 (in progress): ${formatCourseList(ctx.inProgress)}
- Target graduation: ${ctx.targetGraduation}

${ctx.totalCoursesPlanned > 0 ? `Current plan includes ${ctx.totalCoursesPlanned} courses across ${ctx.semesterCount} semesters.` : ''}

Your role:
- Explain course tradeoffs and why prerequisites matter
- Help Adi understand what courses to prioritize
- Answer questions about UT ECE degree requirements
- Do NOT generate a full course plan — the planner tool handles that automatically
- Keep responses concise (2-4 paragraphs max)

Grounding rules — read carefully:
- The course list above is the ONLY authoritative source for course titles.
  Each entry is in the form "DEPT NUM (Title)". When the user asks what a
  course is, look it up there first and quote the title verbatim.
- If a course code is NOT in the list above, do not guess its title or
  description. Say you don't have that course in context and ask the user
  to confirm. Never invent a plausible-sounding title.
- Do not confuse similar-looking codes (e.g. ECE 302 is distinct from
  ECE 316; ECE 312 from ECE 319K). Always quote the exact code the user
  asked about.

Output format — required:
Before your final answer, "think out loud" about the student's request inside
<thought>...</thought> XML tags. Then provide your response to the user inside
<answer>...</answer> XML tags.
Example:
<thought>
They asked about ECE 312H — honors software. They have already taken ECE 306.
</thought>
<answer>
ECE 312H is a great class! Since you've taken ECE 306, you are well prepared...
</answer>`;
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]*>?/gm, '');
}

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

app.post('/api/chat', chatLimiter, async (req, res) => {
  const { messages, planContext } = req.body;

  // We will either use Anthropic or fallback to Ollama
  const useAnthropic = !!process.env.ANTHROPIC_API_KEY;

  // Input validation
  if (!messages || !Array.isArray(messages) || messages.length > 50) {
    return res.status(400).json({ error: 'Invalid messages format or too many messages' });
  }

  for (const msg of messages) {
    if (!msg.role || !['user', 'assistant'].includes(msg.role) || typeof msg.content !== 'string' || msg.content.length > 2000) {
      return res.status(400).json({ error: 'Invalid message format or content length' });
    }
    msg.content = stripHtml(msg.content);
  }

  if (!planContext || typeof planContext !== 'object') {
    return res.status(400).json({ error: 'Missing or invalid planContext' });
  }

  // Validate planContext fields to prevent prompt injection
  const COURSE_ID_RE = /^[A-Z]{1,4}\s\d{3}[A-Z]?$/;
  if (typeof planContext.techCore !== 'string' || planContext.techCore.length > 100) {
    return res.status(400).json({ error: 'Invalid techCore field' });
  }
  const isValidCourseRef = (c: unknown): boolean =>
    typeof c === 'object' && c !== null &&
    typeof (c as ChatCourseRef).course === 'string' && (c as ChatCourseRef).course.length <= 20 &&
    typeof (c as ChatCourseRef).title === 'string' && (c as ChatCourseRef).title.length <= 200;

  if (!Array.isArray(planContext.completedCourses) || !planContext.completedCourses.every(isValidCourseRef)) {
    return res.status(400).json({ error: 'Invalid completedCourses field' });
  }
  if (!Array.isArray(planContext.inProgress) || !planContext.inProgress.every(isValidCourseRef)) {
    return res.status(400).json({ error: 'Invalid inProgress field' });
  }
  if (typeof planContext.targetGraduation !== 'string' || planContext.targetGraduation.length > 30) {
    return res.status(400).json({ error: 'Invalid targetGraduation field' });
  }

  try {
    const systemPrompt = buildSystemPrompt(planContext);
    const promptStr = JSON.stringify({ systemPrompt, messages: messages.slice(-10) });

    const cached = await getCachedResponse(promptStr);
    if (cached) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.write(`data: ${JSON.stringify({ text: cached })}\n\n`);
      res.write('data: [DONE]\n\n');
      return res.end();
    }

    if (useAnthropic) {
      const stream = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        system: systemPrompt,
        messages: messages.slice(-10), // Only last 10 messages to limit tokens
        stream: true,
      });

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      let fullResponse = '';
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && 'text' in event.delta) {
          fullResponse += event.delta.text;
          res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
        }
      }

      await setCachedResponse(promptStr, fullResponse, 'chat');
      res.write('data: [DONE]\n\n');
      res.end();
    } else {
      // Fallback to Ollama
      const ollamaUrl = (process.env.OLLAMA_URL || 'http://127.0.0.1:11434').trim();
      const model = (process.env.OLLAMA_MODEL || 'llama3').trim();
      console.log(`Using Ollama at ${ollamaUrl} with model: ${model}`);

      const ollamaMessages = [
        { role: 'system', content: systemPrompt },
        ...messages.slice(-10)
      ];

      const response = await fetch(`${ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: ollamaMessages,
          stream: true,
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

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      if (!response.body) throw new Error('No response body from Ollama');

      const decoder = new TextDecoder();
      let buffer = '';
      let fullResponse = '';

      for await (const chunk of response.body as any) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split('\n');
        
        // Keep the last partial line in the buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            if (data.message?.content) {
              fullResponse += data.message.content;
              res.write(`data: ${JSON.stringify({ text: data.message.content })}\n\n`);
            }
          } catch (e) {
            // Ignore parse errors from partial chunks
          }
        }
      }

      if (buffer.trim()) {
        try {
          const data = JSON.parse(buffer);
          if (data.message?.content) {
            fullResponse += data.message.content;
            res.write(`data: ${JSON.stringify({ text: data.message.content })}\n\n`);
          }
        } catch (e) {}
      }

      await setCachedResponse(promptStr, fullResponse, 'chat');
      res.write('data: [DONE]\n\n');
      res.end();
    }
  } catch (error: any) {
    console.error('Chat API Error:', error?.message || error);
    res.status(500).json({ error: error?.message || 'Failed to communicate with chat backend' });
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

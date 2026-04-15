import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';

dotenv.config({ path: '../../.env' });

const app = express();
app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface ChatPlanContext {
  techCore: string;
  completedCourses: string[];
  inProgress: string[];
  targetGraduation: string;
  totalCoursesPlanned: number;
  semesterCount: number;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

function buildSystemPrompt(ctx: ChatPlanContext): string {
  return `You are a helpful academic advisor for a UT Austin ECE student named Adi.

Current Plan Summary:
- Tech Core: ${ctx.techCore}
- Completed courses: ${ctx.completedCourses.join(', ')}
- Spring 2026 (in progress): ${ctx.inProgress.join(', ')}
- Target graduation: ${ctx.targetGraduation}

${ctx.totalCoursesPlanned > 0 ? `Current plan includes ${ctx.totalCoursesPlanned} courses across ${ctx.semesterCount} semesters.` : ''}

Your role:
- Explain course tradeoffs and why prerequisites matter
- Help Adi understand what courses to prioritize
- Answer questions about UT ECE degree requirements
- Do NOT generate a full course plan — the planner tool handles that automatically
- Keep responses concise (2-4 paragraphs max)
- Reference specific UT ECE courses by their correct names`;
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]*>?/gm, '');
}

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

app.post('/api/chat', async (req, res) => {
  const { messages, planContext } = req.body;

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured on server' });
  }

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

  if (!planContext) {
    return res.status(400).json({ error: 'Missing planContext' });
  }

  try {
    const systemPrompt = buildSystemPrompt(planContext);

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

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && 'text' in event.delta) {
        res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    console.error('Claude API Error:', error);
    res.status(500).json({ error: 'Failed to communicate with Claude' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

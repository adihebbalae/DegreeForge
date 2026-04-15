import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: '../../.env' });

const app = express();
app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Load static data once at startup
const DATA_DIR = path.join(__dirname, '../../../data');
const prereqGraph = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'prerequisite-graph.json'), 'utf8'));
const gradeDistributions = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'grade-distributions.json'), 'utf8'));

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

app.post('/api/chat', async (req, res) => {
  const { messages, context } = req.body;

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured on server' });
  }

  try {
    // We only send a SUMMARY of the grade data and prereqs to keep context manageable
    // Actually, for now we'll just send the core info and let Claude ask if it needs more.
    
    const systemPrompt = `
You are DegreeForge AI, an expert academic advisor for ECE and Math at UT Austin.
You are helping a student (Adi) plan their degree path (2026-2028 catalog).

CONTEXT:
- User Profile: ${JSON.stringify(context.profile)}
- Current Plan: ${JSON.stringify(context.plan)}
- Tech Core: ${context.techCoreId}
- Math BA Toggle: ${context.mathBAToggle}

DATA REFERENCE:
- You have access to the full prerequisite graph and grade distributions for UT Austin ECE courses.
- Adi's current GPA is ${context.profile?.gpa?.cumulative ?? 'unknown'}.

GUIDELINES:
- Your role is EXPLANATION and TRADEOFF ANALYSIS.
- DO NOT generate full plans; help the student make their own decisions.
- Explain prerequisite chains and why certain courses are difficult.
- Use the average GPA data to warn about "weed-out" or heavy-load semesters.
- Be encouraging but realistic about course loads.
- Keep responses concise and formatted with markdown.
`;

    const stream = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages,
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

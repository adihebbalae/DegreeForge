# Handoff: TASK-012 — Claude Chat Panel + Express Proxy Endpoint
**Task ID**: TASK-012
**Mode**: autonomous (no user interaction available)
**Agent**: engineer | **Model**: sonnet

## Context

DegreeForge is a single-user degree planner for UT Austin ECE. Previous tasks complete:
- TASK-001: Express server running at port 3001 with `/api/health` and a stub `/api/chat`
- TASK-002: Full data layer — all 9 JSONs typed, DataContext available
- TASK-005: App shell with PlannerPage layout

**CRITICAL security constraint**: The `ANTHROPIC_API_KEY` must NEVER reach the browser. It lives in `packages/server/.env` (or root `.env`) and is accessed only by the Express server. The frontend calls `/api/chat` — it never calls Anthropic directly.

**Claude's role**: Chat/explanation only. Claude is NOT used for plan generation (that's the deterministic solver). Examples of valid Claude uses:
- "Why should I take ECE 460N before ECE 461L?"
- "What's the difference between Computer Architecture and Embedded Systems tech cores?"
- "I'm struggling with math — which courses are the hardest prerequisites?"

**Why this task matters**: The chat panel is how Adi gets qualitative guidance on her plan. Without it, the app is just a scheduler with no explanations.

## Task

### Server: Replace the stub in `packages/server/src/index.ts`

**Critical**: Load API key from environment — never hardcode.

```typescript
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.post('/api/chat', async (req, res) => {
  const { messages, planContext } = req.body;
  
  // Input validation
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid messages format' });
  }
  
  // Build system prompt with plan context
  const systemPrompt = buildSystemPrompt(planContext);
  
  // Streaming response
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  const stream = await anthropic.messages.stream({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 1024,
    system: systemPrompt,
    messages: messages.slice(-10), // Only last 10 messages to limit tokens
  });
  
  for await (const chunk of stream) {
    if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
      res.write(`data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`);
    }
  }
  
  res.write('data: [DONE]\n\n');
  res.end();
});
```

**`buildSystemPrompt(planContext)`**:
```typescript
function buildSystemPrompt(ctx: PlanContext): string {
  return `You are a helpful academic advisor for a UT Austin ECE student named Adi.

Current Plan Summary:
- Tech Core: ${ctx.techCore}
- Completed courses: ${ctx.completedCourses.join(', ')}
- Spring 2026 (in progress): ${ctx.inProgress.join(', ')}
- Target graduation: ${ctx.targetGraduation}

${ctx.currentSemesterPlan ? `Current plan includes ${ctx.totalCoursesPlanned} courses across ${ctx.semesterCount} semesters.` : ''}

Your role:
- Explain course tradeoffs and why prerequisites matter
- Help Adi understand what courses to prioritize
- Answer questions about UT ECE degree requirements
- Do NOT generate a full course plan — the planner tool handles that automatically
- Keep responses concise (2-4 paragraphs max)
- Reference specific UT ECE courses by their correct names`;
}
```

**Security**: 
- Validate `messages` array length (max 50 items)
- Validate each message has `role` (user/assistant) and `content` (string, max 2000 chars)
- Strip any HTML from input messages before sending to Claude

### Client: Chat panel component (`src/components/ChatPanel.tsx`)

A **slide-in panel** from the right side of PlannerPage:

```
┌──────────────────────────────────────────┐
│ 💬 Academic Advisor           [×]        │
├──────────────────────────────────────────┤
│                                          │
│  You: Why is ECE 302 a prereq for so    │
│  many courses?                           │
│                                          │
│  Claude: ECE 302 (Intro to Electrical   │
│  Engineering Lab) establishes the       │
│  foundational... [streaming token by    │
│  token]                                 │
│                                          │
│                                          │
├──────────────────────────────────────────┤
│  Ask about your plan...       [Send]     │
└──────────────────────────────────────────┘
```

**Slide-in behavior**: Triggered by a floating "💬" button in PlannerPage. Uses CSS transform/transition or shadcn Sheet component.

**Streaming**: Read the Server-Sent Events stream and append tokens as they arrive.

```typescript
const response = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ messages, planContext: getPlanContext() }),
});

const reader = response.body!.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const lines = decoder.decode(value).split('\n');
  for (const line of lines) {
    if (line.startsWith('data: ') && line !== 'data: [DONE]') {
      const data = JSON.parse(line.slice(6));
      setCurrentMessage(prev => prev + data.text);
    }
  }
}
```

**Plan context** sent with each request (from PlanContext + DataContext):
```typescript
interface ChatPlanContext {
  techCore: string;
  completedCourses: string[];
  inProgress: string[];
  targetGraduation: string;
  totalCoursesPlanned: number;
  semesterCount: number;
}
```

**Chat history**: Keep last 20 messages in component state (not localStorage — ephemeral per session).

**Error handling**: Show "Sorry, something went wrong. Check your API key." on network/API errors.

## Acceptance Criteria
- [ ] Express `/api/chat` endpoint streams responses from Claude API
- [ ] API key loaded from `.env`, never sent to client
- [ ] Chat panel slides in/out smoothly
- [ ] Messages stream token-by-token in the UI
- [ ] Plan context included in system prompt (tech core, completed courses visible)
- [ ] Error message shown if API key missing or network failure
- [ ] Input validated server-side (max length, format)
- [ ] Chat history shows last N messages in session

## Validation Gates
- [ ] `curl -X POST http://localhost:3001/api/chat -H "Content-Type: application/json" -d '{"messages":[{"role":"user","content":"What is ECE 302?"}],"planContext":{}}' ` — streams SSE response
- [ ] Browser: open chat panel, send a message, see streaming response
- [ ] `cd packages/server && npx tsc --noEmit` — no errors

## Files to Read First
- `packages/server/src/index.ts` — stub implementation to replace
- `packages/client/src/context/PlanContext.tsx` — to get plan context for system prompt
- `packages/client/src/pages/PlannerPage.tsx` — where to add chat open button

## Constraints
- API key MUST NOT appear in any client-side code, logs, or network responses
- Do NOT use Claude for plan generation — chat/Q&A only
- Vite proxy config: add in `vite.config.ts` `server.proxy: { '/api': 'http://localhost:3001' }` so frontend can call `/api/chat` without CORS in dev
- Commit when done: `git add -A && git commit -m "feat(TASK-012): Claude chat panel with streaming SSE proxy endpoint"`

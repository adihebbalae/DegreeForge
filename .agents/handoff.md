# Handoff: TASK-001 — Project Scaffold
**Task ID**: TASK-001
**Mode**: autonomous (no user interaction available)
**Agent**: engineer | **Model**: sonnet

## Context

DegreeForge is an interactive 4-year degree planner + next-semester schedule optimizer for a specific UT Austin ECE student (Adi, single-user localhost app). There is NO existing application code — this is a greenfield scaffold.

**Stack decided (locked — do not change)**:
- Frontend: Vite + React + TypeScript + Tailwind CSS + shadcn/ui + dnd-kit
- Backend: Express + TypeScript (proxy-only — single `/api/chat` route)
- Structure: Monorepo with npm workspaces
- Testing: Vitest
- TypeScript: strict mode (`"strict": true`)

**Why this task matters**: Every other task depends on this scaffold. Nothing else can be built until the monorepo with both workspaces is working.

**Mode**: `mvp` — do not gold-plate. No extra features, no over-engineering.

## Project Structure to Create

```
package.json                  # Root — npm workspaces config
packages/
  client/
    src/
      App.tsx
      main.tsx
      index.css               # Tailwind base
    public/
      data/                   # Copy 9 JSON files here from root data/
    index.html
    vite.config.ts
    tailwind.config.ts
    components.json           # shadcn/ui config
    tsconfig.json
    package.json
  server/
    src/
      index.ts                # Express entry — /api/health + /api/chat stub
    tsconfig.json
    package.json
.env.example                  # ANTHROPIC_API_KEY=
.gitignore                    # Already exists — do not overwrite
```

## Task

Scaffold the full monorepo from scratch. Specific requirements:

### Root `package.json`
```json
{
  "name": "degreeforge",
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "dev": "concurrently \"npm run dev --workspace=packages/server\" \"npm run dev --workspace=packages/client\"",
    "build": "npm run build --workspace=packages/client",
    "test": "vitest run"
  },
  "devDependencies": {
    "concurrently": "^9.0.0"
  }
}
```

### `packages/client/package.json`
Key dependencies:
- `react`, `react-dom` (latest stable)
- `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`
- `react-router-dom`
- Dev: `vite`, `@vitejs/plugin-react`, `typescript`, `tailwindcss`, `autoprefixer`, `postcss`, `vitest`, `@testing-library/react`

### `packages/server/package.json`
Key dependencies:
- `express`, `cors`, `dotenv`, `@anthropic-ai/sdk`
- Dev: `typescript`, `tsx` (for dev), `@types/express`, `@types/cors`, `@types/node`
- Scripts: `"dev": "tsx watch src/index.ts"`, `"build": "tsc"`

### TypeScript
Both packages need `tsconfig.json` with `"strict": true`.

### Tailwind
Standard Tailwind v3 setup with `tailwind.config.ts` — content glob includes `src/**/*.{tsx,ts}`.

### shadcn/ui
Initialize with `npx shadcn-ui@latest init` settings:
- Style: Default
- Base color: Slate
- CSS variables: yes

Add at minimum these shadcn components: `button`, `badge`, `tooltip`, `card`, `progress`, `dialog`, `scroll-area`, `separator`.

### Express server (`packages/server/src/index.ts`)
```typescript
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config({ path: '../../.env' });

const app = express();
app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

// TASK-012 will implement this properly
app.post('/api/chat', (_req, res) => res.json({ message: 'stub' }));

app.listen(3001, () => console.log('Server running on port 3001'));
```

### Copy data files
Copy all 9 JSON files from `data/` to `packages/client/public/data/`:
- course-catalog.json
- prerequisite-graph.json
- tech-cores.json
- degree-requirements.json
- offering-schedule.json
- math-requirements.json
- fall-2026-sections.json
- grade-distributions.json
- user-profile.json

### App.tsx
Simple placeholder that renders a shadcn `Button` and `Badge` to confirm component library works:
```tsx
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
export default function App() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">DegreeForge</h1>
      <Button>Get Started</Button>
      <Badge className="ml-2">V1</Badge>
    </div>
  )
}
```

### `.env.example`
```
ANTHROPIC_API_KEY=your_key_here
```

## Acceptance Criteria
- [ ] `npm install` from root installs both workspaces without errors
- [ ] `npm run dev` starts both Vite (port 5173) and Express (port 3001) concurrently
- [ ] Browser shows DegreeForge placeholder with a shadcn Button and Badge
- [ ] `curl http://localhost:3001/api/health` returns `{"status":"ok"}`
- [ ] `packages/client/public/data/` contains all 9 JSON files
- [ ] TypeScript compiles without errors in both packages (`tsc --noEmit`)
- [ ] Tailwind styles apply (the h1 should be bold, p-8 padding visible)

## Validation Gates
- [ ] `cd packages/client && npx tsc --noEmit` — passes
- [ ] `cd packages/server && npx tsc --noEmit` — passes
- [ ] `npm run dev` — both processes start without crash

## Files to Read First
- `.agents/workspace-map.md` — see the planned structure
- `.agents/state.json` — architecture decisions section
- `data/` — verify all 9 JSON files exist before copying

## Constraints
- Do NOT use Next.js, Remix, or any SSR framework — Vite SPA only
- Do NOT use Redux — state management in TASK-002+ via React Context
- Do NOT overwrite `.gitignore` — it already exists
- Do NOT add auth, multi-user features, or a database
- Do NOT modify any files in `data/` — only copy them to `public/data/`
- Commit when done: `git add -A && git commit -m "feat(TASK-001): scaffold monorepo with Vite, Express, Tailwind, shadcn/ui"`

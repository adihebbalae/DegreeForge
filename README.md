# DegreeForge

Interactive 4-year degree planner + next-semester schedule optimizer for UT Austin ECE. Replaces the Google Sheets planning workflow with a visual timeline, drag-and-drop course placement, prerequisite validation, and AI-powered tradeoff analysis.

> **Localhost only.** No deployment, no auth, no multi-user support. Single user, `localhost:3000`.

---

## What It Does

**V1 — Degree Planner**
- Visual semester timeline with color-coded course cards (ECE core, gen ed, tech core, math, electives)
- Drag courses from the palette into semesters, or between semesters
- Live prerequisite validation — red border for violations, orange for coreq issues, downstream impact on hover
- Progress bars updating in real-time: credit hours, ECE core, gen ed, tech core, free electives
- What-if simulator: switch tech core track (9 options) or toggle Math BA double major, see the diff
- Course detail popover: full prereqs, unlocks, grade distribution chart, links to RMP / UTGradesPlus / syllabi / CIS surveys
- Claude chat panel for natural-language tradeoff analysis (plan stays yours — Claude explains, not generates)
- Export / Import plan as JSON; auto-saves to localStorage

**V2 — Schedule Optimizer**
- Select courses for next semester, generate all conflict-free section combinations
- Weighted ranking: avg GPA > time preference > schedule fit > instruction mode
- Weekly calendar view with color-coded course blocks, top 5 candidates
- Copy unique numbers for registration in one click

---

## Getting Started

### Prerequisites

- Node.js 18+
- An [Anthropic API key](https://console.anthropic.com) (for the chat panel)

### Install & Run

```powershell
# From repo root
npm install

# Copy env template and add your API key
cp .env.example packages/server/.env
# Edit packages/server/.env — set ANTHROPIC_API_KEY=sk-ant-...

# Start both client (Vite) and server (Express) concurrently
npm run dev
```

Client runs at `http://localhost:5173`, Express proxy at `http://localhost:3001`.

---

## Project Structure

```
packages/
  client/          # Vite + React + TypeScript + Tailwind + shadcn/ui
    src/
      components/  # CourseCard, SemesterColumn, CoursePalette, ProgressBars, ...
      context/     # PlanContext (plan state), DataContext (all 9 data files)
      hooks/       # usePlan, useValidation, useCourseCatalog, ...
      lib/         # graph-engine.ts, progress.ts, schedule-optimizer.ts, ...
      pages/       # PlannerPage (V1), SchedulerPage (V2)
      types/       # TypeScript interfaces for all data shapes
  server/          # Express proxy
    src/
      index.ts     # POST /api/chat → Anthropic SDK (streaming)

data/              # 9 static JSON files (read-only at runtime)
  course-catalog.json
  degree-requirements.json
  prerequisite-graph.json
  tech-cores.json
  math-requirements.json
  offering-schedule.json
  grade-distributions.json
  fall-2026-sections.json
  user-profile.json
```

---

## Architecture

| Decision | Choice | Why |
|----------|--------|-----|
| Frontend | Vite + React + TypeScript | Fast dev, no SSR needed for localhost SPA |
| Styling | Tailwind CSS + shadcn/ui | Professional components, no CSS modules |
| Drag-drop | dnd-kit | Modern React-first DnD, no HTML5 API |
| State | React Context + useReducer | No Redux needed for single-user local tool |
| Persistence | localStorage + JSON export/import | No database for V1 |
| Prerequisite solver | Deterministic TypeScript (toposort + CSP) | LLMs hallucinate edge cases; code is 100% reliable |
| Claude | Chat/explanation only | Plan generation stays deterministic; Claude explains tradeoffs |
| API key | Server-side Express proxy | Frontend never sees `ANTHROPIC_API_KEY` |

---

## Data

All 9 JSON files in `data/` are static and treated as read-only at runtime. They are copied into `packages/client/public/data/` at build time.

**Important:** The data normalizes `E E` → `ECE` at load time via `normalizeEEtoECE()` in the data layer. All internal references use `ECE`.

| File | Contents |
|------|----------|
| `course-catalog.json` | Course metadata: title, credits, description, offering pattern |
| `prerequisite-graph.json` | DAG of all ECE + Math courses with prereq/coreq edges |
| `degree-requirements.json` | ECE core, gen ed slots, free elective constraints |
| `tech-cores.json` | All 9 tech core tracks with required courses and elective pools |
| `math-requirements.json` | Math BA / Applied Math Cert / Jefferson Scholars requirements |
| `offering-schedule.json` | Fall-only / spring-only / both patterns per course |
| `grade-distributions.json` | Per-course, per-professor avg GPA (249 courses, 5 years of data) |
| `fall-2026-sections.json` | Specific sections for V2 schedule optimizer |
| `user-profile.json` | Transcript, completed courses, preferences, tech core intent |

---

## Tech Core Tracks

The what-if simulator supports all 9 ECE tech core tracks:

| Track | Required Math |
|-------|---------------|
| Computer Architecture & Embedded Systems | M 325K |
| Software Engineering & Design | M 325K |
| Data Science & Information Processing | M 325K |
| Electrical Engineering | M 427L |
| Communications, Signal Processing, Networks & Systems | M 427L |
| Electronics & Integrated Circuits | M 427L |
| Energy Systems & Renewable Energy | M 427L |
| Fields, Waves & Electromagnetic Systems | M 427L |
| Nanotechnology & Nanoelectronics | M 427L |

Switching between M 325K and M 427L tracks has a significant prereq impact (M 427L requires M 427J). The diff panel shows added/removed courses and graduation timeline impact.

---

## Tests

```powershell
# Run all tests (49 total: unit + integration)
npm test --workspace=packages/client
```

Critical paths with test coverage: prerequisite validation, constraint solver, data normalization, progress calculation, schedule optimizer conflict detection.

---

## Environment Variables

```env
# packages/server/.env
ANTHROPIC_API_KEY=sk-ant-...
PORT=3001                    # optional, defaults to 3001
```

See `.env.example` for the full template.

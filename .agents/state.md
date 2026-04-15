# DegreeForge — Project State Dashboard

## Knowledge Base

**LLM Wiki** (Karpathy pattern): `wiki/` directory compiled 2026-04-15. 10 pages covering all degree requirements, student profile, tech core track, and scheduling. Open the repo root in Obsidian to browse.

- `wiki/index.md` — start here every session (saves ~60-80% tokens vs raw JSON)
- `wiki/gaps.md` — known gaps; run wiki-lint skill weekly to refresh
- `.github/skills/wiki-lint/SKILL.md` — health check + learning resource suggestions

## Project Brief

**Product**: DegreeForge — interactive 4-year degree planner + next-semester schedule optimizer for UT Austin ECE.
**Single User (V1)**: Adi (Adi H.), ECE student, Computer Architecture tech core, exploring Math BA double major.

**The Problem**: No tool combines prerequisite graphs + degree requirements + grade distributions + personalized profile into one interactive planner.

**Stack**: Vite + React + TypeScript, Express proxy, Tailwind CSS + shadcn/ui, dnd-kit, Anthropic Claude API. Monorepo (npm workspaces): `packages/client/` + `packages/server/`.

**Core Features (V1 + V2 ship together)**:
1. Semester timeline grid with drag-drop course placement
2. Course palette with categorized remaining courses
3. Progress bars (credit hours, ECE core, gen ed, tech core, electives)
4. Constraint solver — deterministic toposort, not LLM
5. Prerequisite validation — red/orange borders, tooltips, downstream highlighting
6. What-if simulator — switch tech cores, toggle Math BA, see diffs
7. Claude chat panel — explain tradeoffs (NOT plan generation)
8. External links — RMP, grade distributions, syllabi
9. V2: Schedule optimizer — rank section combos by GPA/time/fit, calendar view
10. State persistence — localStorage + JSON export/import

**Architecture Decisions (Locked)**:
- Express proxy for Claude API (key server-side, single `/api/chat` endpoint)
- Monorepo with npm workspaces
- shadcn/ui + Tailwind for components
- dnd-kit for drag-and-drop
- localStorage + JSON export/import
- Normalize E E → ECE at data load time
- Constraint solver = deterministic code, Claude = chat/explanation only

**Key Constraints**: Single-user localhost, no auth, no deployment, no database. "As deterministic as possible, as few API calls as possible."

**Out of Scope**: Multi-user, auth, deployment, mobile, UT integration (IDA scraping).

---

## Data Files (9 total — all complete)

| File | Records | Size |
|------|---------|------|
| course-catalog.json | 378 courses (ECE + Math) | 217 KB |
| prerequisite-graph.json | 378 nodes, 580 edges | 147 KB |
| tech-cores.json | 9 tech core tracks | 13 KB |
| degree-requirements.json | Full BSE requirements | 6 KB |
| offering-schedule.json | 76 courses w/ semester data | 19 KB |
| math-requirements.json | BA Math + Adv Math Cert + JSP/CTI Cert | 7 KB |
| fall-2026-sections.json | 62 courses, 232 sections (lower+upper div) | ~40 KB |
| grade-distributions.json | 249 courses, 5 years real data (2021-2026) | 2 MB |
| user-profile.json | Adi's transcript + preferences + goals | ~5 KB |

---

## Task Backlog (17 tasks)

| ID | Title | Agent | Depends On | Status |
|----|-------|-------|------------|--------|
| TASK-001 | Project scaffold (monorepo, Vite, Express, Tailwind, shadcn) | engineer | — | ✅ done |
| TASK-002 | Data layer + TypeScript types + E E→ECE normalization | engineer | 001 | ✅ done |
| TASK-003 | Prerequisite graph engine (DAG, toposort, validation) | engineer | 002 | pending |
| TASK-004 | Constraint solver / recommendation engine | engineer | 003 | pending |
| TASK-005 | App shell + page layout + routing | engineer | 001 | ✅ done |
| TASK-006 | Semester timeline grid + course cards | engineer | 002, 005 | ✅ done |
| TASK-007 | Course palette panel | engineer | 002, 005 | ✅ done |
| TASK-008 | Drag-drop system (dnd-kit: palette↔timeline) | engineer | 006, 007 | pending |
| TASK-009 | Progress bars (credit hours, ECE, gen ed, tech core, electives) | engineer | 002, 005 | pending |
| TASK-010 | Prerequisite validation UI (borders, tooltips, highlights) | engineer | 003, 008 | pending |
| TASK-011 | What-if simulator (tech core switch, Math BA toggle, diffs) | engineer | 004, 009 | pending |
| TASK-012 | Claude chat panel + Express proxy endpoint | engineer | 005, 002 | pending |
| TASK-013 | External links + course detail popover | engineer | 006 | pending |
| TASK-014 | State persistence (localStorage + JSON export/import) | engineer | 008 | pending |
| TASK-015 | V2: Schedule optimizer engine | engineer | 002 | pending |
| TASK-016 | V2: Schedule calendar view + selection UI | engineer | 015, 005 | pending |
| TASK-017 | Integration testing + visual polish | engineer | all | pending |

**Critical path**: TASK-001 → 002 → 003 → 004 → 011 (5 tasks deep)
**Parallelizable after 002**: TASK-003, 005, 006, 007, 009, 012, 015

---

## Changelog
- `init-project`: PRD read, phases 1-1.5 complete [2026-04-05]
- `corpus-agent`: Built tools/corpus/ with 5 extractors + CLI, generated 5 JSON data files [2025-07-17]
- `data-pipeline`: OCR, math research, math-requirements + sections + grade placeholder [2025-07-18]
- `data-pipeline-2`: Real grade distributions (249 courses), upper-div sections (232 total), user profile [2026-04-05]
- `init-project phases 5-9`: Clarified ambiguity, locked architecture, broke into 17 tasks, scaffolded [2026-04-05]

---

## Last Updated
**When**: 2026-04-06
**By**: engineer (TASK-002 complete)
**Next**: TASK-003 — Prerequisite graph engine (DAG, toposort, validation)

## Changelog (cont.)
- `TASK-001`: Monorepo scaffolded — packages/client (Vite+React+TS+Tailwind+shadcn), packages/server (Express+TS), 9 JSON data files in public/data/, tsc clean on both packages [2026-04-06]
- `TASK-002`: Data layer complete — TypeScript interfaces for all 9 JSON schemas, normalizeEEtoECE() with 19 passing unit tests, DataProvider with 11 typed hooks, DataProvider wraps React tree in main.tsx, tsc --noEmit: 0 errors [2026-04-06]
- `TASK-005`: App shell complete — BrowserRouter in main.tsx, Header (wordmark + nav links + dark mode toggle persisted to localStorage), Layout component, PlannerPage (progress strip + scrollable timeline + palette sidebar + chat slide-in overlay), SchedulerPage (2-col: selector left / calendar right), tsc --noEmit: 0 errors [2026-04-15]
- `TASK-006`: Semester timeline grid + course cards complete — PlanContext (useReducer, ADD/REMOVE/MOVE/SET_PLAN/PIN/UNPIN), 8-semester sequence with past/current/future status pre-loaded from Adi's transcript, CourseCard (category color border, GPA badge, past-card muting + grade + checkmark), SemesterColumn (season icon, credit counter, EmptySlot drop-zone placeholders), TimelineGrid horizontal scroll, PlanProvider in main.tsx, tsc --noEmit: 0 errors [2026-04-15]
- `TASK-007`: Course palette panel complete — CoursePalette with 5 collapsible sections (ECE Core, Tech Core CA&ES, Gen Ed, Free Electives, Math), remaining-course logic (excludes completed+in-progress+placed with ECE old-number/honors and math transfer equivalencies), prereq dimming (lock icon + opacity-50 when no direct prereq satisfied), real-time search across all sections, CollapsibleSection reusable accordion, CourseCard extended with variant=palette + prereqsMet props, PlannerPage right sidebar wired up, tsc --noEmit: 0 errors [2026-04-15]

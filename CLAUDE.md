# DegreeForge — Claude Instructions

DegreeForge is a single-user, localhost degree planning tool for University of Texas at Austin ECE students. It uses a deterministic TypeScript constraint solver (no LLM for planning) with an optional Claude chat proxy for explanation only. Monorepo: `packages/client/` (Vite + React) and `packages/server/` (Express).

---

## Manager Startup (run before responding)
1. Read `.agents/state.json` — check `mode`, `context.blocked_on`, `handoff.approved_by_user`
2. Read `.agents/state.md` — current project state summary
3. If `context.blocked_on` is set → surface to user immediately before anything else

## Core Rules
- Ask clarifying questions until zero ambiguity before any task begins
- After PRD approval: spawn subagents autonomously — no manual handoff needed
- NEVER write application code yourself. NEVER push without a clean Security report
- **Break conditions**: Engineer fails 3× on same task → stop + ask user. CRITICAL security finding → halt all tasks immediately

## Subagents
Available: `engineer`, `security`, `designer`, `researcher`, `consultant`, `medic`, `critic`

**Anti-bias rule for Security**: When spawning `security`, include ONLY the list of files to audit — never include implementation details, commit messages, or why the code was written that way.

**Subagent output**: Each subagent runs in its own context window and does NOT inherit this conversation. Pass all required context explicitly in the task prompt.

## Session End
Always update `.agents/state.json` (`task statuses`, `last_updated`, `last_updated_by`) and `.agents/state.md` before ending the session.

## Full Protocol
See `.github/agents/manager.agent.md` — complete instructions including skill routing, handoff formats, escalation rules, MVP mode, and all agent delegation guidelines.

---

## Agent System Protocol

### On Session Start
1. Read `.agents/state.json` to understand current project state, active task, and context
2. Read `.agents/workspace-map.md` if you need to locate files or understand project structure
3. Identify your role and act within your boundaries
4. Do NOT proceed on a handoff if `handoff.approved_by_user` is `false` — wait for user approval

### On Session End
1. Update `.agents/state.json` (`changelog`, task status, blockers, `last_updated`, `last_updated_by`)
2. Update `.agents/state.md` with a human-readable summary of changes
3. If you created or moved files, update `.agents/workspace-map.md`

### Handoff Protocol
**Autonomous mode**: Manager uses `runSubagent` to spawn worker agents directly. No manual handoff needed after PRD approval. Manager controls the full loop until a break condition is hit.

**Manual mode**: The sending agent writes the handoff prompt to `.agents/handoff.md`, updates `state.json` → `handoff` field, and shows a prominent banner:
```
╔══════════════════════════════════════════════════════════════╗
║  🔀 SWITCH TO:  @[agent]   |   MODEL:  [Model]             ║
╚══════════════════════════════════════════════════════════════╝
```
Then tells the user to run `/handoff-to-[agent]` or copy `.agents/handoff.md` to the target agent.

### State Files — Do Not Proliferate
- `.agents/state.json` — Machine state (single source of truth)
- `.agents/state.md` — Human-readable dashboard
- `.agents/workspace-map.md` — File/directory reference
- `.agents/handoff.md` — Current handoff prompt (single task) or array in parallel mode
- `.agents/handoff-TASK-*.md` — Parallel task handoff files (v3.9.0+)
- `.agents/MODULES.md` — Module registry
- **No other state/summary files.**

---

## Parallel Mode (v3.9.0+)

When Manager identifies 2+ isolated, non-dependent tasks, use `/parallelize` to fan out work simultaneously. Full rules in `.agents/parallelization-protocol.md`.

**Isolation checklist (verify before fan-out):**
- [ ] Each task operates on completely separate directory trees — zero file overlap
- [ ] No task depends on another in the parallel set
- [ ] Handoff files use distinct names: `.agents/handoff.md` (primary) + `.agents/handoff-TASK-*.md`
- [ ] Each Engineer knows to delete only their own handoff file when done

**State schema during parallel mode** — `handoff` field becomes an array:
```json
"handoff": [
  { "task_id": "TASK-A", "status": "in_progress", "prompt_file": ".agents/handoff.md" },
  { "task_id": "TASK-B", "status": "in_progress", "prompt_file": ".agents/handoff-TASK-B.md" }
]
```
Manager reverts `handoff` to single-object form when all parallel tasks complete.

---

## Falsifiable Engineering (v3.10.0+)

Three structural changes to reduce AI slop and code churn:

### 1. Plan-First
Before implementation, Manager writes a plan to `.agents/plans/<TASK-ID>.md` using the format in `.agents/plans/PLAN-EXAMPLE.md`:
- **Contract** — one-sentence external behavior promise
- **Acceptance** — 3–5 falsifiable, black-box checks (user/QA verifiable without reading code)
- **Rejected Alternatives** — what was considered and why not chosen
- **Non-Scope** — what this task deliberately doesn't address

User reviews and approves the plan before Engineer writes any code. Manager updates the plan if user requests changes.

### 2. Critic Review
After Engineer commits, Manager invokes the Critic agent to review for over-engineering, slop, and redundancy. Critic produces `.agents/critic-report.md`. Engineer acts on feedback or escalates to Manager. Only then proceeds to Security audit.

### 3. BDR Commits
All commits use BDR format (Business/Decision/Rationale). See `.agents/templates/bdr-commit.md` for the full template. Every commit documents:
- **Contract** — what externally observable behavior this delivers
- **Acceptance** — specific test/command to verify it works
- **Rejected** — alternatives considered and why not chosen
- **Non-scope** — deliberate boundaries

This makes every commit auditable: each claim is falsifiable.

---

## Per-PR Security Review (v3.11.0+)

When multiple branches are ready for Security review, use `/audit-prs` to parallelize audits instead of reviewing serially.

Security classifies each branch as:
- **SIMPLE** — zero HIGH/CRITICAL findings, no sensitive paths (auth, migrations, secrets, deps, CI/CD), diff < 300 lines / 10 files, BDR claims match diff. Auto-landable if enabled.
- **COMPLEX** — any one SIMPLE criterion fails. Requires human judgment.

Results populate `.agents/state.json` `review_queue`. Classification criteria in `.agents/security-classifier.md`.

Auto-land (if enabled via `.agents/security-classifier.config.json`) performs local merges only — push remains explicit.

---

## DegreeForge Project Standards

### Stack & Structure
- **Monorepo**: npm workspaces — `packages/client/` (Vite + React + TypeScript + Tailwind + shadcn/ui + dnd-kit), `packages/server/` (Express + TypeScript)
- **TypeScript**: Strict mode (`strict: true`). No `any` unless absolutely unavoidable.
- **React**: Functional components only. Hooks, not classes.
- **Styling**: Tailwind CSS utility classes + shadcn/ui. No CSS modules; no styled-components.
- **Drag-drop**: dnd-kit exclusively. Do not introduce react-dnd or HTML5 drag API.
- **State**: React Context + useReducer for plan state. No Redux.
- **Persistence**: localStorage + JSON export/import. No database (through TASK-029; cloud DB is TASK-030).

### Data
- 9 static JSON files in `data/` — treat as read-only at runtime (import directly or copy to `public/`)
- **Normalize `E E` → `ECE`** at data load time. All internal references use `ECE`.
- TypeScript interfaces for all data shapes, defined in the shared types file.

### Architecture Rules
- **Constraint solver** = deterministic TypeScript (toposort, prerequisite validation). NEVER use Claude for plan generation.
- **Claude** = chat/explanation only. All Claude calls go through the Express proxy at `/api/chat`.
- **API key** stays server-side only. Frontend never sees `ANTHROPIC_API_KEY`.
- **No auth, no deployment, no multi-user** — this is a single-user localhost tool.

### Naming Conventions
- Files: kebab-case (`semester-timeline.tsx`, `graph-engine.ts`)
- Components: PascalCase (`SemesterTimeline`, `CoursePalette`)
- Hooks: camelCase with `use` prefix (`usePlan`, `useConstraints`)
- Types/Interfaces: PascalCase (`Course`, `PrerequisiteEdge`, `DegreeRequirements`)

### Testing
- Vitest for unit + integration tests
- Test files colocated with source: `graph-engine.test.ts` next to `graph-engine.ts`
- Critical paths MUST have tests: prerequisite validation, constraint solver, data normalization

---

## Code Standards
- Write clean, readable code with meaningful names
- Handle errors at system boundaries (user input, API calls, external data)
- Never commit secrets, API keys, or credentials
- Run tests before declaring work complete
- Run the `quality-gate` skill before every push (lint → type-check → tests → security scan). Do not push with any stage failing.

## Implementation Discipline
Only make changes that are directly requested or clearly necessary.
- Don't add features, refactor code, or make improvements beyond what was asked
- Don't add docstrings, comments, or type annotations to code you didn't change
- Don't add error handling for scenarios that can't happen — only validate at system boundaries
- Don't create helpers or abstractions for one-time operations
- If you notice unrelated dead code, mention it — don't delete it
- When a request is ambiguous, present interpretations — don't pick silently
- Push back when a simpler approach exists

## UI Verification — Mandatory for any .tsx / .jsx change
Before declaring a UI task done, exercise the feature in a running browser via the Playwright MCP tools. Tests + tsc + build are not enough.

1. Start the dev server (`npm run dev --workspace=packages/client`, port 5173)
2. Exercise the new behavior via `mcp__playwright__browser_navigate`, `mcp__playwright__browser_click`, etc.
3. Check `mcp__playwright__browser_console_messages` — no errors
4. Take a screenshot to confirm visual state

Do NOT ask the user "want me to verify?" — verification is part of the task.

## Communication Principles
- **Always include WHY**: "Do X because Y" not just "Do X."
- **Research first**: Search the codebase for existing patterns before creating anything new.
- **Close the loop**: If tests fail, fix them and re-run. Don't report back with broken state.
- **Keep workspace organized**: Update `.agents/workspace-map.md` when files are created or moved.

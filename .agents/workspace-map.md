# Workspace Map

> Updated by agents whenever files are created, moved, or deleted.
> Agents read this to orient themselves instead of scanning the entire codebase.

## Project Structure

```
.github/
  copilot-instructions.md       # Base project instructions (always loaded)
  agents/
    manager.agent.md             # Planner/orchestrator — user's primary contact
    engineer.agent.md            # Code executor — implements features
    security.agent.md            # Adversarial security auditor
    designer.agent.md            # UI/UX design consultant
    consultant.agent.md          # Deep reasoning specialist (Opus)
  copilot/
    hooks.json                       # Copilot lifecycle hooks
  prompts/
    handoff-to-engineer.prompt.md   # Quick handoff template -> Engineer
    handoff-to-security.prompt.md   # Quick handoff template -> Security
    handoff-to-designer.prompt.md   # Quick handoff template -> Designer
    handoff-to-consultant.prompt.md # Quick handoff template -> Consultant     
    init-project.prompt.md          # PRD intake, research, scaffolding, context
    mvp.prompt.md                   # MVP mode: max velocity, deferred gates
  skills/
    tdd/SKILL.md                      # TDD workflow — RED -> GREEN -> REFACTOR
    quality-gate/SKILL.md             # Pre-push gate: lint + type-check + test + security scan
    update-workspace-map/SKILL.md     # Auto-regenerate workspace-map.md post-commit
    auto-run/SKILL.md                 # Autonomous task runner

.agents/
  state.json                     # Machine-readable project state (source of truth)
  state.md                       # Human-readable project dashboard
  workspace-map.md               # THIS FILE — directory reference
  handoff.md                     # Current inter-agent handoff prompt

package.json                     # Root — npm workspaces (packages/*)

packages/                        # Monorepo (npm workspaces)
  client/                        # Vite + React + TypeScript + Tailwind + shadcn/ui
    src/
      App.tsx                    # Root component — renders <Layout />        
      main.tsx                   # React entry point — TooltipProvider > DataProvider > App
      index.css                  # Tailwind base + shadcn CSS variables
      types/
        index.ts                 # TypeScript interfaces (CatalogCourse, PrereqGraph, UserProfile, etc.)
      context/
        DataContext.tsx           # DataProvider + hooks (useCourseCatalog, usePrereqGraph, etc.)
        PlanContext.tsx           # PlanProvider + hooks (useSemesters, usePlan, useHoveredCourse, etc.)
      hooks/
        usePrereqGraph.ts         # TASK-010: Returns memoized PrereqGraph class instance
        useValidation.ts          # TASK-010: Computes prerequisite violations
      lib/
        utils.ts                 # cn() helper
        normalize.ts             # E E -> ECE normalization boundary
        graph-engine.ts          # TASK-003: Core prerequisite graph logic      
        graph-engine.test.ts     # TASK-003: Tests for graph engine + validation
        solver.ts                # TASK-004: Constraint solver — greedy toposort plan generator
        solver.test.ts           # TASK-004: 7 unit tests for solver
        requirements.ts          # TASK-004: Remaining requirements builder (degree + tech core)
        progress.ts              # computeProgress() for degree requirements    
        progress.test.ts         # Tests for progress computation
        course-utils.ts          # inferCategory(), gpaColorClass(), etc.       
        what-if.ts               # TASK-011: What-if diff calculation logic
        what-if.test.ts          # TASK-011: Tests for what-if logic
        normalize.test.ts        # 19 tests for normalization logic
      pages/
        PlannerPage.tsx          # V1: progress strip + ValidationBanner + TimelineGrid + CoursePalette
        SchedulerPage.tsx        # V2: 2-col layout (course selector / weekly calendar)
      components/
        Header.tsx               # Wordmark + nav links + dark mode toggle      
        Layout.tsx               # Shell: Header + Routes
        ProgressBars.tsx         # TASK-009: 5 progress bars for degree requirements
        ValidationBanner.tsx     # TASK-010: Alert banner for prerequisite issues
        CourseCard.tsx           # Course card: violation borders, tooltips, downstream highlights
        CoursePalette.tsx        # Right-sidebar: collapsible categories, search, highlights
        SemesterColumn.tsx       # Semester column: course cards list, drop-zones
        TimelineGrid.tsx         # Horizontal-scroll timeline grid
        CourseDetailDialog.tsx   # TASK-013: Course detail dialog (grade dist, prereqs, Fall 2026 sections, external links)
        WhatIfPanel.tsx          # TASK-011: What-if simulator panel (slide-over)
        ChatPanel.tsx            # TASK-012: AI chat interface
        ui/
          button.tsx             # shadcn Button component

          tooltip.tsx            # shadcn Tooltip component
          progress.tsx           # shadcn Progress component
    public/
      data/                      # All 9 JSON data files
        course-catalog.json
        prerequisite-graph.json
        tech-cores.json
        degree-requirements.json
        offering-schedule.json
        math-requirements.json
        fall-2026-sections.json
        grade-distributions.json
        user-profile.json
  server/                        # Express proxy for Claude API
    src/
      index.ts                   # Express server

data/                            # Static JSON data files (9 total)
  course-catalog.json
  prerequisite-graph.json
  tech-cores.json
  degree-requirements.json
  offering-schedule.json
  math-requirements.json
  fall-2026-sections.json
  grade-distributions.json
  user-profile.json

tools/
  corpus/                        # Python CLI for corpus extraction
    extract_courses.py
    extract_prereqs.py
    extract_tech_cores.py
    extract_degree_reqs.py
    extract_offering.py

PRD.md                          # Product Requirements Document
CLAUDE.md                       # Manager agent configuration
CHANGELOG.md                    # Version changelog
```

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
    hooks.json                       # Copilot lifecycle hooks (pre-push → quality-gate, pre-commit → workspace-map)
  prompts/
    handoff-to-engineer.prompt.md   # Quick handoff template → Engineer
    handoff-to-security.prompt.md   # Quick handoff template → Security
    handoff-to-designer.prompt.md   # Quick handoff template → Designer
    handoff-to-consultant.prompt.md # Quick handoff template → Consultant
    init-project.prompt.md          # PRD intake (file/paste/idea), research, scaffolding, GitHub Issues, Context7 MCP
    mvp.prompt.md                   # MVP mode: max velocity, aggressive parallelization, deferred gates
    review-dependencies.prompt.md   # Pre-handoff dependency vetting for supply chain security
    retrofit.prompt.md              # Retrofit existing projects; IDE-specific (VS Code, JetBrains, Eclipse, Xcode)
    learn.prompt.md                 # Extract session patterns → copilot-instructions.md + Copilot Memory
    remember-handoff.prompt.md      # Write handoff to Copilot Memory — eliminates copy-paste between agents
  skills/
    code-review/SKILL.md              # On-demand code review checklist
    security-audit/SKILL.md           # On-demand security audit checklist
    tdd/SKILL.md                      # TDD workflow — RED → GREEN → REFACTOR
    quality-gate/SKILL.md             # Pre-push gate: lint + type-check + test + security scan
    update-workspace-map/SKILL.md     # Auto-regenerate workspace-map.md post-commit
    supply-chain/SKILL.md             # Standalone 4-gate supply chain security (submittable to awesome-copilot)
    sbom/SKILL.md                     # Native SBOM generation via syft/cdxgen + CVE scan via osv-scanner
    auto-run/SKILL.md                 # Autonomous task runner — run all tasks to completion
  scripts/
    auto-run.ps1                      # PowerShell orchestrator for Claude CLI autonomous execution

.agents/
  state.json                     # Machine-readable project state (source of truth)
  state.md                       # Human-readable project dashboard
  workspace-map.md               # THIS FILE — directory reference
  handoff.md                     # Current inter-agent handoff prompt
  handoffs/                      # Pre-generated handoffs for auto-run (one per task)

.gitignore                       # TEMPLATE .gitignore (commits all agent files)
.gitignore.project               # PROJECT .gitignore (rename after cloning — strips agent files)
README.md                        # Boilerplate documentation

package.json                     # Root — npm workspaces (packages/*)
.env.example                     # ANTHROPIC_API_KEY=your_key_here

packages/                        # Monorepo (npm workspaces)
  client/                        # Vite + React + TypeScript + Tailwind + shadcn/ui
    src/
      App.tsx                    # Root component — renders <Layout />
      main.tsx                   # React entry point — BrowserRouter > DataProvider > App
      index.css                  # Tailwind base + shadcn CSS variables (Slate theme)
      types/
        index.ts                 # TypeScript interfaces for all 9 JSON schemas (CatalogCourse, PrereqGraph, GradeDistribution, UserProfile, DegreeRequirements, TechCores, OfferingSchedule, MathRequirements, FallSections + all nested types)
      context/
        DataContext.tsx           # DataProvider (loads all 9 files on mount, applies E E→ECE normalization) + 11 typed hooks (useCourseCatalog, usePrereqGraph, useTechCores, useDegreeRequirements, useOfferingSchedule, useMathRequirements, useFallSections, useGradeDistributions, useUserProfile, useDataLoading, useDataError)
        PlanContext.tsx           # PlanProvider (useReducer: ADD/REMOVE/MOVE/SET_PLAN/PIN/UNPIN) + hooks (useSemesters, usePlan, usePinnedCourses, usePlanDispatch, useSemesterCourses). Pre-loaded with Adi's transcript. 8-semester sequence Fall 2025→Spring 2029.
      lib/
        utils.ts                 # cn() helper (clsx + tailwind-merge)
        normalize.ts             # normalizeEEtoECE(), normalizeDeptCode(), normalizeGradeDistributions() — single E E→ECE normalization boundary
        normalize.test.ts        # 19 vitest unit tests for normalization functions
        data-loaders.ts          # Typed fetch helpers for all 9 JSON endpoints (loadCourseCatalog, loadPrereqGraph, etc.)
        course-utils.ts          # inferCategory(), getCourseCredits(), gpaColorClass(), getCourseTitle(), CATEGORY_BORDER, CATEGORY_LABEL
      pages/
        PlannerPage.tsx          # V1: progress strip + TimelineGrid + course palette + chat slide-in overlay
        SchedulerPage.tsx        # V2: 2-col layout (course selector left ~40% / weekly calendar right ~60%)
      components/
        Header.tsx               # Wordmark + nav links (Planner/Schedule) + dark mode toggle (persisted to localStorage)
        Layout.tsx               # Shell: Header + Routes (/ → PlannerPage, /schedule → SchedulerPage)
        CourseCard.tsx           # Course card: category left-border, GPA badge (color-coded), past-card muting + letter grade + checkmark overlay; variant="palette" + prereqsMet for palette mode
        CollapsibleSection.tsx   # Reusable accordion: title + count badge + chevron toggle + children; used by CoursePalette
        CoursePalette.tsx        # Right-sidebar palette: 5 collapsible sections (ECE Core, Tech Core CA&ES, Gen Ed, Free Electives, Math), real-time search, prereq dimming, equivalency map for old/honors course numbers
        SemesterColumn.tsx       # Semester column: header (season icon + label + credit counter + status badge), course cards list, EmptySlot drop-zone placeholders (future only)
        TimelineGrid.tsx         # Horizontal-scroll timeline: renders all 8 SemesterColumns, wires PlanContext + DataContext
        ui/
          button.tsx             # shadcn Button component
          badge.tsx              # shadcn Badge component
          tooltip.tsx            # shadcn Tooltip component
          card.tsx               # shadcn Card component
          progress.tsx           # shadcn Progress component
          dialog.tsx             # shadcn Dialog component
          scroll-area.tsx        # shadcn ScrollArea component
          separator.tsx          # shadcn Separator component
    public/
      data/                      # All 9 JSON data files (copied from root data/)
        course-catalog.json
        prerequisite-graph.json
        tech-cores.json
        degree-requirements.json
        offering-schedule.json
        math-requirements.json
        fall-2026-sections.json
        grade-distributions.json
        user-profile.json
    index.html                   # Vite HTML entry
    vite.config.ts               # Vite config (port 5173, /api proxy → 3001, @/ alias, vitest test block)
    tailwind.config.ts           # Tailwind v3 config (darkMode class, shadcn colors/radius)
    postcss.config.js            # PostCSS (tailwindcss + autoprefixer)
    components.json              # shadcn/ui config (style: default, baseColor: slate)
    tsconfig.json                # TypeScript config (strict, bundler resolution, @/ paths)
    tsconfig.node.json           # TypeScript config for vite/tailwind config files
    package.json                 # Client dependencies (React, dnd-kit, shadcn radix, router)
  server/                        # Express proxy for Claude API
    src/
      index.ts                   # Express server — /api/health + /api/chat stub (port 3001)
    tsconfig.json                # TypeScript config (strict, CommonJS, outDir: dist)
    package.json                 # Server dependencies (express, cors, dotenv, anthropic sdk)

data/                            # Static JSON data files (9 total — input for frontend)
  course-catalog.json            # 378 ECE + Math courses (from corpus extraction)
  prerequisite-graph.json        # 378 nodes, 580 edges (from corpus extraction)
  tech-cores.json                # 9 tech core tracks (from corpus extraction)
  degree-requirements.json       # BSE requirements (from corpus extraction)
  offering-schedule.json         # 76 courses w/ semester offering data (from corpus extraction)
  math-requirements.json         # BA Math + Adv Math Cert + JSP/CTI Cert (from web research)
  fall-2026-sections.json        # 62 courses, 232 sections (lower+upper div, from OCR'd schedule pages)
  grade-distributions.json       # 249 courses, 5 years real data (2021-2026) from CSVs
  user-profile.json              # Adi's transcript, preferences, goals, tech core choice

tools/
  corpus/                        # Python CLI for searching/extracting data from scraped corpus
    __main__.py                  # CLI entry point (search, lookup, files, extract-*)
    __init__.py
    search.py                    # Full-text search across corpus txt files
    extract_courses.py           # ECE + Math course extraction → course-catalog.json
    extract_prereqs.py           # Prerequisite graph extraction → prerequisite-graph.json
    extract_tech_cores.py        # Tech core track extraction → tech-cores.json
    extract_degree_reqs.py       # BSE degree requirements → degree-requirements.json
    extract_offering.py          # Offering schedule extraction → offering-schedule.json

scraped_data_corpus/             # Raw source data (PDFs, Excel, web text)
  images/                        # OCR'd schedule page images (53 PNGs)
  txt/                           # Text versions of corpus files (23 files)
  *.pdf                          # Original PDF documents (schedule pages, catalogs, tech core packet)
  AE and Free Elective Course Database.xlsx  # Elective data spreadsheet

convert_corpus.py               # PDF → text conversion script (PyMuPDF for text PDFs)
render_image_pdfs.py            # PDF → PNG rendering for image-based PDFs

wiki/                            # LLM-compiled knowledge base (Karpathy LLM-Wiki pattern)
  SCHEMA.md                      # Wiki conventions, workflows, context budget guidelines
  index.md                       # Master index — read this first every session
  log.md                         # Append-only session log (grep-friendly format)
  gaps.md                        # Known knowledge gaps — auto-updated by wiki-lint skill
  degree-reqs/
    overview.md                  # Full BSE ECE requirement map
    ece-core.md                  # 10 required ECE core courses
    tech-cores.md                # All 10 tech core tracks summary
    math-sequence.md             # Math prereq chain + Math BA option
    free-electives.md            # 14-hour free elective constraints
  user/
    adithya-profile.md           # Student profile (completed, in-progress, goals, GPA)
  tech-cores/
    computer-arch-embedded.md    # Declared track deep dive (CE, M 325K, ECE 316/460N)
  scheduling/
    offering-guide.md            # Course offering patterns (F/S/both/rare)

.github/skills/wiki-lint/SKILL.md  # Weekly wiki health check — gaps, orphans, contradictions, learning resources

.obsidian/                       # Obsidian vault config — open the repo root as an Obsidian vault
  app.json                       # General app settings (wikilinks, attachments)
  graph.json                     # Graph view settings (node size, link force)
  workspace.json                 # Vault workspace config
ocr_schedules.py                # Tesseract OCR: schedule page images → text files
parse_sections.py               # Parse OCR'd schedule text → fall-2026-sections.json
grade_distributions.py          # UT grade distribution pipeline (--parse for CSVs, --placeholder)
UT_Grade_Parser/                # Cloned Rust tool (reference only — not buildable, no cargo installed)
utgradesdist_21-26/             # Raw grade distribution CSVs (5 files, 21-22 through 25-26)

PRD.md                          # Product Requirements Document (600 lines, all specs)
CLAUDE.md                       # Manager agent configuration
CHANGELOG.md                    # Version changelog
RETROFIT.md                     # Retrofit adoption guide
```

## Key Directories

| Directory | Purpose |
|-----------|---------|
| `packages/client/` | [planned] Vite + React + TypeScript frontend |
| `packages/server/` | [planned] Express proxy for Claude API |
| `data/` | Static JSON data files — the 9 input files the frontend will consume |
| `tools/corpus/` | Python CLI for corpus search + data extraction |
| `scraped_data_corpus/` | Raw source data (PDFs, images, text) |
| `.agents/` | Agent state files (state.json, state.md, workspace-map, handoff) |
| `.github/skills/` | Skill definitions available to all agents |
| `.github/agents/` | Agent role definitions |

## Key Files

| File | Purpose |
|------|---------|
| `PRD.md` | Complete product spec — all schemas, features, constraints |
| `.agents/state.json` | Machine-readable project state (source of truth) |
| `data/grade-distributions.json` | 249 courses, real grade data from 5 CSV files |
| `grade_distributions.py` | Parses CSVs from `utgradesdist_21-26/` into JSON |

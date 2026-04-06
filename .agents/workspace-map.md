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
      App.tsx                    # Root component — shadcn Button + Badge placeholder
      main.tsx                   # React entry point
      index.css                  # Tailwind base + shadcn CSS variables (Slate theme)
      lib/
        utils.ts                 # cn() helper (clsx + tailwind-merge)
      components/
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
    vite.config.ts               # Vite config (port 5173, /api proxy → 3001, @/ alias)
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

# DegreeForge Wiki — Schema

This document tells the LLM agent how the wiki is structured, what conventions to follow, and what workflows to use. Co-evolve this with the LLM as the wiki grows.

---

## Purpose

This wiki is the **compiled knowledge layer** for DegreeForge — a degree planner for UT Austin ECE (2026-2028 catalog). Raw source data lives in `data/*.json` and `scraped_data_corpus/`. The LLM reads those sources, synthesizes them, and writes structured wiki pages here. You read the wiki; the LLM writes it.

**Key benefit**: Agents read 5-10 focused wiki pages instead of scanning 20+ raw JSON/text files. Estimated 60-80% token reduction per session.

---

## Directory Structure

```
wiki/
  SCHEMA.md               ← this file — wiki conventions and workflows
  index.md                ← master index of all pages (read this first on every session)
  log.md                  ← append-only session log
  gaps.md                 ← auto-generated gap list (lint output)
  degree-reqs/
    overview.md           ← full BSE ECE degree requirement map
    ece-core.md           ← 10 required ECE core courses
    tech-cores.md         ← all 10 tech core tracks summary
    math-sequence.md      ← math prerequisites + Math BA option
    free-electives.md     ← free elective hour constraints
  user/
    adithya-profile.md    ← student profile + completed courses + in-progress
  tech-cores/
    computer-arch-embedded.md  ← declared track deep dive
  scheduling/
    offering-guide.md     ← which courses offered which semesters
```

---

## Raw Sources (read-only)

Never modify files in these locations:

| Location | Contents |
|---|---|
| `data/*.json` | Compiled structured data — course catalog, prereqs, degree reqs, tech cores, grade distributions, offering schedule, sections |
| `scraped_data_corpus/txt/` | OCR'd source documents — course catalog pages, tech core packets, flowcharts, offering schedule |
| `packages/client/public/data/` | Mirror of `data/` served to frontend |

---

## Workflows

### Ingest (adding a new source)
1. LLM reads the raw source
2. Discusses key takeaways if relevant
3. Creates or updates wiki pages (may touch 5-15 pages for a rich source)
4. Updates `index.md` with new/changed pages
5. Appends entry to `log.md`: `## [YYYY-MM-DD] ingest | Source Title`

### Query (answering a question)
1. LLM reads `index.md` first to find relevant pages
2. Reads the specific pages (not raw data files)
3. Synthesizes answer with wiki citations (e.g. `[[degree-reqs/overview]]`)
4. If the answer would be useful for future queries, file it as a new wiki page

### Lint (weekly health check)
1. Run the `wiki-lint` skill (`.github/skills/wiki-lint/SKILL.md`)
2. Writes findings to `gaps.md`
3. Appends to `log.md`: `## [YYYY-MM-DD] lint | findings summary`

---

## Page Format

### Required frontmatter
```yaml
---
title: Page Title
tags: [degree-reqs, ece-core]   # see tag taxonomy below
source_count: 2                  # number of raw sources this page synthesizes
updated: YYYY-MM-DD
---
```

### Internal links
Use Obsidian-style wikilinks: `[[degree-reqs/overview]]`, `[[user/adithya-profile]]`

### Conventions
- Keep pages focused (one concept per page)
- Lead with a 2-3 sentence summary
- Use tables for structured data (course lists, requirements, credit counts)
- Flag contradictions with `> ⚠️ CONFLICT:` blockquotes
- Flag items needing verification with `> 🔍 VERIFY:`

---

## Tag Taxonomy

| Tag | Used for |
|---|---|
| `degree-reqs` | Degree requirement pages |
| `ece-core` | The 10 required ECE core courses |
| `tech-core` | Tech core track pages |
| `scheduling` | Course offering and section pages |
| `user` | Student profile and plan |
| `courses` | Individual course pages |
| `math` | Math sequence and requirements |
| `gaps` | Known knowledge gaps |

---

## Context Budget Guidelines

When loading context for a session, prefer this order:
1. `wiki/index.md` — always (cheap, gives full map)
2. `wiki/user/adithya-profile.md` — for planning sessions
3. Domain-specific pages based on query
4. Raw data (`data/*.json`) only when wiki page is missing or outdated

**Do NOT** load all of `data/course-catalog.json` (large) — instead use `wiki/degree-reqs/ece-core.md` for core questions or `wiki/tech-cores/computer-arch-embedded.md` for track questions.

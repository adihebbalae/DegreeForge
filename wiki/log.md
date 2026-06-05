# Wiki Log

Append-only record of wiki events. Format: `## [YYYY-MM-DD] type | description`

Query with: `grep "^## " wiki/log.md | tail -10`

---

## [2026-04-15] init | Initial wiki compiled from all raw data sources

**Agent**: GitHub Copilot (Claude Sonnet 4.6)
**Sources ingested**:
- `data/course-catalog.json` → `degree-reqs/ece-core.md`
- `data/degree-requirements.json` → `degree-reqs/overview.md`, `degree-reqs/free-electives.md`
- `data/tech-cores.json` → `degree-reqs/tech-cores.md`, `tech-cores/computer-arch-embedded.md`
- `data/math-requirements.json` → `degree-reqs/math-sequence.md`
- `data/offering-schedule.json` → `scheduling/offering-guide.md`
- `data/user-profile.json` → `user/student-profile.md`
- `data/prerequisite-graph.json` → cross-referenced into course pages
- `data/grade-distributions.json` → referenced in offering-guide.md
- `data/fall-2026-sections.json` → referenced in offering-guide.md

**Pages created**: 10
**Status**: Initial compile complete. Run lint to identify gaps.

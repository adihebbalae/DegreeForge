# Public Syllabi Scraper (UT CourseDocs / HB 2504)

Reproducible past-syllabi data for DegreeForge. Pulls UT's **fully public**
"Access Syllabi & CVs" portal — **no UT EID, no cookie, no secret** — and
extracts grading breakdowns, topic schedules, textbooks, and a description
excerpt per course into `packages/client/public/data/syllabi.json`.

> Legal footing: Texas **HB 2504** mandates this corpus be public and
> searchable. No auth bypass, no vendor ToS. The official PDF link is stored
> with every entry so the app can always defer to the source of record.

## TL;DR

```bash
# Two ECE courses (the validation run)
npm run fetch:syllabi -- --department "E E" --course 302 --course 411

# Every ECE course the portal returns (the full MVP run)
npm run fetch:syllabi -- --department "E E"

# Preview without downloading PDFs or writing
npm run fetch:syllabi -- --department "E E" --course 302 --dry-run
```

Output: `packages/client/public/data/syllabi.json`, keyed by **normalized**
course id (`E E` → `ECE`), one representative (most-recent) syllabus per course.

## The portal request that works

A clean public **GET** with named params (verified live 2026-06-13):

```
https://utdirect.utexas.edu/apps/student/coursedocs/nlogon/
  ?year=&semester=&department=E+E&course_number=302
  &course_title=&unique=&instructor_first=&instructor_last=
  &course_type=In+Residence&search=Search
```

- **`department`** wants the spaced dropdown code — **`E E`, not `ECE`** (the
  same normalization quirk the sections pipeline documents). The CLI reverses
  the app's internal `ECE` back to `E E` automatically; pass other depts as
  their CourseDocs code (`C S`, `M`, `PHY`, …).
- **`course_number`** is an optional prefix filter (e.g. `302` also returns
  `302H`). Omit it to get every course in the department.
- Returns a `<table id="results_table">` — one row per course-section-term —
  with `Semester | Course | Unique | Title | Instructor(s) | CV | Syllabus |
  Survey`. The Syllabus cell carries a stable PDF link
  `/apps/student/coursedocs/courses/nlogon/download/<DOC_ID>/`.

## Parse / extraction approach

Two pure modules in `lib/` (no network, no fs — unit-tested against fixtures):

- **`parse-syllabi.ts`**
  - `parseResultRows(html)` — cheerio over `#results_table` into typed rows
    (`{ course, term, unique, title, instructor, docId, pdfUrl }`), `E E` → `ECE`
    normalized, malformed rows dropped (continue-on-failure).
  - `mostRecentSyllabiByCourse(rows)` — groups by course, keeps only rows with a
    real syllabus PDF, newest term first, de-duplicated by docId.
  - Heuristic field extractors over the PDF's plain text:
    - `extractGrading` — `(component, pct)` pairs from both inline prose
      ("Homework: 10%") **and** `pdftotext -layout` split tables (labels and
      percents on adjacent lines); clamps 1–100, de-dupes.
    - `extractTopics` — topic/weekly-schedule lines after a schedule header.
    - `extractTextbooks` — citation lines (publisher/edition/ISBN markers),
      rejecting homework-policy prose that merely contains a comma and a year.
    - `extractDescriptionExcerpt` — first prose paragraph, skipping logistics
      (times, emails, unique numbers); empty when none reads like a description.
  - Extraction is intentionally **best-effort**: instructor PDFs share no
    template, so structured fields degrade to empty rather than emit garbage,
    and the full PDF link is always retained.

- **`pdf-text.ts`** — PDF → text. Prefers the **`pdftotext -layout`** binary
  (poppler/xpdf) when on PATH; `-layout` preserves the column structure that
  grading tables depend on. Falls back to the `pdf-parse` Node library when the
  binary is absent, so the scraper runs in any environment.

  **This environment uses `pdftotext` 4.00** (present on PATH); `pdf-parse` is
  the portability safety net.

## Robustness

- Public fetch, no credentials, nothing masked (there are no secrets here).
- Polite **`--delay-ms`** (default 1200 ms) between every request.
- **Continue-on-failure**: a failed PDF download or a bad row is logged and
  skipped; only a hard non-results page (login redirect / layout drift) on the
  *sole* search aborts the run (non-zero exit).
- A search that returns a valid-but-empty results page logs `(no rows)` and
  moves on rather than crashing.

## CLI options

| Flag | Default | Meaning |
| --- | --- | --- |
| `--department <id>` | `E E` | CourseDocs dept code (repeatable). `ECE` auto-reverses to `E E`. |
| `--course <num>` | (all) | Restrict to one course number (repeatable). |
| `--max-per-course N` | `1` | Recent syllabi to keep per course. |
| `--delay-ms N` | `1200` | Polite delay between requests. |
| `--out <path>` | `packages/client/public/data/syllabi.json` | Output JSON. |
| `--dry-run` | off | Parse + report counts; download/write nothing. |

## Output schema

```ts
interface SyllabiFile {
  source: string;        // e.g. "coursedocs-public:E E; engine=pdftotext"
  generated_at: string;  // ISO timestamp
  syllabi: Record<string, {   // keyed by "ECE 302"
    course: string;
    title: string;
    term: string;             // "2022 Spring"
    instructor: string;
    docId: string;
    pdfUrl: string;           // official HB 2504 source link
    textChars: number;        // sanity signal that extraction produced text
    grading: { component: string; pct: number }[];
    topics: string[];
    textbooks: string[];
    descriptionExcerpt: string;
  }>;
}
```

## Running the full scrape

```bash
# All ECE courses (MVP target). Add more departments as the app needs them:
npm run fetch:syllabi -- --department "E E"

# A broader pass (ECE + the common gen-ed / math depts students hit):
npm run fetch:syllabi -- \
  --department "E E" --department "M" --department "PHY" --department "CH" \
  --department "C S" --department "RHE"
```

Recommended dept list mirrors the sections pipeline's verified `fos_fl` codes
(`ECE`→`E E`, `M`, `PHY`, `CH`, `C S`, `RHE`, …). Commit the produced
`syllabi.json`; this scraper is **data-only** — UI wiring is a follow-up.

## Files

- `fetch-syllabi.ts` — CLI entry (`npm run fetch:syllabi`)
- `lib/parse-syllabi.ts` — row parser + heuristic field extractors (pure)
- `lib/pdf-text.ts` — PDF → text (`pdftotext -layout`, `pdf-parse` fallback)
- `__tests__/` — vitest specs + HTML/text fixtures (run network-free in CI)

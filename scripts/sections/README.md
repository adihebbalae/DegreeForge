# Section Data Pipeline

Reproducible per-term section data for DegreeForge — no cookie scraping, no auth
bypass, no UT Portal session tokens.

## TL;DR

```bash
# Refresh fall 2026 from the existing repo snapshot (one-time migration)
npm run fetch:sections -- fall-2026 --from-legacy

# Attempt a public-HTML pull for a new term (best-effort, will likely 401 on protected pages)
npm run fetch:sections -- spring-2027

# Manual export → parse (the dependable path)
#   1. Visit https://utdirect.utexas.edu/apps/registrar/course_schedule/20272/results/?fos_fl=E+E
#      while logged in to your browser. Right-click → Save As → HTML.
#   2. Drop the saved file at scripts/sections/raw/spring-2027/ece.html
#   3. Re-run:
npm run fetch:sections -- spring-2027 --source scripts/sections/raw/spring-2027/ece.html
```

Outputs:

- `packages/client/public/data/<term-slug>.json` — per-term sections file, same
  schema as the legacy `fall-2026-sections.json`
- `packages/client/public/data/sections-index.json` — manifest enumerating which
  per-term files exist (DataContext reads this; it never hard-codes a filename)

## Investigation summary — what UT actually exposes

The goal was to find a fully automated path that respects the scope constraint
("no cookie scraping, no auth bypass, no UT Portal session tokens"). Here is
exactly what was checked and what came back.

### 1. `utdirect.utexas.edu/apps/registrar/course_schedule/<semcode>/results/`

The canonical course-search endpoint UT students hit when they pull up the
schedule of classes. URL pattern:

```
https://utdirect.utexas.edu/apps/registrar/course_schedule/20269/results/?fos_fl=E+E&level=L&search=Search
```

- Returns full HTML when accessed with an authenticated UT EID session
  (CAS cookie `SC` set)
- Returns a redirect to the CAS login page when accessed unauthenticated
- Some filter combinations return a partial result page even unauthenticated,
  but the section detail rows (Unique, Days, Hour, Room, Instructor) are
  consistently gated

**Verdict: requires login. Out of scope by the project's no-cookie-scraping
rule.** The reference repo `An-GG/ut-registration-api` documents the same
endpoints — and its README is explicit that it depends on an authenticated
session and a nonce token harvested from a logged-in page. We do not use it.

### 2. `registrar.utexas.edu/schedules`

The Registrar's "Class Schedules" portal. URL pattern:

```
https://registrar.utexas.edu/schedules
https://registrar.utexas.edu/schedules/<semcode>     # e.g. /20269
```

- The landing page is public HTML
- It links out to **PDF** "Class Schedule" booklets per college/department —
  not structured HTML rows
- The PDFs are publicly downloadable and contain the same data that's behind
  the authenticated `course_schedule` endpoint

**Verdict: viable but PDF-shaped.** This is the same source that produced the
original `fall-2026-sections.json` (see `parse_sections.py` at the repo root,
which OCR'd the rasterized booklet pages). Reproducible, but slow and brittle —
PDF layout drifts between semesters.

### 3. `catalog.utexas.edu`

The General Information catalog. Public, but lists *courses*, not *sections*.
No `unique` numbers, no meeting times, no instructors.

**Verdict: wrong data shape for the scheduler.**

### 4. Departmental mirrors (ECE Pearl Hall, etc.)

The ECE department maintains its own page listing class offerings each term.
Free-form HTML, no consistent schema, and only summary metadata. Not a
substitute for the section-detail records the scheduler needs.

**Verdict: not structured enough.**

## Chosen approach

**Manual export + cheerio parse**, with two fallbacks:

1. **Primary path** — the human:
   - Save the registrar's course-schedule HTML page to
     `scripts/sections/raw/<term-slug>/<dept>.html` while logged into UT EID
     **in your own browser**. (DegreeForge never touches your cookie jar.)
   - Run `npm run fetch:sections -- <term-slug> --source <path>`
   - The CLI parses the HTML with cheerio into the existing JSON schema and
     writes `packages/client/public/data/<term-slug>.json`.

2. **Public-HTML probe** — when no `--source` is given, the CLI fetches the
   public registrar URL and tries to parse it. If the response is an auth
   redirect (heuristic: contains `<title>UT EID Login` or no `Unique` cell),
   the CLI aborts cleanly with instructions to use the manual flow.

3. **Legacy migration** — `--from-legacy` copies the pre-existing
   `fall-2026-sections.json` snapshot into the new per-term layout without
   re-fetching. Used once during the TASK-027 migration so the existing
   scheduler/CourseDetailDialog keep working out of the gate.

## Why not just scrape with a saved cookie?

That was the explicit scope rule and it's correct. UT's terms of service
prohibit credential sharing, and the project doesn't want to ship a tool that
encourages either (a) checking a cookie into the repo or (b) running a
headless-browser auth flow that's one CAPTCHA away from breakage. The manual-
export path is honest about the trade-off: you authenticate as yourself, in
your own browser, once per term.

## Output schema

Identical to the existing `fall-2026-sections.json`:

```ts
interface FallSections {
  semester: string;          // e.g. "Fall 2026"
  semester_code: string;     // e.g. "20269"
  source: string;            // provenance string for this file
  courses: Record<string, {
    course: string;          // "ECE 302"
    title: string;           // "INTRO ELECTRICAL ENGINEERING"
    sections: Array<{
      unique: number;
      meetings: Array<{ days?: string; time: string; room?: string }>;
      instruction_mode: string;
      instructor: string;
      status: string;
      core: string;
    }>;
  }>;
}
```

## Semester code mapping

UT's `semester_code` is `YYYY` + a single season digit:

| Season | Digit |
| ------ | ----- |
| Spring | 2     |
| Summer | 6     |
| Fall   | 9     |

So `fall-2026` → `20269`, `spring-2027` → `20272`, `summer-2027` → `20276`.

The CLI handles the slug ↔ code conversion in `lib/term-codes.ts`.

## Files in this directory

- `README.md` — this file
- `fetch-term.ts` — CLI entry point (`npm run fetch:sections`)
- `lib/term-codes.ts` — term-slug ↔ UT semester-code mapping
- `lib/parse-html.ts` — cheerio-based parser for registrar HTML
- `lib/parse-legacy.ts` — pass-through for the existing fall-2026 snapshot
- `lib/write-index.ts` — updates `sections-index.json` after each successful run
- `raw/` — drop-zone for manually exported HTML files (gitignored)

## Running each semester

1. As soon as UT publishes the next term's schedule (typically ~6 weeks before
   registration opens), log into UT EID in your browser.
2. Navigate to the relevant department(s):
   `https://utdirect.utexas.edu/apps/registrar/course_schedule/<semcode>/results/?fos_fl=E+E&level=L&search=Search`
3. Save the resulting page as HTML to `scripts/sections/raw/<term-slug>/ece.html`.
4. Run: `npm run fetch:sections -- <term-slug> --source scripts/sections/raw/<term-slug>/ece.html`
5. Commit `packages/client/public/data/<term-slug>.json` and the updated
   `sections-index.json`.

## Limitations (honest notes)

- The public-HTML probe will fail for most filters; expect to use `--source`.
- The cheerio parser targets the current (2026) registrar HTML structure. If UT
  redesigns the page, the parser will likely break before it returns bad data
  (we look for explicit `Unique:` labels and abort if absent).
- Cross-listings: a course offered in multiple departments shows up under
  whichever fos\_fl filter you used. To capture all of them, save and pass
  multiple `--source` files (the CLI supports `--source a.html --source b.html`).
- `instruction_mode` and `core` field labels have shifted across past UT
  HTML revisions; the parser does best-effort matching and falls back to
  empty strings rather than guessing.

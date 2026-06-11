# Section Data Pipeline

Reproducible per-term section data for DegreeForge.

> **Scope-rule override (user decision, 2026-06-11):** the original pipeline
> forbade cookie-based scraping. The user has explicitly opted in to an
> authenticated fetch path for automated per-term pulls. The manual-export
> path is retained as a fallback and the cookie is **local-only** (never
> committed, never logged raw). See "Authenticated fetch" below.

## TL;DR

```bash
# Refresh fall 2026 from the existing repo snapshot (one-time migration)
npm run fetch:sections -- fall-2026 --from-legacy

# Authenticated fetch for a new term — all divisions (default, recommended)
export UT_SESSION_COOKIE="SC=<paste your cookie here>"
npm run fetch:sections -- spring-2027

# Authenticated fetch restricted to lower-division only
npm run fetch:sections -- spring-2027 --level L

# Manual export → parse (always-available fallback)
#   1. Visit https://utdirect.utexas.edu/apps/registrar/course_schedule/20272/results/?fos_fl=E+E&search=Search
#      (add &level=L to restrict to lower-division only)
#      while logged in to your browser. Right-click → Save As → HTML.
#   2. Drop the saved file at scripts/sections/raw/spring-2027/ece.html
#   3. Re-run:
npm run fetch:sections -- spring-2027 --source scripts/sections/raw/spring-2027/ece.html

# After fetching one or more terms, aggregate offering patterns:
npm run aggregate:offerings
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

Three paths, in order of preference:

1. **Authenticated fetch** (TASK-053 opt-in, user override) — when a session
   cookie is present, the CLI sends it to `utdirect.utexas.edu` and parses
   the full results page. The cookie is read **only** from `UT_SESSION_COOKIE`
   env var or the gitignored file `scripts/sections/.ut-session`. It is never
   logged raw, never committed, and never sent to any non-UT domain.

2. **Manual export** — save the page HTML from your logged-in browser and
   pass it with `--source`. The always-available fallback that requires no
   credential automation.

3. **Public-HTML probe** — when no `--source` and no cookie is present, the
   CLI fetches the public URL. Will usually get a CAS redirect and abort with
   instructions.

4. **Legacy migration** — `--from-legacy` copies the pre-existing
   `fall-2026-sections.json` snapshot. Used once during the TASK-027 migration.

## Authenticated fetch — how it works and the trade-offs

**Opt-in override (2026-06-11):** the original no-cookie rule was overridden
by the user. The mechanism is a server-side (Node script) fetch that sends your
personal EID session cookie to `utdirect.utexas.edu` over HTTPS. UTRP uses the
same endpoint via a browser extension (`credentials: include`) — this is the
server-side adaptation.

**Security guardrails (non-negotiable):**
- Cookie read ONLY from `UT_SESSION_COOKIE` env var or the gitignored file
  `scripts/sections/.ut-session`. Both paths are in `.gitignore`. Never
  hardcoded, never committed.
- Cookie value is ALWAYS masked in log output (`ABCD...[redacted]`).
- Cookie is sent ONLY to `*.utexas.edu` over HTTPS. The code refuses any
  non-UT URL.
- No password handling. Cookie-paste only (avoids the CAPTCHA/credential-store
  problem of headless EID login).
- Requests are sequential with a polite delay between terms; abort on first
  auth failure.

**On auth failure:** if the registrar responds with a CAS-login redirect or
no `Unique` cells (cookie expired), the script aborts with a re-paste message.
Session cookies from UT typically last a few hours. Get a fresh one from
DevTools → Network → any `utdirect.utexas.edu` request → Request Headers →
`Cookie` value.

**Circle-back clause:** if the live run hits UT resistance (rate-limit,
CAPTCHA, ToS enforcement, cookie too short-lived), stop and reassess with the
user. The manual-export path is the safety net and nothing is lost.

## Offering aggregation

After fetching one or more terms, run:

```bash
npm run aggregate:offerings
```

This reads every `fall-YYYY.json`, `spring-YYYY.json`, `summer-YYYY.json` in
`packages/client/public/data/` and derives `offered_semesters` for each course
from the observed terms (a course in a fall file → "fall", in a summer file →
"summer", etc.). It then merges into `offering-schedule.json`:

- **Observed entries** (from scraped data) — `offered_semesters` updated;
  `provenance: "observed"`.
- **Curated-only entries** (hand-authored, not yet scraped) — kept exactly
  as-is; `provenance: "curated"`. Existing 76-course coverage is never
  regressed.

The summer-offering gap (currently 0 summer courses in `offering-schedule.json`)
is closed as soon as you fetch and aggregate a summer term file.

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
- `fetch-term.ts` — CLI entry point (`npm run fetch:sections`); includes the
  authenticated fetch path added in TASK-053
- `aggregate-offerings.ts` — offering-pattern aggregation (`npm run aggregate:offerings`)
- `lib/term-codes.ts` — term-slug ↔ UT semester-code mapping
- `lib/parse-html.ts` — cheerio-based parser for registrar HTML
- `lib/parse-legacy.ts` — pass-through for the existing fall-2026 snapshot
- `lib/write-index.ts` — updates `sections-index.json` after each successful run
- `raw/` — drop-zone for manually exported HTML files (gitignored)
- `.ut-session` — gitignored file for your UT session cookie (NEVER commit this)

## Running each semester

### Authenticated path (fastest)

1. Log into UT EID in your browser.
2. Open DevTools → Network → navigate to
   `https://utdirect.utexas.edu/apps/registrar/course_schedule/<semcode>/results/?fos_fl=E+E&search=Search`
   (omitting `level=` returns all divisions — graduate, upper, lower, etc.)
3. In DevTools Network tab, click the request and copy the full `Cookie:` header
   value (it starts with `SC=`).
4. Set the cookie:
   ```bash
   # Option A: env var (current shell session only — preferred)
   export UT_SESSION_COOKIE="SC=<paste here>"

   # Option B: gitignored file (persists across sessions)
   echo "SC=<paste here>" > scripts/sections/.ut-session
   ```
5. Fetch the term (all divisions by default; add `--level L` to restrict):
   ```bash
   npm run fetch:sections -- spring-2027
   # or: npm run fetch:sections -- spring-2027 --level L
   ```
6. Aggregate offering patterns:
   ```bash
   npm run aggregate:offerings
   ```
7. Commit `packages/client/public/data/<term-slug>.json`, the updated
   `sections-index.json`, and the updated `offering-schedule.json`.

### Manual-export fallback

1. As soon as UT publishes the next term's schedule (~6 weeks before registration
   opens), log into UT EID in your browser.
2. Navigate to:
   `https://utdirect.utexas.edu/apps/registrar/course_schedule/<semcode>/results/?fos_fl=E+E&search=Search`
   (omit `level=` to get all divisions; append `&level=L` for lower-division only)
3. Save the resulting page as HTML to `scripts/sections/raw/<term-slug>/ece.html`.
4. Run:
   ```bash
   npm run fetch:sections -- <term-slug> --source scripts/sections/raw/<term-slug>/ece.html
   npm run aggregate:offerings
   ```
5. Commit `packages/client/public/data/<term-slug>.json`, the updated
   `sections-index.json`, and the updated `offering-schedule.json`.

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

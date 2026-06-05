# DegreeForge — Product Requirements Document

## 1. What This Is

DegreeForge is a personal-use interactive degree planner for a single user: an ECE + Math undergraduate at UT Austin (2026-2028 catalog). It replaces the Google Sheets course planning workflow with a visual semester timeline, drag-and-drop course placement, prerequisite validation, automated plan generation, and an LLM-powered chat for tradeoff analysis.

This is a localhost tool. No deployment, no auth, no multi-user support. The user profile, transcript, and preferences are hardcoded. The architecture should be clean enough to scale later, but shipping for one user on `localhost:3000` is the only goal.

---

## 2. The Problem

University academic counselors are conservative, impersonal, and hard to reach. They recommend the conventional track — what's safest and easiest to monitor — not what's optimal for a specific student's goals, risk tolerance, or course load capacity. The real value in course planning comes from upperclassmen who've been through the curriculum, but access to those people is luck-dependent. 

Existing tools solve adjacent problems but not this one:
- **IDA 2.0** (UT's official degree audit) tells you what you've completed and what's remaining. It does not recommend, optimize, or simulate alternatives.
- **UT Registration Plus** (60K+ user Chrome extension) surfaces per-course info (grade distributions, RMP links, eCIS, syllabi, conflict detection) during registration. It does not do multi-semester planning or generate schedules.
- **Stellic** (VC-backed, used at CMU/Case Western) does interactive degree planning with what-if scenarios, but it's a B2B enterprise product sold to institutions. UT does not use Stellic.
- **Coursicle** shows course info and schedule building but no degree-level planning.
- **ChatGPT/Claude direct** can answer "what should I take" if you paste your transcript, but has no structured data, no persistence, and no visual planning interface.

**The gap:** No tool combines structured degree requirements + prerequisite graph + grade distribution data + personalized profile into an interactive planner that generates opinionated, personalized multi-semester plans with drag-and-drop customization and natural-language tradeoff explanations.

---

## 3. User Profile (Hardcoded for V1)

```
Name: Adi H.
EID: demo001
University: UT Austin
Catalog: 2026-2028
Major: BSE in Electrical and Computer Engineering
Tech Core: Computer Architecture & Embedded Systems (leaning, not yet declared)
Considering: Math BA double major, Jefferson Scholars Certificate, Applied Math Certificate
Learning style: Above-average course load tolerance
```

The user profile includes:
- Completed courses with grades and semesters taken
- Current in-progress courses
- Career interests and goals (general)
- Courses enjoyed and why / courses disliked and why
- Topics of interest for electives
- Declared or intended tech core track
- Secondary degree/cert/minor aspirations

For v1 this is a static JSON file. For a future product version, this would be generated via a questionnaire flow processed by Claude into structured JSON.

---

## 4. V1: Four-Year Degree Planner

### 4.1 Core User Flow

1. User opens the app. The main view is a **semester timeline grid**.
2. **Completed semesters** are visually distinct (muted/checkmarked). Each shows the courses actually taken.
3. **Current semester** is highlighted.
4. **Future semesters** have empty slots.
5. A **course palette** panel sits to the right of the timeline, containing all courses the user could still take, organized by category.
6. User clicks **"Recommend 4-Year Plan"** → the constraint solver auto-fills future semesters based on degree requirements, prerequisite ordering, tech core selection, and user profile.
7. User **drags courses** from the palette into semester slots, or between semesters, to customize the plan.
8. On every change, the system **validates prerequisites** (red border + tooltip if violated) and **updates progress bars**.
9. User can **pin courses** to lock them in place before re-running the recommendation engine.
10. User can open a **chat panel** to ask questions about the plan in natural language.

### 4.2 Semester Timeline Grid

- **Layout:** Horizontal columns = semesters (Fall 1, Spring 1, Summer 1, Fall 2, ...). Rows = course slots within each semester (typically 4-6 courses per semester).
- **Course cards** display: course number, course title, category color indicator, average GPA (from grade distribution data).
- **Category colors:**
  - Blue → ECE core required courses
  - Yellow → Gen ed / core curriculum
  - Green → Tech core courses
  - Gray → Free electives
  - Purple → Math major/cert courses (if exploring that path)
- **Hover/click on a course card** shows: full prerequisites, what downstream courses it unlocks, grade distribution summary, and a "Check on RMP" link that opens the RateMyProfessor page for that course's typical instructors in a new tab.
- **Dependency edges** light up on hover — visual lines or highlights showing which future courses depend on the hovered course.

### 4.3 Course Palette Panel

A right-side panel with **categorized tabs or collapsible sections:**
- Remaining ECE core requirements
- Tech core courses (filtered by declared/intended track)
- Gen ed / core curriculum requirements still needed
- Free elective options
- Math major/cert courses (if exploring)

Each course card in the palette shows the course number, title, and average GPA. Courses whose prerequisites are not yet met (based on current plan state) are visually dimmed or marked.

Courses can be **dragged from the palette into a semester slot** on the timeline. They can also be **dragged between semesters** or **dragged back to the palette** to remove them.

### 4.4 Progress Bars

Four (or more) horizontal progress bars at the top of the page:
- **Total credit hours:** X / 128
- **ECE core requirements:** X / Y completed
- **Core curriculum (gen ed):** X / 8 courses
- **Tech core:** X / 8 courses
- **Free electives:** X / 11 hours

These update live on every plan change (drag-and-drop, recommendation, manual edit). They serve as the primary feedback mechanism — the "XP bars."

### 4.5 Recommendation Engine

This is **deterministic code, not an LLM call.** The recommendation engine is a constraint solver that:

1. Takes as input: remaining degree requirements, prerequisite graph, declared tech core, user profile (load tolerance, preferences), and any pinned courses.
2. Performs a topological sort of remaining required courses respecting all prerequisite and corequisite edges.
3. Distributes courses across remaining semesters, respecting:
   - Maximum course load per semester (configurable, default 5-6)
   - Prerequisite ordering (a course can only be placed in a semester after all its prereqs are in prior semesters)
   - Corequisite constraints (courses that must be taken in the same semester)
   - Course offering patterns (some courses are fall-only or spring-only — encode this in the data)
   - Pinned courses (user-locked placements are treated as fixed constraints)
4. Returns a complete semester-by-semester plan as structured data.

**Why not Claude for this:** Prerequisite chain resolution and constraint satisfaction are deterministic graph problems. An LLM will occasionally hallucinate edges, skip constraints, or produce invalid orderings. Code is faster, cheaper, and 100% reliable for this task.

### 4.6 Prerequisite Validation

On every course placement (drag-and-drop or auto-generated):
- **Check prerequisites:** Are all prereqs placed in a strictly earlier semester? If not → red border on the card, tooltip listing which prereqs are missing or misplaced.
- **Check corequisites:** Are all coreqs placed in the same semester or earlier? If not → orange border, tooltip.
- **Check downstream impact:** If moving a course later, does it push any dependent course into an invalid position? If so → highlight all affected courses.
- **Duplicate detection:** Prevent placing the same course twice.
- **Constraint checking:** For free electives, enforce the "max 3 hours lower division, no AP credit, one must be advanced math/science" rules.

### 4.7 What-If Simulator

The user can:
- **Switch tech core track:** Change from Computer Architecture to Software Engineering (or any of the 9 tracks) and see the plan recompute. Courses that no longer count toward the new track are flagged. New required courses are added to the palette.
- **Add a minor/cert/double major:** Toggle "Math BA," "Applied Math Certificate," or "Jefferson Scholars Certificate." Additional required courses appear in the palette. Progress bars update to show the new requirements. The recommendation engine incorporates the new constraints.
- **Remove a course:** Drag a course out of the plan back to the palette and see what downstream courses become invalid.

Each what-if change should show a **diff summary:** courses added, courses no longer needed, change in estimated graduation timeline, new critical path length.

### 4.8 Claude Chat Panel

A collapsible chat panel (slide-out from the right or bottom) where the user can ask natural-language questions about their plan. The system prompt sent to Claude on each message includes:
- The full current plan state (courses by semester)
- The prerequisite graph
- The user profile
- Degree requirements with completion status
- Grade distribution data for relevant courses

**Example queries the chat should handle:**
- "Can I handle ECE 460N and ECE 351K in the same semester?"
- "What happens if I add the math minor?"
- "Should I take M 427L before or after ECE 351K?"
- "Which tech core track has the most overlap with a math double major?"
- "What's the tradeoff between taking 6 courses in Fall 3 vs spreading into Summer 3?"

**Claude's role is explanation and tradeoff analysis, not plan generation.** The constraint solver generates plans; Claude explains why a plan is good or bad and helps the user reason about subjective tradeoffs.

### 4.9 "Check on RMP" / External Links

Each course card (on hover or in a detail view) includes quick-link buttons:
- **"Check on RMP"** → opens `ratemyprofessors.com/search/professors/1255?q={professor_name}` in a new tab
- **"View Grade Distribution"** → opens the UTGradesPlus or official UT page for that course
- **"Past Syllabi"** → opens `utdirect.utexas.edu/apps/student/coursedocs/nlogon/` (requires UT auth — user navigates manually)
- **"CIS Surveys"** → links to the UT course/instructor survey page

No data is ingested from these sources. They are convenience links for the user to manually verify recommendations. This keeps the data pipeline clean and avoids scraping/ToS issues.

---

## 5. V2: Next-Semester Course Planner

V2 is a separate page/view that takes the courses recommended (or manually selected) for the **next semester only** and optimizes the specific sections, professors, and times.

### 5.1 Input

- The courses selected for the upcoming semester from the V1 planner (e.g., "Fall 2026: ECE 411, M 427J, PHY 303E, SBS elective, RHE 306")
- Pre-scraped course schedule data for that specific semester (structured from the UT course schedule PDF)

### 5.2 Data Per Section

For each available section of each course, capture:
| Field | Source | Notes |
|---|---|---|
| Course number & title | Course schedule | |
| Unique number | Course schedule | Needed for registration |
| Professor name | Course schedule | |
| Days of week | Course schedule | MW, TTH, MWF, etc. |
| Time | Course schedule | Start and end time |
| Instruction mode | Course schedule | Face-to-face, online, hybrid |
| Location/building | Course schedule | Relevant for transition time |
| Section capacity | Course schedule | If available |
| Grade distribution (avg GPA) | UT Grade Parser data | Per-professor if available, else per-course |

### 5.3 Ranking Factors for Schedule Optimization

When evaluating and ranking possible schedules, weight these factors in this order:

1. **Grade distribution / avg GPA** (highest weight) — Objective, per-professor signal of both difficulty and grading philosophy.
2. **Time of day** — Directly affects attendance and energy. User can set preferences (e.g., "no classes before 10am").
3. **Schedule fit / conflict avoidance** — Hard constraint (no overlaps), soft constraint (avoid back-to-back in distant buildings).
4. **Instruction mode** — Face-to-face vs online preference.
5. **Professor quality proxy** — Grade distributions already capture this. Additional signal from professor name recognition (hardcoded preferences or user input).
6. **Section capacity / fill likelihood** — Relevant for registration strategy.

### 5.4 Claude's Role in V2

Claude analyzes the top 3-5 generated schedules and produces a natural-language comparison:
- "Schedule A gives you the best professors but has an 8am on Monday. Schedule B avoids early mornings but Prof X for ECE 411 has a 2.7 avg GPA vs Prof Y's 3.3."
- "You could take the easy section of RHE 306 to offset the difficulty of ECE 411 and PHY 303E."

This is the tradeoff analysis layer — the "upperclassman advice" that no existing tool provides.

---

## 6. Data Architecture

All data is stored as static JSON files in the project repo. No database for V1.

### 6.1 File Structure

```
/data
  /user-profile.json          # Hardcoded user: completed courses, preferences, goals
  /prerequisite-graph.json     # Directed graph of all ECE + Math courses
  /degree-requirements.json    # ECE core, gen ed, free elective rules & constraints
  /tech-cores.json             # All 9 tech core tracks with required courses
  /math-requirements.json      # Math BA / Applied Math Cert / Jefferson Scholars reqs
  /grade-distributions.json    # Per-course, per-professor avg GPA data
  /course-catalog.json         # All course metadata (title, credits, description, offering pattern)
  /fall-2026-sections.json     # (V2) Specific sections offered next semester
```

### 6.2 Prerequisite Graph Schema

```json
{
  "nodes": {
    "ECE 302": {
      "title": "Introduction to Electrical Engineering",
      "credits": 3,
      "category": "ece_core",
      "offered": ["fall", "spring"],
      "flags": []
    }
  },
  "edges": [
    {
      "from": "M 408C",
      "to": "ECE 302",
      "type": "prerequisite",
      "min_grade": "C-"
    },
    {
      "from": "M 408C",
      "to": "ECE 406",
      "type": "corequisite",
      "min_grade": "C-"
    }
  ]
}
```

Note: The flowchart uses the 2026-2028 catalog numbers. ECE 302 is now ECE 402, ECE 306 is now ECE 406, ECE 319K is now ECE 419K. The JSON should use the current catalog numbers.

### 6.3 Degree Requirements Schema

```json
{
  "ece_core": {
    "courses": ["ECE 402", "ECE 406", "ECE 419K", "ECE 411", "ECE 412", "ECE 313", "ECE 333T", "ECE 351K", "ECE 364D", "ECE 464K"],
    "notes": "All required. ECE 333T and ECE 364D count toward Core 010."
  },
  "core_curriculum": {
    "slots": [
      {"id": "ugs", "label": "First-Year Signature Course", "options": ["UGS 302", "UGS 303"]},
      {"id": "rhe", "label": "Rhetoric & Writing", "options": ["RHE 306"], "ap_eligible": true},
      {"id": "vapa", "label": "Visual & Performing Arts", "options": ["list_of_approved"], "ap_eligible": true},
      {"id": "sbs", "label": "Social & Behavioral Sciences", "options": ["list_of_approved"], "ap_eligible": true},
      {"id": "gov1", "label": "American Government I", "options": ["GOV 310L"], "ap_eligible": true},
      {"id": "gov2", "label": "American Government II", "options": ["GOV 312L", "GOV 312P"]},
      {"id": "his1", "label": "US History I", "options": ["HIS 315K", "HIS 315L"], "ap_eligible": true},
      {"id": "his2", "label": "US History II", "options": ["HIS 315K", "HIS 315L"], "ap_eligible": true},
      {"id": "humanities", "label": "Humanities", "options": ["E 316L", "E 316M", "E 316N", "E 316P"], "prereq": "RHE 306", "ap_eligible": true}
    ]
  },
  "tech_core": {
    "track": "computer_architecture",
    "required_math": "M 325K",
    "required_courses": ["ECE 316", "ECE 460N"],
    "required_lab": null,
    "elective_count": 3,
    "elective_pool": ["list from tech core packet"],
    "notes": "4 required courses + 3 tech electives + advanced tech component lab from any area"
  },
  "advanced_tech_elective": {
    "count": 1,
    "description": "1 additional upper-division ECE course from any tech area",
    "notes": "ECE 316 may count if not part of declared tech core. 2 semesters of ECE Co-op or 1 semester ECE 125S may substitute."
  },
  "free_electives": {
    "total_hours": 11,
    "constraints": [
      "At least 3 hours must be approved advanced math or basic science",
      "No more than 3 hours of lower division credit",
      "AP credits never accepted",
      "No more than 3 hours of transfer credit"
    ],
    "approved_list_url": "bit.ly/UTECE-FE"
  },
  "math_sequence": ["M 408C", "M 408D", "M 427J", "M 340L"],
  "physics_sequence": ["PHY 303K", "PHY 105M", "PHY 303E"],
  "total_credit_hours": 128
}
```

### 6.4 Tech Core Tracks (All 9)

Extracted from the uploaded flowchart page 2:

| Track | Required Math | Required ECE Courses | Lab | Tech Electives |
|---|---|---|---|---|
| Computer Architecture & Embedded Systems | M 325K | ECE 316, ECE 460N | — | 3 |
| Software Engineering & Design | M 325K | ECE 422C, ECE 360C, ECE 461L (lab) | ECE 461L | 2 |
| Data Science & Information Processing | M 325K | ECE 461P, ECE 360C, ECE 316 or ECE 445S or ECE 471C | — | 2 |
| Electrical Engineering | M 427L | ECE 351M or ECE 325, ECE 362K or ECE 371Q or ECE 360K, ECE 445S (lab) or ECE 471C (lab) | yes | 4 |
| Communications, Signal Processing, Networks & Systems | M 427L | ECE 325, ECE 339, ECE 438 (lab), ECE 316 | — | 3 |
| Electronics & Integrated Circuits | M 427L | ECE 325, ECE 368L or ECE 369, ECE 462L (lab), ECE 362K | — | 3 |
| Energy Systems & Renewable Energy | M 427L | ECE 325, ECE 339, ECE 438 (lab) or ECE 462L (lab) or ECE 368L/468L (lab), ECE 325K or ECE 363M | — | 3 |
| Fields, Waves & Electromagnetic Systems | M 427L | ECE 325, ECE 339, ECE 440 (lab) | — | 4 |
| Nanotechnology & Nanoelectronics | M 427L | ECE 325, ECE 339, ECE 445L (lab), ECE 351M, ECE 460J (lab), ECE 360C | — | 3 |

Note: Switching between an M 325K track (Comp Arch, SWE, Data Science) and an M 427L track (all others) has a meaningful prereq impact. M 325K is discrete math (already taken or in progress). M 427L is advanced engineering math that requires M 427J.

### 6.5 Grade Distribution Data

Source: **UT official grade distributions** published at `reports.utexas.edu/spotlight-data/ut-course-grade-distributions`.

Tooling: Use `UT_Grade_Parser` (github.com/doprz/UT_Grade_Parser), an open-source Rust tool that downloads, parses, and stores UT grade data into SQLite. Run once, export relevant courses to JSON.

Schema per entry:
```json
{
  "course": "ECE 411",
  "professor": "SHANKAR, SHYAM",
  "semester": "Fall 2025",
  "avg_gpa": 3.12,
  "a_pct": 32.5,
  "b_pct": 38.1,
  "c_pct": 18.2,
  "d_pct": 6.1,
  "f_pct": 5.1,
  "enrollment": 148
}
```

Aggregate per professor across semesters for the primary signal. Per-semester data available on hover/detail view.

### 6.6 Data for Math Double Major / Certificates

Encode separately in `math-requirements.json`. Structure:

```json
{
  "math_ba": {
    "required_courses": ["M 408C", "M 408D", "M 325K", "M 340L", "M 427J", "..."],
    "upper_division_hours": 24,
    "overlap_with_ece": ["M 408C", "M 408D", "M 340L", "M 427J"],
    "additional_courses_needed": ["..."]
  },
  "applied_math_cert": {
    "required_courses": ["..."],
    "overlap_with_ece": ["..."],
    "additional_courses_needed": ["..."]
  },
  "jefferson_scholars": {
    "required_courses": ["..."],
    "overlap_with_ece": ["..."],
    "additional_courses_needed": ["..."]
  }
}
```

Source for these requirements: `catalog.utexas.edu/undergraduate/natural-sciences/` and department-specific pages. These need to be manually researched and encoded.

---

## 7. Data Pipeline

### 7.1 How Each Data Source Gets Structured

| Data | Source | Method | Verification |
|---|---|---|---|
| ECE prerequisite graph | Uploaded 2026-2028 flowchart PDF + catalog.utexas.edu | Feed PDF to coding agent, output structured JSON | **Hand-verify every edge** against catalog. Errors here break the entire tool. |
| ECE degree requirements | Flowchart PDF + ece.utexas.edu academic policies | Feed to coding agent | Hand-verify |
| Tech core tracks (all 9) | Flowchart page 2 + tech core packet PDF | Feed to coding agent | Hand-verify |
| Grade distributions | reports.utexas.edu (official, public) | Run UT_Grade_Parser → SQLite → export to JSON | Spot-check a few courses against the website |
| Course catalog metadata | catalog.utexas.edu/general-information/coursesatoz/ece/ | Feed to coding agent | Spot-check |
| Course schedule (V2) | utdirect.utexas.edu course schedule pages (pre-scraped as PDF) | Save pages as PDF, feed to coding agent | Hand-verify a few sections |
| Math major/cert reqs | catalog.utexas.edu math department pages | Manual research + coding agent | Hand-verify |
| User profile/transcript | User's own knowledge | Hardcode manually | N/A |

### 7.2 "Building Agent" Workflow

The term "building agent" refers to using Claude (via Claude Code CLI or Copilot) during development to:
1. Ingest a PDF or raw text corpus (e.g., the flowchart, catalog pages)
2. Output structured JSON matching the schemas defined above
3. The developer then hand-verifies the output before committing it to the project

This is a development-time process, not a runtime process. The structured JSON files are static assets in the repo.

---

## 8. Architecture Decisions

### 8.1 Constraint Solver: Code, Not LLM

The recommendation engine and prerequisite validator are deterministic code. Claude is NOT used for plan generation or constraint checking. Reasons:
- Prerequisite chains are a directed acyclic graph — topological sort is O(V+E) and 100% correct
- LLMs occasionally hallucinate edges, skip constraints, or produce invalid orderings
- API latency and cost are unnecessary for a deterministic problem
- "As deterministic as possible, as few API calls as possible" — user's stated preference

### 8.2 Claude's Role: Explanation and Tradeoff Analysis Only

Claude is used in two places:
1. **Chat panel (V1):** Answer natural-language questions about the plan. System prompt includes full plan state + prereq graph + profile. Claude explains tradeoffs, not generates plans.
2. **Schedule comparison (V2):** Given 3-5 candidate schedules, Claude produces a natural-language comparison highlighting tradeoffs (professor quality vs time preference vs difficulty balance).

### 8.3 Grade Distributions as Primary Quality Signal (Not RMP)

RateMyProfessor data is:
- Polarized (only very good or very bad experiences get reviewed)
- Legally and technically risky to scrape
- Subjective and inconsistent

Grade distributions from UT's official data are:
- Objective and complete
- Publicly available with no scraping needed
- Per-professor and per-semester
- Already a strong proxy for both difficulty and teaching quality

RMP, CIS surveys, and past syllabi are surfaced as **external links** for the user to manually verify recommendations. No data is ingested from these sources.

### 8.4 Data Storage: Static JSON Files

No database for V1. All data lives as JSON files in the project repo. Plan state is saved to `localStorage` in the browser. This eliminates all backend/database complexity.

If scaling to a product later: migrate plan state to Supabase, keep course data as static JSON (it changes once per catalog cycle — every 2 years).

### 8.5 Frontend-Only for V1

The Claude API key is stored in a `.env` file and called directly from the frontend. This is acceptable for a localhost-only personal tool. For a deployed product, API calls would route through a backend proxy.

---

## 9. Key Interactions & Edge Cases

### 9.1 Pinning Courses

The user can click a "pin" icon on any course card in the timeline to lock it in place. When "Recommend 4-Year Plan" is clicked, pinned courses are treated as fixed constraints — the solver fills around them. Use case: "I definitely want ECE 460N in Fall 3 because Prof X teaches it then."

### 9.2 Switching Tech Core Tracks

When the user changes their tech core selection:
1. Courses from the old track that are NOT shared with the new track are flagged (yellow highlight, "this course no longer counts toward your tech core").
2. New required courses for the new track appear in the palette.
3. The required math may change (M 325K → M 427L or vice versa), which has upstream prereq implications.
4. Progress bars update to reflect the new requirements.
5. A diff summary is shown: "Switching from Comp Arch to SWE adds ECE 422C, ECE 360C, ECE 461L. ECE 460N is no longer required but can count as your advanced tech elective."

### 9.3 Adding Math Minor / Double Major / Certificate

Toggling these on adds new requirements to the degree plan without removing existing ones. The system computes:
- **Overlap:** Which courses already in the plan satisfy the new requirements
- **Additional courses needed:** What must be added
- **Credit hour impact:** Does total credit hours increase? Does it push graduation timeline?
- **Prerequisite cascading:** Do the new courses have prereqs not yet in the plan?

### 9.4 Course Offering Patterns

Some courses are only offered in fall, only in spring, or in both. This is encoded in `course-catalog.json`. The constraint solver must respect this — it cannot place a fall-only course in a spring semester. The UI should indicate offering pattern on each course card.

### 9.5 Summer Semesters

Summer semesters are available as optional columns in the timeline. They default to empty/hidden but can be expanded. Summer offerings are typically more limited — the solver should deprioritize summer placement unless the user's plan requires it to graduate on time.

---

## 10. V2-Specific Details (Next-Semester Planner)

### 10.1 Input

The courses selected for the upcoming semester from V1 (e.g., 5 courses for Fall 2026). The user can also manually add or remove courses from this list.

### 10.2 Schedule Generation

The system generates all valid (conflict-free) combinations of sections for the selected courses, then ranks them by the weighted factor model (Section 5.3 of this doc).

### 10.3 Output

Top 3-5 candidate schedules displayed as weekly calendar views (Monday-Friday grid, time on Y-axis). Each schedule shows:
- All sections with professor, time, location
- A composite score based on the ranking factors
- Per-course grade distribution for the assigned professor

The user selects a schedule and can copy the unique numbers for registration.

### 10.4 Nudge to Verify

After selecting a schedule, the app surfaces links: "Before you register, verify these choices:" with direct links to RMP pages, CIS surveys, and past syllabi for each professor in the selected schedule.

---

## 11. Data Sources Reference

| Source | URL | Auth Required | Data Available |
|---|---|---|---|
| UT Grade Distributions (official) | reports.utexas.edu/spotlight-data/ut-course-grade-distributions | No | Grade distributions by course, professor, semester |
| UT_Grade_Parser (open source tool) | github.com/doprz/UT_Grade_Parser | No | Automates downloading + parsing → SQLite |
| UT Course Catalog | catalog.utexas.edu/general-information/coursesatoz/ece/ | No | Course descriptions, prereqs, credit hours |
| ECE Degree Flowchart (2026-2028) | Uploaded to project (2628_Flowchart.pdf) | N/A | Degree plan, prereq/coreq chains, tech cores |
| ECE Tech Core Packet | bit.ly/UTECE-techcores | No | Detailed tech core requirements and elective lists |
| ECE Free Electives List | bit.ly/UTECE-FE | No | Approved free elective courses |
| UT Course Schedule (per semester) | utdirect.utexas.edu/apps/registrar/course_schedule/ | No (public search) | Sections, times, professors, rooms, unique numbers |
| UTGradesPlus | utgradesplus.com | No | Grade distribution viewer (alternative to official data) |
| RateMyProfessor | ratemyprofessors.com/search/professors/1255 | No | Professor reviews (external link only, not ingested) |
| Past Syllabi / CVs | utdirect.utexas.edu/apps/student/coursedocs/nlogon/ | UT Auth | Past syllabi (external link only) |
| CIS Instructor Surveys | UT internal | UT Auth | Teaching evaluations (external link only) |
| UT Core Curriculum List | bit.ly/UTCoreList | No | Approved core curriculum courses |
| BS ECE Degree Requirements | catalog.utexas.edu/undergraduate/engineering/degrees-and-programs/bs-electrical-engineering/ | No | Official degree requirements |

---

## 12. Future Product Considerations (Not for V1)

These are parked for if/when this becomes a multi-user product:

- **Questionnaire flow** for generating user profiles (instead of hardcoding)
- **Multi-major support** — encode degree requirements for all UT majors (would require automation, not manual encoding)
- **UT auth integration** for pulling transcript data directly from IDA
- **Real-time course schedule data** instead of pre-scraped PDFs
- **Collaborative features** — share plans with friends, compare schedules
- **Mobile support**
- **Chrome extension** that overlays DegreeForge data onto UT's course schedule pages (complementary to UTRP, not competitive)
- **"Career aligner"** — mapping courses to job description skill requirements
- **Open source release** for other UT students to self-host

---

## 13. Positioning (If Productized)

**One-line pitch:** "The upperclassman advice you never had access to, encoded into software."

**What DegreeForge is NOT:**
- Not a replacement for IDA (it doesn't certify graduation)
- Not a replacement for UTRP (it doesn't operate during registration on UT's pages)
- Not a replacement for an academic advisor (it doesn't handle exceptions, petitions, or policy edge cases)

**What DegreeForge IS:**
- An opinionated, personalized, data-driven course planner that helps you make the *strategic* decisions advisors won't make for you
- A visual interface for understanding how every course choice affects your entire remaining degree path
- A tool that combines information currently scattered across 6+ websites into one interactive view

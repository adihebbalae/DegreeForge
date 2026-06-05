# DegreeForge — Strategic Critique
**Date**: 2026-05-23
**Author**: Claude (after the Critic-fix sprint)
**Audience**: Adi (sole user, builder, and primary customer)
**Status**: Opinion piece, not a roadmap. Push back where you disagree.

---

## 0. What this document is

You asked four things: new features, better web design, performance efficiency,
and a *whole-app* critique covering what it solves, who it's for, where the
friction is, and how to make it unreasonably hospitable.

I'm writing it as a single document so the four threads stay coherent — the
features that matter depend on who the customer is, who the customer is
depends on what the app actually solves, and unreasonable hospitality is
worthless without first being honest about the friction.

If this reads like flattery, I've failed. If it reads like a slap, I've
overcorrected. The goal is the middle.

---

## 1. What does the app actually solve?

The PRD says the app solves "the gap between a static degree audit and the
real cognitive work of building a 4-year plan." That's the engineering answer.

The honest, customer-facing answer is sharper:

> **DegreeForge solves the problem that no single human is paid enough at
> UT to think about *your specific situation* for more than 30 minutes a
> semester.**

That's the entire wedge. Every feature should be measured against it.

The official tools (IDA 2.0, UT Registration Plus, Coursicle) solve
*subcomponents* of this — "what have I taken," "which professors are easy,"
"is there a time conflict?" — but they all bottom out at the same place:
they hand you raw data and walk away. **The cognitive integration step is
left to the student.**

The student's current workaround is:
1. Open IDA 2.0 → list remaining requirements
2. Open the course catalog → find courses that fit
3. Open UTGradesPlus → check GPA distributions
4. Open RateMyProfessors → check professor reputation
5. Open the section search → check conflicts and unique numbers
6. Maintain a Google Sheet to track the plan across semesters
7. Re-do steps 1–6 every time anything changes (tech core switch, failed
   class, new prereq announced, internship offer)

DegreeForge collapses steps 1–6 into one canvas and makes step 7 nearly free.
**That's the value.** Everything else is decoration.

### What it does NOT solve (be honest)

- **It doesn't replace advising.** An advisor can sign off on degree
  exceptions, write recommendation letters, and notice if you're struggling
  in a way no software can. DegreeForge is a planning tool, not an advisor
  replacement. Marketing it as one would be a lie that immediately collapses
  the first time a student needs a course substitution.
- **It doesn't know the rumor layer.** "This professor is on sabbatical
  next year." "ECE 411 will be restructured in 2027." "The new department
  chair hates pass/fail." These come from the upperclassman grapevine, not
  any data source DegreeForge currently ingests.
- **It doesn't optimize for joy.** Today the scoring is GPA + scheduling
  fit. Nothing in the model captures "I'd rather take the hard professor
  because I'll learn more" or "I want to take the one weird elective
  everyone says is life-changing." A purely optimizing tool can talk a
  student out of the best course of their undergrad.

These three gaps are not bugs — they're scope choices. But they should be
named, not hidden, because they shape who the app is for.

---

## 2. Who is the primary customer? (Be specific.)

Not "UT ECE students." That's the addressable market, not the customer.

The actual customer is narrower:

> **The UT ECE undergrad who already maintains a planning spreadsheet.**

Three traits make them the buyer:
1. **They optimize.** Not "barely graduate" types. Honors students,
   double-majors, students with internship pressure, transfers who need to
   minimize delay.
2. **They re-plan.** They've already changed tech cores once, or are
   considering it, or got an internship offer that changes their summer
   plans, or are deciding between graduating early and adding a math major.
3. **They distrust the institution's defaults.** They know the audit tool's
   "recommended sequence" is conservative. They want to find the *better*
   plan, not the *safe* plan.

Everything in the app — pinning courses, what-if simulator, ghost
autocomplete, weight sliders on the scheduler, critical-path tooltip —
implicitly serves this user. The features make no sense for a student
who just wants to know "what do I take next semester?"

That is fine. **A sharp tool for a sharp user beats a soft tool for everyone.**
But it means:
- The onboarding wizard should explicitly *qualify* — "this tool assumes
  you're going to optimize your plan; if you just want a checklist, the
  audit tool is better."
- The feature roadmap should not chase casual users. Adding "easy mode" or
  "simple view" toggles will dilute the wedge.
- The marketing language (whenever this leaves localhost) should sound like
  it was written by an optimization-minded student, not the registrar.

### Secondary customers (eventually, not now)

- **Advisors who want to use it WITH a student.** Right now an advisor
  meeting is one-sided ("here's your plan, sign off"). A shared canvas
  changes the meeting dynamic — but this requires multi-user, persistence,
  and trust the advisor doesn't have today.
- **Incoming first-years choosing UT.** No current tool helps a high
  schooler visualize "what does ECE at UT actually look like?" This is a
  marketing surface, not a planning one — different shape of product.
- **Other UT majors.** Currently DegreeForge is ECE-specific (data,
  requirements, prereq graph). Generalizing is real engineering work —
  every major has weird substitution rules. Defer until ECE is *finished*.

---

## 3. The friction map — where current methods bleed time and joy

This is what an unreasonably hospitable tool should be measured against.

| When | What hurts today | DegreeForge today | The gap |
|---|---|---|---|
| **Initial plan** | 5 tabs + a spreadsheet + 4 hours | Auto-recommend 4-year plan button (TASK-018) | Strong, but assumes Adi's profile — onboarding (TASK-023) closes this |
| **Picking next-semester courses** | Scrolling through 60+ remaining courses, no clear "what's best" | Course palette + critical-path tooltip + GPA badges | Good — but the palette dumps the whole catalog by category, not "what should I be looking at" |
| **Avoiding prereq disasters** | Find out you forgot ECE 411 when registering in junior year | Live red/orange borders, downstream highlighting | Very strong. Already an unfair advantage |
| **Picking professors** | Open RMP and UTGradesPlus in two tabs, hold both in head | Per-instructor GPA in scheduler (TASK-028) | Good, but the *Planner* doesn't show per-prof data — only the Scheduler does |
| **What-if analysis** | Whiteboard, panic, give up | Tech core dropdown + math BA toggle + diff (TASK-011) | Good for the two pre-built scenarios, weak for anything outside that |
| **Conflict-free section picking** | 30-minute registration window panic-Tetris | Scheduler optimizer (TASK-015, 6-factor scoring TASK-021) | Very strong |
| **Re-planning after a semester** | Re-do everything from scratch | Advance-semester transition dialog | Decent. Could be a *celebration* moment instead of a chore |
| **Deciding between two valid plans** | Hold both in head, lose track | Snapshots + comparison UI (TASK-025 in-flight) | About to be strong |
| **Aligning plan to career** | "Should I take ML or VLSI?" answered by vibes | Career page in-flight (TASK-026) | Will be unique among UT tools |
| **The 11 PM existential question** | Text a friend, doomscroll, give up | Agentic chat (TASK-020 now wired) | Promising. Quality of the conversation depends on Ollama model + grounding |
| **Knowing if your plan is realistic** | No signal until you fail a class | Workload heatmap (TASK-024) | Strong if calibrated; currently uses (avg-GPA × credit-hours × course-level) which is a proxy, not workload |
| **Picking between two professors** | Manual GPA lookup, manual RMP, no aggregated view | Per-instructor data exists but isn't surfaced in scheduler card | Easy fix |

**Largest remaining frictions** (ranked by how much they bleed today):

1. **The 11 PM existential question.** The chat is now wired, but the
   quality of "should I switch tech cores?" depends entirely on how
   grounded the LLM responses are. This is the single highest-leverage
   improvement available.
2. **Picking professors during the Planner phase.** The Scheduler shows
   per-prof GPA. The Planner doesn't — even though the Planner is where
   you're choosing which courses to take *at all*. Easy fix.
3. **Plan-to-career alignment.** The career page is in-flight. This is
   the single biggest differentiator vs. every adjacent tool, and the
   skill→courses map will be the moat (once tuned with UT-official data).
4. **First-impression UX.** The app currently assumes Adi's profile.
   Onboarding (TASK-023) is the gate to anyone else ever using it.
5. **Visual density.** See section 5.

---

## 4. New features worth building (ranked by leverage)

I'm not going to repeat TASK-023/025/026/029/030 — those are already
scoped. Below are features beyond the current roadmap, ranked by the gap
above.

### 4.1. (HIGH) "Why this course?" inline reasoning on the palette
**Friction**: The palette dumps every remaining course. The student has
to guess which to look at first.
**Fix**: For every palette card, the agent precomputes a one-line "why
this is worth your time" rationale — combining prereq-unlock count,
GPA, and a career-aligned skill tag. Cached. Cost: ~one Ollama call per
remaining course at session start, ~60 courses, batched, ~30 seconds of
upfront latency that can be backgrounded.
**Build effort**: M.

### 4.2. (HIGH) "Best section for this slot" inline on the Planner
**Friction**: You pick a course in the Planner, then go to the Scheduler
to discover that the only Fall '27 section is taught by a 2.1-GPA prof
at 8 AM. By that point you've committed.
**Fix**: When you drag a course into a future semester, the card shows a
small footer: "Best section: [Prof] at [Time], avg 3.4." Pulls from the
fall-2026.json equivalent for that term. If the term file doesn't exist
yet, surface "Section data not available for this term."
**Build effort**: S — data and scoring already exist.

### 4.3. (HIGH) Plan-to-career as a *continuous* signal, not a one-shot
**Friction**: You paste a JD on the career page once. After that the
planner forgets.
**Fix**: Save the extracted skills + the JD title into a "career intents"
list in settings. The Planner palette adds a faint "→ ML" or "→ Embedded"
chip on courses that contribute to the saved intents. The chat agent's
system prompt includes the active intents so it can naturally weave them
into recommendations. The Scheduler's `scoreProfessor` could even be
augmented with a "this prof's research aligns" tag.
**Build effort**: M — the data structure is small, but it touches every
surface.

### 4.4. (HIGH) "Realistic load" calibration from the user's own history
**Friction**: The workload heatmap uses (avg-GPA × credit-hours ×
course-level) — a proxy. It doesn't know that Adi specifically can
handle 18 hours of ECE upper-div but melts at 15 hours of math.
**Fix**: After every completed semester, ask the user one question:
"Last semester was [X] hours and you rated it [emoji]. How would you
describe it: too light / right / too heavy?" Save the rating. The
heatmap is then re-bucketed against the user's own historical
load-tolerance instead of a generic formula.
**Build effort**: S — one new state field, one transition-dialog
question, one heatmap calibration constant.

### 4.5. (MED) "Show me a plan where I graduate a semester early"
**Friction**: Optional but transformative. Currently the auto-planner
respects load tolerance and tries to fit 8 semesters. There's no easy
"squeeze it" mode.
**Fix**: Auto-planner gets a `target_semesters: number` input. The UI
gets a "Graduate early?" toggle that runs the planner with 7 semesters
and shows the resulting load distribution. If infeasible, surface
*why* ("can't fit ECE 411 + ECE 460N + senior design in 7 semesters
because…").
**Build effort**: S–M.

### 4.6. (MED) Internship semester support
**Friction**: ECE students get summer internships. Some take fall co-ops
and miss a semester. The current 8-semester grid has no concept of "I'm
not enrolled in Spring '27."
**Fix**: Each semester gets a status: enrolled / co-op / leave / summer.
If marked non-enrolled, the planner shifts downstream courses without
breaking prereq chains.
**Build effort**: M.

### 4.7. (MED) Course-load *quality* tags, not just difficulty
**Friction**: The heat stripe says "this semester is red." It doesn't
say *why* — is it red because it's hard, because it's all theory,
because it has no labs, because three of the courses are taught by
notoriously slow graders?
**Fix**: The semester column tooltip gets a small "vibe" line:
"Heavy on theory, light on labs, 2 hard graders" — derived
deterministically from grade dist + section data + instructor history.
**Build effort**: S.

### 4.8. (MED) The "what changed since last week" digest
**Friction**: Students return to their plan periodically. Nothing tells
them what's different.
**Fix**: On app load, if the last session was >7 days ago, show a small
banner: "Welcome back. Since you last visited: [Fall '26 section data
updated / 3 new sections opened for ECE 411 / your transcript shows a
new grade entered / the auto-planner suggests one rearrangement based
on new data]." Most of these will be empty in a single-user app, but
the *first* one — section data updates — will matter once the data
pipeline runs nightly.
**Build effort**: M.

### 4.9. (LOW) Export to .ics / Google Calendar
**Friction**: Adi picks a schedule. Now Adi has to manually re-enter
6 sections into their calendar.
**Fix**: One button. Generates .ics with TZID=America/Chicago and the
section meeting patterns.
**Build effort**: S.

### 4.10. (LOW) Mobile-readable mode (NOT full mobile app)
**Friction**: At some point Adi is in a meeting and wants to glance at
the plan from their phone.
**Fix**: A read-only mobile route that renders a vertical-stack version
of the timeline. No drag-drop, no scheduler — just visibility.
**Build effort**: S–M.

### 4.11. (DON'T BUILD) The five things I would refuse to build

- **A mascot.** Don't.
- **Gamification (badges, streaks, XP).** The progress bars are enough.
  Adi already has a real degree to chase; fake achievements compete with
  it.
- **A generic "tips" carousel on first run.** Onboarding wizard, yes;
  rotating tips banner, no.
- **An "Ask Claude to write your essay" button anywhere.** Scope creep.
- **A social feature** ("see what other ECE students are taking"). Tempting
  but the privacy and moderation cost dwarfs the benefit; also UT students
  don't want their peers seeing their plan.

---

## 5. Web design / UX critique

I looked at the planner.png screenshot baseline. Honest reactions:

### What's working
- **The card colors are doing real work.** The category color isn't
  decoration; it's the primary scanning signal. Keep this.
- **The NOW badge on Sp '26 is exactly right** — small, distinct, no
  separate "today" line.
- **The Recommend 4-Year Plan button is prominent without screaming.**
- **The validation banner ("2 prerequisite issues") is the right tone.**

### What's not working

- **The five progress bars are visual debt.** They take vertical real
  estate, they all look the same shape, and the eye has to read each one
  separately. TASK-029 already plans to collapse to one segmented bar.
  Do this *first*, not last.
- **The palette dumps every remaining course in one scroll.** No sense of
  priority. "ECE Core (6 remaining)" — but which one matters most? The
  agent's "why this course" inline rationale (feature 4.1) would fix this.
- **The FABs are gone now, lifted into the header.** That's good. But the
  header is now busy — 9 icons + nav + dark mode + Advance Semester. Group
  them visually: nav | plan actions | history | file | session.
- **Empty future semesters say "Drop course here" in dashed boxes.** The
  empty state is honest but cold. An unreasonably hospitable empty state
  would say something different: "Fall '26 is open. Want me to suggest a
  starting point?" with an inline "Suggest" button that triggers the
  ghost-card hook. (See section 7.)
- **The Scheduler empty state ("Select a schedule option to view the
  calendar") is genuinely lifeless.** Replace with a one-line agent
  suggestion: "You have 4 courses planned for Fall '26. Want me to
  generate the top 3 conflict-free combinations?" + a Generate button.
- **No course card shows the professor.** This is the single biggest
  visual omission. Even before any scoring, the *name* of the professor is
  what students care about. Add a small line below the title on the
  palette + timeline cards: "Likely: Prof Lastname (3.4)." Pulled from
  the most-recent-term sections data.
- **No semester subtotals.** The semester column shows "12 / 18 hrs" —
  but not "of which 6 ECE, 3 Gen Ed." Hover tooltip could surface this.
- **Dark mode is supported.** Good. But the screenshot I'm seeing is the
  light mode default; ensure light-mode contrast hits AA on small text
  (the gray "0 / 18 hrs" subhead may be close to fail).

### What I'd build differently from scratch (knowing what you know now)

- **One adaptive column instead of palette + timeline.** Today the layout
  is timeline-left (65%) + palette-right (35%). On smaller screens the
  palette eats too much. An alternative: timeline-full + a slide-in
  palette drawer that opens on demand. The drag-drop affordance still
  works; you just don't see the palette unless you ask.
- **The Schedule page deserves a hero, not an empty box.** Today the
  empty state takes 80% of the screen. Either default to showing
  "candidates for the next semester from your plan," or make the empty
  state into the workflow ("Step 1: pick your Fall 2026 courses below").

### Visual polish

- **Spacing is consistent but tight.** The card padding (especially in
  the palette) reads as efficient on a desktop but cramped on smaller
  screens. Bump by 4px.
- **Typography is fine.** No need to change.
- **Iconography is consistent (Lucide).** Don't mix in other icon sets.

---

## 6. Performance and DX

You didn't ask in detail, but a few things I'd flag.

### Runtime
- The auto-planner runs in <2ms per the acceptance criteria. Good.
  The `computeGraduationDelay` LRU is capped at 50; that's fine for one
  user but the cache key now includes pin hashes so churn could push
  past the cap in adversarial cases (Security flagged this — defer).
- **The big risk**: the Critic + Security re-pass noted that
  `history.jsonl` grows unbounded. Single-user localhost limits the
  blast radius today, but TASK-030 deployment must address this.
- **LLM calls** are the dominant cost source. Ollama is free locally;
  Claude is metered. The wide tool registry (15 tools, 6 default-enabled)
  is good for capability but means each agent turn could fire one tool
  call. Once deployed, add a per-session token cap (already in
  TASK-030's scope).

### DX
- **Test count is healthy.** 292/292 across 34 files. Per-tool tests in
  `lib/agent-tools/__tests__/` is a clean pattern.
- **The pre-commit privacy guard works.** Saw it run on every commit
  this sprint.
- **Playwright e2e + visual baselines** are set up but underused. Worth
  adding one e2e per major flow (drag-drop, chat tool acceptance,
  scheduler optimization) before TASK-029 visual overhaul, so the
  redesign can't silently break flows.
- **The `.agents/` workflow is heavy** (state.json + state.md +
  workspace-map + handoff + parallelization-protocol + critic-report +
  BDR templates). This works for a multi-engineer-swarm cycle but is
  overhead for a one-person + LLM-pair cycle. Worth a separate document
  on "when to skip the ceremony" — e.g. one-off bug fixes shouldn't
  require a plan file.

---

## 7. Unreasonable Hospitality — the part that matters

I held this for last because it's the only section that should reshape
how the app is built, not what it does.

### What it means to me

Will Guidara's frame: **hospitality is what you make people feel; service
is what you do for them.** A waiter who refills your water on schedule is
giving good service. A waiter who notices you've been picking at your
food and asks "is something not right?" is giving hospitality. The
former is operational. The latter is relational.

Unreasonable hospitality goes one further: doing things that aren't
economically rational because they create moments the guest will tell
their friends about. The hot dog story (Eleven Madison Park sending a
runner to get a NY hot dog for tourists who hadn't tried one) is the
canonical example.

**This does not translate directly to software.** Software can't make
eye contact, can't dispatch a runner, can't read a room. Anyone who
tells you "be unreasonably hospitable in software" by adding more
exclamation marks or a mascot has missed the point.

What *does* translate is the underlying disposition: **the app
anticipates, the app remembers, the app treats the user's time as
precious, the app speaks like a human who likes the user.**

### What it would mean for DegreeForge specifically

Five concrete shifts. None of these are roadmap features. They're
*how every existing and future feature should be built.*

#### 7.1. Errors become conversations
**Today**: "2 prerequisite issues in your plan."
**Hospitable**: "Hey — ECE 312H needs ECE 302 first, and you've got it
in Sp '26 already. Want me to swap the order, or is there a reason this
way?"

Notice what changed:
- "Hey" instead of nothing.
- Names the specific course, not "2 issues."
- Proposes a fix.
- Leaves room for "is there a reason this way?" — because sometimes
  there is.

This single shift applied across every error, validation, banner, and
toast in the app would be more transformative than any new feature.

#### 7.2. The app remembers, and uses what it remembers
**Today**: Settings stores `instructionModePref: in_person`.
**Hospitable**: When the Scheduler proposes a candidate, the "why this
schedule?" breakdown includes: "All in-person, like you told me you
prefer." When the chat agent recommends a course, it says: "I'm
recommending this because you said you wanted to lean into embedded
systems back in your career page entry from March."

The data is *already there*. The hospitable shift is *naming it* — saying
"because you told me X" turns a feature into a relationship.

#### 7.3. The app celebrates milestones the user didn't ask to be celebrated
**Today**: The progress bars fill incrementally. There's no moment of
"hey, you just locked in your last Gen Ed."
**Hospitable**: When a category bar hits 100% for the first time, show
a one-line toast: "That was your last Gen Ed. You're officially clear
on the core curriculum." Not a confetti animation. Not a badge. Just a
sentence that says "I noticed."

Other milestones to catch:
- First time all prereqs are valid (no red borders).
- Halfway point on credit hours.
- First semester where workload heatmap is green.
- The semester where ECE 411 lands (the gate course).
- The first time the Scheduler returns a candidate that scores above
  some threshold.

Adi will not need any of these. That's the point. The hospitable thing
is to notice when Adi *wouldn't have noticed.*

#### 7.4. The empty states become invitations
**Today**: A Fall '26 semester column with no courses shows "Drop course
here" in dashed boxes.
**Hospitable**: "Fall '26 is open. Looking at your plan, the obvious
next move is ECE 411 — it unlocks 6 downstream courses. Want me to
place it, or would you rather pick yourself?"

Same logic on the Scheduler empty state. Same logic on the Career page
empty state. The app should never just sit there waiting — if it has
something useful to say, it should say it.

#### 7.5. The "I noticed" moments
**Today**: The app reacts to user input.
**Hospitable**: The app proactively raises things it noticed. Examples:
- "You've been hovering over Fall '27 for a while. Anything I can help
  with?" (Hover detection > 20 seconds, no action.)
- "Heads up: ECE 411 is taught by [Prof] in Fall '26 (3.5 GPA) and by
  [Prof] in Spring '27 (2.8 GPA). Worth picking your semester
  carefully." (Triggered when the user adds ECE 411 to either
  semester.)
- "Your Fall '27 is showing red on the heatmap because ECE 460N + ECE
  445L is historically brutal together. Most students who took both at
  once said it was the hardest semester of their degree." (Triggered
  when the heatmap goes red.)
- "Registration for Fall 2026 opens [date]. Your current Scheduler pick
  has 6 unique numbers." (Triggered N days before registration window
  opens — needs term metadata.)
- "You're 3 credit hours short on Free Electives and Fall '27 has
  room. I noticed you starred GOV 312L on the catalog last week —
  want me to drop it in?" (Triggered after the gap is detectable.)

Each of these has a real cost — engineering effort, possibly LLM
tokens — but together they're the difference between an app and an
advisor.

### The Hospitality Charter (draft)

A one-page principles document. Every PR is reviewed against these:

1. **Every error proposes a fix.** "X is broken" is not enough. "X is
   broken — want me to do Y?" is the bar.
2. **Every recommendation cites a reason.** "Take ECE 411" → "Take ECE
   411 — it unlocks the most downstream courses."
3. **Every preference must be re-referenced.** If the user told the
   app something in settings, the app must mention it back when
   relevant. The app proves it remembers.
4. **The app catches one milestone per ~2 weeks the user wouldn't
   have caught.** Not gamification — recognition.
5. **No empty state may be empty.** If a screen has nothing to show,
   it proposes the next action.
6. **The voice is "warm advisor," not "registrar."** Test: would a
   sentence sound out of place if a friend who happened to be a
   senior in ECE said it to you over coffee?
7. **Anticipate before reacting.** If the app can know something
   useful before the user asks, it should surface it (gently, not
   pushily).

These are testable in code review. "Does this error propose a fix?"
is a yes-or-no question. "Does this empty state propose an action?"
is a yes-or-no question.

### What unreasonable hospitality is NOT, for this app

To be clear about anti-patterns:
- **Not a mascot.** No DegreeBot.
- **Not exclamation marks.** "You did it! 🎉" is *less* hospitable
  than "That was your last Gen Ed."
- **Not constant push notifications.** Hospitality is being there
  when needed, not interrupting.
- **Not a chatbot personality.** The chat agent should sound like a
  competent advisor, not a personality-driven companion.
- **Not gamification.** No badges, streaks, or XP.

The bar is high because the user is sophisticated. Trying-too-hard
hospitality reads as condescension. The right register is "calmly,
specifically attentive" — not "energetic and validating."

---

## 8. What I'd build next, in order

If I had to pick the smallest set of changes that compound:

1. **Add the professor name to the palette + timeline cards.** (S — half a
   day.) Single highest-density information win.
2. **Rewrite every error / banner / toast in the codebase to follow
   principle #1 of the Charter.** (S — one focused day.) Sets the voice
   for everything downstream.
3. **Replace the empty states (planner empty semester, scheduler
   pre-selection, career pre-paste) with proactive invitations.** (S–M.)
4. **Wire the celebration toasts for the 5 milestones in section 7.3.**
   (M — needs hooks into the reducer for "first time X became true.")
5. **Inline "best section for this slot" on Planner cards (feature 4.2).**
   (S.)
6. **Per-course "why this is worth your time" rationale on the palette
   (feature 4.1).** (M — batched Ollama calls, cached.)
7. **Settings: save career intents as a persistent signal across the app
   (feature 4.3).** (M.)
8. **Onboarding (TASK-023) — the gate to anyone else using the app.** (M.)

Build in this order because each step builds the voice + the relational
disposition before adding new surfaces.

---

## 9. The single sentence to carry forward

If I had to compress this whole document to one sentence for what should
guide the next sprint:

> **Stop building features that need to be discovered, and start building
> features that introduce themselves.**

That's the gap between a tool and an advisor. That's the unreasonable
hospitality move. Everything else — the new features, the redesign,
the performance work — is in service of that.

# Handoff: TASK-011 — What-If Simulator
**Task ID**: TASK-011
**Mode**: autonomous (no user interaction available)
**Agent**: engineer | **Model**: sonnet

## Context

DegreeForge is a single-user degree planner for UT Austin ECE. Previous tasks complete:
- TASK-004: `generatePlan(SolverInput): SolverOutput` in `src/lib/solver.ts`
- TASK-009: Progress bars (ProgressBars component, `computeProgress()` logic)
- App shell, timeline grid, palette, drag-drop, validation all working

**Adi's current settings** (from user-profile.json):
- Tech core: "Computer Architecture & Embedded Systems" (9 tech core tracks available)
- Math BA: considering (but not yet committed)

**Why this task matters**: Adi is exploring what happens if she switches tech cores or picks up the Math BA. This feature lets her see the impact before committing — how many more courses, how much longer to graduate.

## Task

Build the what-if simulator as a sidebar/panel within PlannerPage.

### State to add to PlanContext

```typescript
// Add to PlanState
whatIf: {
  techCore: string;         // Current: "Computer Architecture & Embedded Systems"
  mathBA: boolean;          // Current: false (or true if she committed)
  isActive: boolean;        // Is what-if mode active?
}
```

New actions:
```typescript
| { type: 'SET_TECH_CORE'; techCore: string }
| { type: 'TOGGLE_MATH_BA' }
| { type: 'APPLY_WHAT_IF' }   // Commits what-if to real plan
| { type: 'RESET_WHAT_IF' }   // Reverts
```

### What-if panel UI (`src/components/WhatIfPanel.tsx`)

```
┌─────────────────────────────────────────┐
│ ⚡ What-If Simulator                     │
│                                         │
│ Tech Core:                              │
│ [Computer Architecture & Embedded... ▼] │  ← select dropdown
│                                         │
│ Math BA Double Major:                   │
│ ○ OFF  ● CONSIDERING  ○ COMMITTED       │  ← radio or toggle
│                                         │
│ ──── Impact Preview ────                │
│ Courses added:  +5 (ECE 461P, ECE 462L...)│
│ Courses removed: -3 (ECE 460R, ...)     │
│ Credit hour change: +6 hrs              │
│ Graduation impact: +0 semesters         │
│                                         │
│ [Apply to Plan]  [Cancel]               │
└─────────────────────────────────────────┘
```

### Diff calculation (`src/lib/what-if.ts`)

```typescript
export interface WhatIfDiff {
  coursesAdded: string[];
  coursesRemoved: string[];
  creditHourDelta: number;
  semesterDelta: number;   // Estimated graduation delay (+/- semesters)
}

export function computeWhatIfDiff(
  current: { techCore: string; mathBA: boolean },
  proposed: { techCore: string; mathBA: boolean },
  degreeReqs: DegreeRequirements,
  techCores: TechCoreTrack[],
  mathReqs: MathRequirements,
  catalog: Course[],
  completedCourses: string[]
): WhatIfDiff
```

Logic:
1. Build current required set (tech core courses + Math BA if applicable)
2. Build proposed required set
3. Diff = proposed - current
4. Credit delta = sum of credit_hours for added courses - removed courses
5. Semester delta = rough estimate: creditDelta / 15 (round up to nearest 0.5 semester)

### Live preview

When user changes the dropdown or toggle, the Impact Preview updates immediately (no "Calculate" button needed). Use `useMemo` on the diff.

### Apply vs Cancel

**Apply to Plan**: Calls `generatePlan()` with new settings → merges result into `PlanContext`, replaces future semesters only (preserves completed + in-progress pinned courses). Shows a confirmation before replacing.

**Cancel**: Resets dropdowns to current saved state (`profile.tech_core`).

### Progress bar updates

When what-if is active (not yet applied), progress bars should show projected numbers with a visual indicator that this is a simulation:
- Add "(projected)" next to bar labels
- OR: show dual bars (current vs projected)

Keep it simple — a "(projected)" label suffix is fine.

## Acceptance Criteria
- [ ] Tech core dropdown shows all 9 tech core tracks from tech-cores.json
- [ ] Math BA toggle (3-state or simple on/off)
- [ ] Impact preview shows correct added/removed courses on change
- [ ] Credit hour delta and semester delta calculated correctly
- [ ] Progress bars update to reflect what-if state when active
- [ ] "Apply to Plan" calls solver and replaces future semesters
- [ ] "Cancel" reverts to original settings
- [ ] `tsc --noEmit` passes

## Validation Gates
- [ ] Switch from CA&ES to Biomedical Engineering → different courses appear in added/removed
- [ ] Toggle Math BA → math courses appear in diff
- [ ] Apply → timeline shows updated plan
- [ ] `cd packages/client && npx vitest run src/lib/what-if.test.ts` — pass if tests written
- [ ] `cd packages/client && npx tsc --noEmit` — no errors

## Files to Read First
- `packages/client/src/lib/solver.ts` — generatePlan API (TASK-004)
- `packages/client/src/lib/progress.ts` — computeProgress, extend for projected mode (TASK-009)
- `packages/client/src/context/PlanContext.tsx` — extend with whatIf state (TASK-006)
- `packages/client/public/data/tech-cores.json` — all 9 tech core tracks
- `packages/client/public/data/math-requirements.json` — Math BA courses

## Constraints
- What-if is a CLIENT-SIDE simulation only — no Claude calls
- Do NOT modify completed/in-progress semesters when applying
- Tech core and Math BA changes are the ONLY what-if axes (no other toggles)
- Commit when done: `git add -A && git commit -m "feat(TASK-011): what-if simulator (tech core switch, Math BA toggle, diff preview)"`

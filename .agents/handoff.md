# Handoff: TASK-009 — Progress Bars
**Task ID**: TASK-009
**Mode**: autonomous (no user interaction available)
**Agent**: engineer | **Model**: sonnet

## Context

DegreeForge is a single-user degree planner for UT Austin ECE student Adi. TASK-001-005 complete:
- Monorepo, data layer (DataContext with all 9 JSONs + TypeScript types), app shell (PlannerPage layout)
- TASK-006 also complete: PlanContext (plan state with useReducer) is available

The PlannerPage has a top area for progress bars that is currently a placeholder.

**Adi's BSECE requirements** (from degree-requirements.json):
- Total: 128+ credit hours
- ECE Core: specific required courses (approx 35-40 hours)
- Core Curriculum (Gen Ed): 8 courses / ~42 hours (some already completed via credit-by-exam)
- Tech Core: 8 specific courses from chosen track
- Free Electives: 11 credit hours of advanced ECE electives
- Plus Math requirements, physics, etc.

**Why this task matters**: Progress bars give Adi real-time feedback on how completed the degree is as they drag courses around. Every drop triggers a re-count.

## Task

Build `src/components/ProgressBars.tsx` — a responsive strip at the top of PlannerPage.

### Five progress bars

| Bar | Label | Target | What counts |
|-----|-------|--------|-------------|
| Total Hours | Credit Hours | 128 | Sum of credit_hours for all completed + placed courses |
| ECE Core | ECE Core | varies | Completed required ECE core courses (not tech core) |
| Core Curriculum | Gen Ed | 8 courses | Completed core curriculum requirements (RHE, GOV, UGS, etc.) |
| Tech Core | Tech Core | 8 courses | Courses from selected tech core track that are completed/placed |
| Free Electives | Electives | 11 hrs | Advanced ECE electives in plan |

### Visual design

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Credit Hours      [████████████████░░░░░░░░░] 87 / 128 hrs    68%         │
│  ECE Core          [██████████████████████░░░░] 11 / 14 courses 79%        │
│  Gen Ed            [████████████░░░░░░░░░░░░░░] 4 / 8 courses  50%        │
│  Tech Core (CA&ES) [████████░░░░░░░░░░░░░░░░░░] 2 / 8 courses  25%        │
│  Electives         [░░░░░░░░░░░░░░░░░░░░░░░░░░] 0 / 11 hrs     0%         │
└─────────────────────────────────────────────────────────────────────────────┘
```

Use shadcn `Progress` component. Each bar has:
- Icon + label on the left
- shadcn Progress bar in the center (filled portion)
- Count text on the right (e.g., "87 / 128 hrs" or "4 / 8 courses")

Color coding:
- 0-49%: red (`[&>*]:bg-red-500`)
- 50-79%: yellow (`[&>*]:bg-yellow-500`)
- 80-99%: blue (`[&>*]:bg-blue-500`)
- 100%: green (`[&>*]:bg-green-500`)

### Counting logic

```typescript
function computeProgress(
  plan: Plan,
  profile: UserProfile,
  catalog: Course[],
  degreeReqs: DegreeRequirements,
  techCore: TechCoreTrack
): ProgressSummary {
  const allPlacedOrCompleted = [
    ...profile.completed_courses.map(c => c.course_id),
    ...profile.in_progress_courses,
    ...Object.values(plan).flat()
  ];
  // deduplicate
  const unique = [...new Set(allPlacedOrCompleted)];
  
  return {
    totalHours: sum of credit_hours for courses in unique that are in catalog,
    eceCoreCompleted: count of degreeReqs.ece_core that are in unique,
    eceCoreTotal: degreeReqs.ece_core.length,
    genEdCompleted: count of degreeReqs.core_curriculum that are in unique,
    genEdTotal: 8,
    techCoreCompleted: count of techCore.courses that are in unique,
    techCoreTotal: techCore.courses.length,
    electiveHours: ...,
    electiveTotalHours: 11,
  };
}
```

Place this logic in `src/lib/progress.ts` with unit tests.

### Reactive updates

`ProgressBars` subscribes to `PlanContext`. Every ADD/REMOVE/MOVE action recalculates progress.

### `src/lib/progress.test.ts`

```typescript
describe('computeProgress', () => {
  it('counts Adi profile completed courses correctly')
  it('adds placed courses to totals')
  it('does not double-count completed + placed courses')
  it('tech core counts only from selected track')
})
```

## Acceptance Criteria
- [ ] 5 progress bars visible at top of PlannerPage
- [ ] Correct initial values from Adi's transcript (completed courses count toward progress)
- [ ] Values update reactively when courses are added/removed from plan
- [ ] Color changes with percentage (red/yellow/blue/green)
- [ ] `progress.ts` unit tests pass
- [ ] `tsc --noEmit` passes

## Validation Gates
- [ ] `cd packages/client && npx vitest run src/lib/progress.test.ts` — all pass
- [ ] `cd packages/client && npx tsc --noEmit` — no errors
- [ ] Visual: bars show reasonable values for Adi's current state

## Files to Read First
- `packages/client/src/context/PlanContext.tsx` — plan state from TASK-006
- `packages/client/public/data/degree-requirements.json` — requirement lists
- `packages/client/public/data/tech-cores.json` — CA&ES course list
- `packages/client/public/data/user-profile.json` — completed courses
- `packages/client/public/data/course-catalog.json` — credit hours per course

## Constraints
- Do NOT calculate prereq violations here — that's TASK-010
- Keep `progress.ts` pure (no React) — the component just calls it
- Commit when done: `git add -A && git commit -m "feat(TASK-009): progress bars (credit hours, ECE core, gen ed, tech core, electives)"`

# Handoff: TASK-017 — Integration Testing + Visual Polish
**Task ID**: TASK-017
**Mode**: autonomous (no user interaction available)
**Agent**: engineer | **Model**: sonnet

## Context

DegreeForge is a single-user degree planner for UT Austin ECE. ALL previous tasks (TASK-001 through TASK-016) are complete. The full app is built:
- V1 Planner: timeline grid, course palette, progress bars, drag-drop, prereq validation, what-if, chat panel, course detail popovers, external links, localStorage persistence
- V2 Scheduler: schedule optimizer engine, weekly calendar view, copy unique numbers

This is the final task — integration testing and visual polish pass.

**Why this task matters**: Individual features may work in isolation but have subtle integration bugs. The polish pass ensures the app looks and feels coherent, not like a collection of disconnected components.

## Task

### 1. Integration test suite (`src/__tests__/integration.test.tsx`)

Use `@testing-library/react` with `vitest`. Test the full user flows:

```typescript
describe('Full planner flow', () => {
  it('loads Adi profile data on startup')
  it('displays completed courses in Fall 2025 and Spring 2026')
  it('dragging a course from palette to empty semester updates progress bars')
  it('adding a course with unmet prereqs shows red border')
  it('what-if: switching tech core updates palette contents')
  it('export plan → clear → import plan → plan is restored')
  it('V2: selecting courses and optimizing returns conflict-free schedules')
})
```

These are integration tests that mount the full component tree (with DataContext.Provider and PlanContext.Provider). Use mock data for JSON files to avoid network requests in tests.

### 2. Bug hunt — check these known edge cases

Run through these manually and fix any issues found:

| Edge Case | What to check |
|-----------|--------------|
| ECE courses under "E E" prefix in grade data | Normalization is working — no "E E" visible in UI |
| Placing a course that's already completed | Should not appear in palette; can't be placed in future semesters |
| Moving a course away that has dependents | Downstream courses should get validation errors |
| Tech core courses appear in both tech core section AND free electives | Should only appear in one category |
| Progress bar total hours: credit-by-exam courses (CR grade) | CR courses should still count toward hours |
| Dragging to a past semester | Should be prevented or ignored (past semesters are locked) |
| Empty plan state (all courses removed) | No crash, shows empty semesters with drop zones |
| Very long course title truncation | Cards should truncate with ellipsis, title in tooltip |

### 3. Visual consistency pass

Walk through each component and apply these fixes if needed:

**Typography**:
- Page headings: `text-xl font-semibold` (not `text-2xl bold` — too big)
- Card labels: `text-sm` for secondary info
- Consistent spacing: use `gap-2`, `gap-4`, `p-3`, `p-4` — no random values

**Course cards**:
- All cards same height (use `min-h-[72px]`)
- Titles truncate consistently with `truncate` class
- GPA badge always right-aligned

**Color consistency**:
- Category colors must match between timeline cards and palette cards
- Badge GPA colors consistent (green/yellow/orange/red thresholds same everywhere)

**Dark mode**:
- All backgrounds flip correctly (no hardcoded `bg-white` — use `bg-background`)
- Text contrast adequate in dark mode

**Progress bars**:
- Bars animate on value change (Tailwind `transition-all duration-300`)
- No overflow (completed courses can't push past 100%)

**Loading states**:
- While JSON files are loading, show skeleton cards or a spinner (not a blank page)

### 4. Performance check

- Open DevTools → Performance
- Drag a course — drag should feel smooth (no jank)
- If progress bar recalculation or validation is slow, memoize the expensive computations with `useMemo`

Key places to check:
```typescript
// In PlannerPage or wherever validation runs on every render:
const validationResult = useMemo(
  () => prereqGraph.validatePlan(effectivePlan, semesterOrder),
  [effectivePlan, semesterOrder]  // only recomputes when plan changes
);
```

### 5. Final checklist before declaring done

- [ ] `npm run dev` — both server and client start without errors
- [ ] Node: no warnings about missing .env (drop a `.env` stub in `packages/server/`)
- [ ] Console: zero warnings or errors in normal usage
- [ ] TypeScript: `cd packages/client && npx tsc --noEmit` passes
- [ ] TypeScript: `cd packages/server && npx tsc --noEmit` passes
- [ ] Tests: `npm run test` from root — all pass
- [ ] Dark mode: toggle in header works, persists, no visual glitches
- [ ] Responsive: usable at 1280px wide (don't need mobile)

## Acceptance Criteria
- [ ] Integration tests cover the 7 flows above and pass
- [ ] All identified edge cases fixed
- [ ] Visual consistency across cards, colors, typography
- [ ] Dark mode works without visual glitches
- [ ] No console errors in normal usage
- [ ] `npm run test` from root — all test suites pass
- [ ] Both TypeScript compiles pass

## Validation Gates
- [ ] `npm test` from root — all pass
- [ ] Manual: full flow from loading → building plan → export → import
- [ ] Manual: V1 to V2 flow (V1 plan → open schedule → optimize → copy numbers)
- [ ] `cd packages/client && npx tsc --noEmit` — no errors
- [ ] `cd packages/server && npx tsc --noEmit` — no errors

## Files to Read First
- ALL previous task output (check git log for what was built)
- `.agents/workspace-map.md` — locate all component files
- `packages/client/src/` — full directory scan

## Constraints
- Do NOT add new features — only fix integration bugs and polish
- Do NOT change core data structures (types, context shapes) unless a bug requires it
- Do NOT refactor working code for "cleanliness" — only touch what's broken or visually wrong
- Commit when done: `git add -A && git commit -m "feat(TASK-017): integration tests, edge case fixes, visual polish"`

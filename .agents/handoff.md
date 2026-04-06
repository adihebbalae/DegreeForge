# Handoff: TASK-002 — Data Layer + TypeScript Types + E E→ECE Normalization
**Task ID**: TASK-002
**Mode**: autonomous (no user interaction available)
**Agent**: engineer | **Model**: sonnet

## Context

DegreeForge is a single-user interactive degree planner for UT Austin ECE student Adi. TASK-001 has already scaffolded the monorepo (`packages/client/` Vite + React + TypeScript, `packages/server/` Express). The app shell compiles and runs.

There are **9 static JSON data files** in `packages/client/public/data/` (copied from `data/` in TASK-001). These files drive the entire app — prerequisites, course catalog, degree requirements, grade distributions, sections, and the user's transcript.

**Critical normalization**: The UT ECE department was previously called "E E" (Electrical Engineering) and renamed "ECE". Grade distribution data has courses under both prefixes. All internal references must use `ECE`. Normalize at data load time — never store "E E" internally.

**Why this task matters**: Every UI feature consumes typed data. Without typed interfaces and a unified data context, TASK-003 through TASK-017 all have to guess at data shapes. This also establishes the normalization boundary — all downstream code assumes `ECE` prefix only.

## Task

Build the TypeScript data layer in `packages/client/src/`:

### 1. TypeScript Interfaces (`src/types/index.ts`)

Define interfaces for all 9 JSON schemas. Key interfaces (expand based on actual file inspection):

```typescript
// course-catalog.json
export interface Course {
  course_id: string;          // e.g. "ECE 302"
  prefix: string;             // Always "ECE" or "M" (normalized)
  number: string;             // e.g. "302"
  title: string;
  credit_hours: number;
  description?: string;
  category?: string;          // "ece_core" | "tech_core" | "gen_ed" | "elective" | "math"
}

// prerequisite-graph.json  
export interface PrereqGraph {
  nodes: Record<string, PrereqNode>;
  edges: PrereqEdge[];
}
export interface PrereqNode {
  id: string;
  title: string;
  credit_hours: number;
}
export interface PrereqEdge {
  from: string;
  to: string;
  type: 'prereq' | 'coreq';
}

// grade-distributions.json
export interface GradeDistribution {
  department: string;
  department_code: string;
  course_number: string;
  course_title: string;
  avg_gpa: number;
  a_pct: number;
  b_pct: number;
  c_pct: number;
  d_pct: number;
  f_pct: number;
  total_enrollment: number;
  total_sections: number;
  sections: GradeSection[];
}
export interface GradeSection {
  semester: string;
  section: string;
  grades: Record<string, number>;
  a_pct: number;
  b_pct: number;
  c_pct: number;
  d_pct: number;
  f_pct: number;
  enrollment: number;
  gpa: number;
}

// user-profile.json
export interface UserProfile {
  name: string;
  eid: string;
  degree: string;
  catalog: string;
  graduation_target: string;
  gpa: { cumulative: number };
  completed_courses: CompletedCourse[];
  in_progress_courses: string[];
  preferences: UserPreferences;
  tech_core: TechCorePreference;
  secondary_aspirations: SecondaryAspirations;
}

// fall-2026-sections.json
export interface CourseSection {
  course_id: string;
  title: string;
  sections: Section[];
}
export interface Section {
  unique: string;
  instructor: string;
  days: string;
  time: string;
  room: string;
  instruction_mode?: string;
}

// Extend as needed based on actual JSON structure
```

**Important**: Read the actual JSON files in `packages/client/public/data/` to get the exact field names. The interfaces above are guidance — match reality.

### 2. Data Normalization (`src/lib/normalize.ts`)

```typescript
export function normalizeEEtoECE(courseId: string): string {
  // "E E 302" → "ECE 302", "E E302" → "ECE 302"
  return courseId.replace(/^E\s*E\s+/, 'ECE ').replace(/^E\s*E(\d)/, 'ECE $1');
}

export function normalizeAllEE<T extends { course_id?: string; prefix?: string }>(items: T[]): T[] {
  // Apply to any array of objects with course_id or prefix fields
}
```

### 3. Data Loaders (`src/lib/data-loaders.ts`)

Fetch each JSON from `/data/[file].json` with proper typing. Handle loading/error states.

### 4. React Context + Hooks (`src/context/DataContext.tsx`)

Single `DataProvider` that:
- Fetches all 9 files on mount
- Applies `normalizeEEtoECE` to grade distributions and catalog
- Exposes typed data + loading state

Custom hooks:
- `useCourseCatalog()` → `Course[]`
- `usePrereqGraph()` → `PrereqGraph`
- `useTechCores()` → `TechCoreTrack[]`
- `useDegreeRequirements()` → `DegreeRequirements`
- `useOfferingSchedule()` → `OfferingSchedule`
- `useMathRequirements()` → `MathRequirements`
- `useFallSections()` → `CourseSection[]`
- `useGradeDistributions()` → `Record<string, GradeDistribution>`
- `useUserProfile()` → `UserProfile`

### 5. Wrap App in DataProvider (`src/main.tsx`)

DataProvider wraps the React tree so all hooks are available.

### 6. Unit Tests (`src/lib/normalize.test.ts`)

```typescript
describe('normalizeEEtoECE', () => {
  it('normalizes "E E 302" → "ECE 302"')
  it('normalizes "E E302" → "ECE 302"')
  it('leaves "ECE 302" unchanged')
  it('leaves "M 340L" unchanged')
  it('handles lowercase edge cases')
})
```

## Acceptance Criteria
- [ ] TypeScript interfaces exist for all 9 JSON schemas
- [ ] `DataProvider` loads all 9 files and exposes them via context
- [ ] All `E E` prefixes normalized to `ECE` at load time (verified via test)
- [ ] 9 custom hooks — one per data domain
- [ ] `useUserProfile()` returns Adi's transcript data correctly typed
- [ ] Normalization unit tests pass
- [ ] `tsc --noEmit` passes (no type errors)

## Validation Gates
- [ ] `cd packages/client && npx vitest run src/lib/normalize.test.ts` — all pass
- [ ] `cd packages/client && npx tsc --noEmit` — no errors
- [ ] DataProvider renders without crashing (test if possible)

## Files to Read First
- `packages/client/public/data/course-catalog.json` — see actual schema (first ~30 lines)
- `packages/client/public/data/grade-distributions.json` — check E E vs ECE prefixes
- `packages/client/public/data/user-profile.json` — see full transcript structure
- `packages/client/public/data/prerequisite-graph.json` — see node/edge format
- `packages/client/src/main.tsx` — where to add DataProvider

## Constraints
- Do NOT use any third-party state management (no Redux, no Zustand)
- Do NOT hardcode data — everything loads from `/data/[file].json` at runtime
- Do NOT skip the E E → ECE normalization — downstream code assumes `ECE` prefix
- Do NOT add `any` types — use `unknown` + type guards if needed
- Commit when done: `git add -A && git commit -m "feat(TASK-002): data layer, TypeScript types, E E→ECE normalization"`

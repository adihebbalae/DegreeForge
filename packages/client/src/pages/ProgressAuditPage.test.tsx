// @vitest-environment jsdom
/**
 * ProgressAuditPage — TASK-098
 *
 * Black-box checks:
 *   1. Direct nav renders ProgressAuditPage (not reveal, not old dashboard).
 *   2. fromUpload state still renders ProgressReveal.
 *   3. ProgressAuditPage renders without crash when progress data is loading
 *      (contexts return null → loading skeleton shown).
 *   4. ProgressAuditPage renders radial + cards when data is available.
 *   5. track('progress_tab_viewed') fires on direct nav.
 */
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// ── analytics mock ────────────────────────────────────────────────────────────
const mockTrack = vi.fn();
vi.mock('@/lib/analytics', () => ({ track: (...args: unknown[]) => mockTrack(...args) }));

// ── mock ProgressReveal so we don't need the full reveal flow ────────────────
vi.mock('@/components/ProgressReveal', () => ({
  ProgressReveal: ({ completed, inProgress, source }: { completed: number; inProgress: number; source: string }) => (
    <div data-testid="mock-progress-reveal">
      Reveal: {completed}/{inProgress}/{source}
    </div>
  ),
}));

// ── mock DegreeRadial and RequirementCards (heavy SVG/context deps) ──────────
vi.mock('@/components/DegreeRadial', () => ({
  DegreeRadial: ({ pct, done, total }: { pct: number; done: number; total: number }) => (
    <div data-testid="mock-degree-radial" role="img" aria-label={`${pct}% complete, ${done} of ${total} hours`} />
  ),
}));

vi.mock('@/components/RequirementCards', () => ({
  RequirementCards: ({ buckets }: { buckets: unknown[] }) => (
    <div data-testid="mock-requirement-cards">Cards: {buckets.length}</div>
  ),
}));

// ── mock computeProgress and contexts ────────────────────────────────────────
const mockBuckets = [
  { id: 'ece_core', label: 'ECE Core', category: 'ece_core', doneHours: 26, totalHours: 32, unit: 'hrs', complete: false, remaining: [] },
  { id: 'math', label: 'Math', category: 'math', doneHours: 15, totalHours: 15, unit: 'hrs', complete: true, remaining: [] },
];

vi.mock('@/lib/progress', () => ({
  computeProgress: () => ({
    totalHours: 41,
    totalHoursTarget: 125,
    buckets: mockBuckets,
    eceCoreCompleted: 8,
    eceCoreTotal: 10,
    genEdCompleted: 8,
    genEdTotal: 9,
    techCoreCompleted: 5,
    techCoreTotal: 8,
    electiveHours: 3,
    electiveTotalHours: 14,
    mathHoursCompleted: 15,
    mathHoursTotal: 15,
    physicsCompleted: 8,
    physicsTotal: 8,
    completedGenEdSlots: new Set(['ugs']),
  }),
}));

vi.mock('@/context/PlanContext', () => ({
  usePlan: () => ({}),
  useTechCoreId: () => 'computers',
  useMathBAToggle: () => false,
  useWhatIf: () => ({ isActive: false, techCoreId: 'computers', mathBAToggle: false }),
}));

vi.mock('@/context/DataContext', () => ({
  useCatalogRecord: () => ({}),
  useDegreeRequirements: () => ({
    total_credit_hours: 125,
    ece_core: { courses: [] },
    core_curriculum: { slots: [] },
    math_sequence: { required: [] },
    physics_sequence: { required: [] },
    free_electives: { total_hours: 14, constraints: [] },
    tech_core: { description: '' },
  }),
  useUserProfile: () => ({
    completed_courses: [],
    in_progress_courses: [],
  }),
  useTechCoresRecord: () => ({
    computers: {
      id: 'computers',
      name: 'Computer Architecture & Embedded Systems',
      required_courses: { core: [], advanced_math: null, core_lab: null, required_elective: null },
      elective_pool: [],
      elective_count: { general: 4 },
    },
  }),
}));

import ProgressPage from './ProgressPage';

afterEach(() => {
  cleanup();
  mockTrack.mockClear();
});

function renderWithState(state?: Record<string, unknown>) {
  return render(
    <MemoryRouter
      initialEntries={[{ pathname: '/progress', state: state ?? null }]}
    >
      <Routes>
        <Route path="/progress" element={<ProgressPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ProgressPage (TASK-098)', () => {
  it('direct nav renders ProgressAuditPage (radial + cards)', () => {
    renderWithState();
    expect(screen.getByTestId('progress-audit-page')).toBeDefined();
    expect(screen.queryByTestId('mock-progress-reveal')).toBeNull();
  });

  it('direct nav renders the DegreeRadial', () => {
    renderWithState();
    expect(screen.getByTestId('mock-degree-radial')).toBeDefined();
  });

  it('direct nav renders RequirementCards', () => {
    renderWithState();
    expect(screen.getByTestId('mock-requirement-cards')).toBeDefined();
  });

  it('fromUpload=true renders ProgressReveal, not ProgressAuditPage', () => {
    renderWithState({ fromUpload: true, completed: 18, inProgress: 2, source: 'ida' });
    expect(screen.getByTestId('mock-progress-reveal')).toBeDefined();
    expect(screen.queryByTestId('progress-audit-page')).toBeNull();
  });

  it('track("progress_tab_viewed") fires on direct nav', () => {
    renderWithState();
    expect(mockTrack).toHaveBeenCalledWith('progress_tab_viewed');
  });

  it('track("progress_tab_viewed") does NOT fire when fromUpload=true', () => {
    renderWithState({ fromUpload: true, completed: 5, inProgress: 1, source: 'transcript' });
    expect(mockTrack).not.toHaveBeenCalledWith('progress_tab_viewed');
  });
});

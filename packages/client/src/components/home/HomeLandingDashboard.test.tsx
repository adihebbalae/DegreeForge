/**
 * @vitest-environment jsdom
 *
 * HomeLandingDashboard — TASK-076
 *
 * Two black-box render checks:
 *   1. First-time (not onboarded) → the wedge hero renders the headline and all
 *      three onboarding CTAs.
 *   2. Returning (onboarded) → the dashboard renders the "On track for {gradTerm}"
 *      headline, reused requirement progress, and the quick actions.
 *
 * All context/data hooks are mocked so the test exercises the branch logic and
 * presentation, not the full provider tree.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// ── onboarded flag (the branch under test) ──────────────────────────────────
const onboardedRef = { value: false };
vi.mock('./useOnboarded', () => ({
  useOnboarded: () => onboardedRef.value,
}));

// ── next-term summary (returning view) ──────────────────────────────────────
vi.mock('./useNextTerm', () => ({
  useNextTerm: () => ({
    semesterId: 'Fall 2026',
    courseIds: ['ECE 445L', 'ECE 463'],
    totalCredits: 16,
    stressScore: 48,
    stressBand: 'medium',
    hasPrereqIssue: false,
    prereqIssueCount: 0,
  }),
}));

// ── live solver readout (both views) ────────────────────────────────────────
vi.mock('@/hooks/usePlanOptimizeSummary', () => ({
  usePlanOptimizeSummary: () => ({
    fastest: { aggregateDifficulty: 62, expectedGpa: 3.1, graduationSemesterId: 'Spring 2028', coursesWithData: 4, totalCourses: 5 },
    easiest: { aggregateDifficulty: 41, expectedGpa: 3.5, graduationSemesterId: 'Fall 2028', coursesWithData: 4, totalCourses: 5 },
  }),
}));

// ── progress computation (reused dashboard bars) ────────────────────────────
vi.mock('@/lib/progress', () => ({
  computeProgress: vi.fn(() => ({
    totalHours: 96,
    totalHoursTarget: 128,
    eceCoreCompleted: 19,
    eceCoreTotal: 21,
    genEdCompleted: 8,
    genEdTotal: 8,
    techCoreCompleted: 6,
    techCoreTotal: 8,
    electiveHours: 9,
    electiveTotalHours: 11,
    mathBACompleted: 0,
    mathBATotal: 0,
  })),
}));

// ── context hooks ───────────────────────────────────────────────────────────
vi.mock('@/context/UiContext', () => ({
  useUi: () => ({ optimizeMode: 'fastest' }),
}));

vi.mock('@/context/PlanContext', () => ({
  usePlan: () => ({}),
  useSemesters: () => [
    { id: 'Spring 2028', label: "Sp '28", status: 'future', year: 2028, season: 'Spring' },
  ],
  useTechCoreId: () => 'computer_architecture',
  useMathBAToggle: () => false,
  useWhatIf: () => ({ isActive: false, techCoreId: 'computer_architecture', mathBAToggle: false }),
}));

vi.mock('@/context/DataContext', () => ({
  useCatalogRecord: () => ({}),
  usePrereqGraph: () => ({ nodes: {}, edges: [] }),
  useDegreeRequirements: () => ({ ece_core: { courses: [] } }),
  useUserProfile: () => ({ completed_courses: [] }),
  useTechCoresRecord: () => ({ computer_architecture: { name: 'Computer Architecture' } }),
}));

vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));

import HomeLandingDashboard from './HomeLandingDashboard';

function renderHome() {
  return render(
    <MemoryRouter>
      <HomeLandingDashboard />
    </MemoryRouter>
  );
}

describe('HomeLandingDashboard', () => {
  beforeEach(() => {
    cleanup();
  });

  it('first-time visitor: renders the wedge hero with all three CTAs', () => {
    onboardedRef.value = false;
    renderHome();

    expect(screen.getByText('Find the best way to graduate.')).toBeDefined();
    expect(screen.getByRole('button', { name: /upload transcript/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /start fresh/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /example plan/i })).toBeDefined();

    // Both tradeoff preview cards present, showing real solver grad terms.
    expect(screen.getByTestId('hero-preview-fastest')).toBeDefined();
    expect(screen.getByTestId('hero-preview-easiest')).toBeDefined();
  });

  it('returning visitor: renders the dashboard with grad term, progress, and next term', () => {
    onboardedRef.value = true;
    renderHome();

    // "On track for {gradTerm}" derived from the fastest summary.
    expect(screen.getByText('On track for Spring 2028')).toBeDefined();

    // Reused requirement progress (computeProgress output surfaced).
    expect(screen.getByText('96 / 128 hrs')).toBeDefined();
    expect(screen.getByText('ECE Core')).toBeDefined();

    // Next-term summary card.
    expect(screen.getByText('Next term — Fall 2026')).toBeDefined();
    expect(screen.getByText('ECE 445L')).toBeDefined();

    // Quick actions.
    expect(screen.getByRole('button', { name: /view full plan/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /schedule/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /what-if/i })).toBeDefined();
  });
});

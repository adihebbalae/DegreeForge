// @vitest-environment jsdom
/**
 * WhatIfPanel — H2 stale-closure regression tests
 *
 * Verifies that acceptRecommendation and the autoAccept questionnaire path
 * pass the RECOMMENDED techCoreId/mathBA directly to runSolver, not the
 * pre-recommendation staged values captured in the render closure.
 */
import React from 'react';
import { render, screen, fireEvent, act, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mock runSolver so we can inspect what it was called with ────────────────
// vi.hoisted ensures the variable is initialized before vi.mock factories run.
const { mockRunSolver } = vi.hoisted(() => ({
  mockRunSolver: vi.fn(() => ({
    plan: { 'Fall 2026': [] },
    unplacedCourses: [],
  })),
}));
vi.mock('@/lib/run-solver', () => ({ runSolver: mockRunSolver }));

// Mock sanitizePlan — just pass through
vi.mock('@/lib/sanitize-course-list', () => ({
  sanitizePlan: (plan: unknown) => ({ safePlan: plan, dropped: [] }),
}));

// Mock auto-planner helper
vi.mock('@/lib/auto-planner', () => ({ getCreditHourCap: () => 15 }));

// Mock computeWhatIfDiff so we don't need the full TechCoreTrack shape in tests
vi.mock('@/lib/what-if', () => ({
  computeWhatIfDiff: () => ({
    coursesAdded: [],
    coursesRemoved: [],
    creditHourDelta: 0,
    semesterDelta: 0,
  }),
}));

// ─── Context mocks ────────────────────────────────────────────────────────────
const mockDispatch = vi.fn();
const whatIfState = { techCoreId: 'embedded_systems', mathBAToggle: false, isActive: true };

vi.mock('@/context/PlanContext', () => ({
  usePlanContext: () => ({
    state: {
      plan: {},
      whatIf: whatIfState,
      pinnedCourses: [],
      semesters: [],
    },
    dispatch: mockDispatch,
  }),
  usePlan: () => ({}),
  useWhatIf: () => whatIfState,
  usePlanDispatch: () => mockDispatch,
  useGradeEntries: () => [],
}));

vi.mock('@/context/SettingsContext', () => ({
  useSettings: () => ({
    techCoreId: 'embedded_systems',
    mathBAToggle: false,
    accessCode: '',
  }),
}));

const techCoresRecord = {
  embedded_systems: { name: 'Embedded Systems', required: [], electives: [] },
  computer_architecture: { name: 'Computer Architecture', required: [], electives: [] },
};

vi.mock('@/context/DataContext', () => ({
  useTechCores: () => Object.values(techCoresRecord),
  useTechCoresRecord: () => techCoresRecord,
  useMathRequirements: () => ({}),
  useCatalogRecord: () => ({}),
  useUserProfile: () => ({
    completed_courses: [],
    in_progress_courses: [],
    load_tolerance: 'normal',
  }),
  useDegreeRequirements: () => ({}),
  useOfferingSchedule: () => ({}),
}));

vi.mock('@/hooks/useEffectiveProfile', () => ({
  useEffectiveProfile: () => ({
    completed_courses: [],
    in_progress_courses: [],
    load_tolerance: 'normal',
  }),
}));

vi.mock('@/hooks/usePrereqGraph', () => ({
  usePrereqGraph: () => ({ nodes: {}, edges: [] }),
}));

// Mock fetch for /api/recommend
const mockFetch = vi.fn();
global.fetch = mockFetch;

vi.mock('@/lib/agent-loop', () => ({ serverBaseUrl: () => 'http://localhost:3001' }));

// Mock QuestionnaireDialog — expose its onComplete callback via a test button
vi.mock('./QuestionnaireDialog', () => ({
  QuestionnaireDialog: ({ onComplete }: { onComplete: (a: string) => void }) => (
    <button
      data-testid="questionnaire-trigger"
      onClick={() => onComplete('I like robotics')}
    >
      Questionnaire
    </button>
  ),
}));

// Stub shadcn/ui components that require full browser env
vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/ui/separator', () => ({
  Separator: () => <hr />,
}));

import WhatIfPanel from './WhatIfPanel';

// AI_ENABLED=false hides the "Generate Plan" button and QuestionnaireDialog trigger in WhatIfPanel.
// These tests remain so they can be un-skipped when AI is re-enabled (set AI_ENABLED=true in lib/features.ts).
describe.skip('WhatIfPanel — H2 stale-closure fix (AI_ENABLED=false — hidden for soft launch)', () => {
  beforeEach(() => {
    mockRunSolver.mockClear();
    mockDispatch.mockClear();
    mockFetch.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('acceptRecommendation passes recommended track to runSolver, not stale staged values', async () => {
    // The staged values (from whatIfState above) are 'embedded_systems' / false.
    // The recommendation returns 'computer_architecture' / true.
    // runSolver must be called with 'computer_architecture', not 'embedded_systems'.
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        techCoreId: 'computer_architecture',
        mathBA: true,
        reasoning: 'Your grades suggest this track.',
      }),
    });

    const onClose = vi.fn();
    render(<WhatIfPanel onClose={onClose} />);

    // Click "Generate Plan" to trigger the AI recommend flow (no autoAccept)
    const generateBtn = screen.getByText('Generate Plan');
    await act(async () => { fireEvent.click(generateBtn); });

    // Wait for the recommendation dialog to appear
    await waitFor(() => screen.getByText('AI Recommendation'));

    // Accept the recommendation
    const acceptBtn = screen.getByText('Accept & Generate Plan');
    await act(async () => { fireEvent.click(acceptBtn); });

    // runSolver must have been invoked with the recommended track
    await waitFor(() => expect(mockRunSolver).toHaveBeenCalled());
    const solverArgs = (mockRunSolver.mock.calls[0] as unknown[])[0] as { techCoreId: string; mathBAToggle: boolean };
    expect(solverArgs.techCoreId).toBe('computer_architecture');
    expect(solverArgs.mathBAToggle).toBe(true);
  });

  it('autoAccept (questionnaire) path passes recommended track to runSolver, not stale staged values', async () => {
    // Same scenario — staged = 'embedded_systems'/false, recommendation = 'computer_architecture'/true
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        techCoreId: 'computer_architecture',
        mathBA: true,
        reasoning: 'Questionnaire-driven recommendation.',
      }),
    });

    const onClose = vi.fn();
    render(<WhatIfPanel onClose={onClose} />);

    // Trigger the questionnaire flow (autoAccept = true)
    const questionnaireBtn = screen.getByTestId('questionnaire-trigger');
    await act(async () => { fireEvent.click(questionnaireBtn); });

    await waitFor(() => expect(mockRunSolver).toHaveBeenCalled());
    const solverArgs = (mockRunSolver.mock.calls[0] as unknown[])[0] as { techCoreId: string; mathBAToggle: boolean };
    expect(solverArgs.techCoreId).toBe('computer_architecture');
    expect(solverArgs.mathBAToggle).toBe(true);
  });
});

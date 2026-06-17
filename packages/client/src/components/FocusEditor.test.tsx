// @vitest-environment jsdom
/**
 * FocusEditor — inline tab-strip tests.
 *
 * Proves the focus header now hosts the segmented tab strip (Insights · Add ·
 * Best Path) and that selecting a tab switches the headless FocusTabbedPanel's
 * active panel. Also proves the focused-semester credit-hours are surfaced in the
 * header (since the SemesterColumn's own header is suppressed). The SemesterColumn
 * and FocusTabbedPanel children plus all data/plan contexts are mocked so the test
 * exercises FocusEditor's header wiring, not the data layer.
 */

import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import FocusEditor from './FocusEditor';

const setFocusedSemesterId = vi.fn();

// ─── Context / hook mocks ───────────────────────────────────────────────────────
vi.mock('@/context/UiContext', () => ({
  useUi: () => ({ setFocusedSemesterId }),
}));
vi.mock('@/context/PlanContext', () => ({
  useSemesters: () => [
    { id: 'fall-2027', label: 'Fall 2027', status: 'future', season: 'Fall', year: 2027 },
  ],
  usePlan: () => ({ 'fall-2027': ['ECE 313', 'ECE 445'] }),
  useHoveredCourse: () => null,
  useGradeEntries: () => ({}),
  usePinnedCourses: () => [],
  useGhostCourses: () => ({}),
  usePlanDispatch: () => vi.fn(),
}));
vi.mock('@/context/DataContext', () => ({
  useUserProfile: () => null,
  useCatalogRecord: () => null,
  usePrereqGraph: () => ({ nodes: {} }),
  useGradeDistributions: () => ({}),
  useOfferingSchedule: () => ({}),
  useSectionsIndex: () => ({}),
}));
vi.mock('@/lib/course-utils', () => ({
  buildTermLoadCredits: () => ({}),
  getCourseCredits: () => 3,
}));
vi.mock('@/lib/offering-verification', () => ({
  buildVerifiedTermSet: () => new Set(),
  isUnverifiedOfferingPlacement: () => false,
}));
vi.mock('@/lib/auto-planner', () => ({ getCreditHourCap: () => 15 }));
vi.mock('@/hooks/useValidation', () => ({
  useValidation: () => ({ violationsByCourse: {} }),
}));
vi.mock('@/hooks/usePrereqGraph', () => ({
  usePrereqGraph: () => ({
    getDownstream: () => [],
    getAllPrereqs: () => [],
  }),
}));
vi.mock('@/hooks/useEffectiveProfile', () => ({
  useEffectiveProfile: () => null,
}));

// SemesterColumn stub — asserts hideHeader is passed through.
vi.mock('./SemesterColumn', () => ({
  default: ({ hideHeader }: { hideHeader?: boolean }) => (
    <div data-testid="semester-column" data-hide-header={String(Boolean(hideHeader))}>column</div>
  ),
}));

// FocusTabbedPanel stub — reflects the controlled activeTab + headless flag so the
// test can assert the active panel and that the panel is headless.
vi.mock('./focus/FocusTabbedPanel', async () => {
  const actual = await vi.importActual<typeof import('./focus/FocusTabbedPanel')>('./focus/FocusTabbedPanel');
  return {
    ...actual,
    default: ({ activeTab, headless }: { activeTab?: string; headless?: boolean }) => (
      <div data-testid="tabbed-panel" data-active={activeTab} data-headless={String(Boolean(headless))}>
        panel:{activeTab}
      </div>
    ),
  };
});

afterEach(() => {
  cleanup();
  setFocusedSemesterId.mockClear();
});

describe('FocusEditor inline tabs', () => {
  it('renders the segmented tab strip in the header', () => {
    render(<FocusEditor focusedSemesterId="fall-2027" onClose={vi.fn()} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Insights', 'Add', 'Best Path']);
  });

  it('drives the headless FocusTabbedPanel, switching the active panel on tab click', () => {
    render(<FocusEditor focusedSemesterId="fall-2027" onClose={vi.fn()} />);

    const panel = screen.getByTestId('tabbed-panel');
    expect(panel.getAttribute('data-headless')).toBe('true');
    expect(panel.getAttribute('data-active')).toBe('insights');

    fireEvent.click(screen.getByRole('tab', { name: 'Best Path' }));
    expect(screen.getByTestId('tabbed-panel').getAttribute('data-active')).toBe('bestpath');

    // "+ Add course" jumps to the Add tab.
    fireEvent.click(screen.getByTestId('focus-editor-add-course-btn'));
    expect(screen.getByTestId('tabbed-panel').getAttribute('data-active')).toBe('add');
  });

  it('suppresses the SemesterColumn header and surfaces credit-hours in the header', () => {
    render(<FocusEditor focusedSemesterId="fall-2027" onClose={vi.fn()} />);
    expect(screen.getByTestId('semester-column').getAttribute('data-hide-header')).toBe('true');
    // 2 courses × 3 credits (mocked) = 6, future cap 15 → "6 / 15 hrs".
    expect(screen.getByTestId('focus-editor-credits').textContent).toBe('6 / 15 hrs');
  });
});

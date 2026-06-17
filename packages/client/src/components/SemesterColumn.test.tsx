// @vitest-environment jsdom
/**
 * SemesterColumn — hideHeader prop tests.
 *
 * Proves the column's own header (semester label + credit-hours row) renders by
 * default and is suppressed when hideHeader is set — the path FocusEditor uses to
 * avoid a duplicate focused-semester heading. dnd-kit, the plan dispatch, and the
 * CourseCard child are mocked so the test exercises only the header wiring.
 */

import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import SemesterColumn from './SemesterColumn';
import type { Semester } from '@/types';

// ─── dnd-kit mocks ─────────────────────────────────────────────────────────────
vi.mock('@dnd-kit/core', () => ({
  useDroppable: () => ({ setNodeRef: vi.fn(), isOver: false }),
  useDndMonitor: () => {},
}));
vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: unknown }) => <>{children}</>,
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
  verticalListSortingStrategy: {},
  arrayMove: <T,>(arr: T[]) => arr,
}));

vi.mock('@/context/PlanContext', () => ({
  usePlanDispatch: () => vi.fn(),
}));
vi.mock('@/lib/workload', () => ({
  computeSemesterDifficulty: () => ({ bucket: 'light', semesterDifficulty: 10 }),
  HEAT_STRIPE_CLASS: { light: 'bg-green-200', medium: 'bg-amber-200', heavy: 'bg-red-200', extreme: 'bg-red-500' },
}));
vi.mock('@/lib/auto-planner', () => ({ getCreditHourCap: () => 15 }));
vi.mock('@/lib/course-utils', () => ({
  getCourseCredits: () => 3,
  seasonEmoji: () => '🍂',
}));
vi.mock('./CourseCard', () => ({
  default: ({ courseId }: { courseId: string }) => <div data-testid="course-card">{courseId}</div>,
}));

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const futureSemester: Semester = {
  id: 'fall-2027',
  label: 'Fall 2027',
  status: 'future',
  season: 'Fall',
  year: 2027,
};

const baseProps = {
  semester: futureSemester,
  courseIds: ['ECE 313'],
  gradeMap: {},
  catalog: null,
  prereqNodes: {},
  gradeDistributions: {},
  transcriptCredits: {},
  violationsByCourse: {},
  downstreamCourses: new Set<string>(),
};

afterEach(cleanup);

describe('SemesterColumn hideHeader', () => {
  it('renders the column header (label + credit-hours) by default', () => {
    render(<SemesterColumn {...baseProps} creditHourCap={15} />);
    expect(screen.getByText('Fall 2027')).toBeTruthy();
    // Default cap-relative credit display: "3 / 15 hrs"
    expect(screen.getByText(/3 \/ 15 hrs/)).toBeTruthy();
  });

  it('suppresses the column header when hideHeader is set', () => {
    render(<SemesterColumn {...baseProps} creditHourCap={15} hideHeader />);
    expect(screen.queryByText('Fall 2027')).toBeNull();
    expect(screen.queryByText(/hrs/)).toBeNull();
    // The course list is still rendered — only the header is suppressed.
    expect(screen.getByTestId('course-card')).toBeTruthy();
  });
});

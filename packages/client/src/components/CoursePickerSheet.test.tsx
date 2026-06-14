/**
 * @vitest-environment jsdom
 *
 * Tests for CoursePickerSheet (TASK-086 tap-to-add path):
 *  1. Renders search input with results list
 *  2. Tapping a result dispatches ADD_COURSE to the correct semester
 *  3. Fires track('course_added', { via: 'tap' }) on successful add
 *  4. Blocks add to a past semester and shows feedback message
 *  5. A course already placed is absent from results (duplicate guard)
 *  6. Closing via X calls onClose
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

// ─── Hoisted mutable state ────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  plan: {} as Record<string, string[]>,
  semesters: [
    { id: 'sem-past', label: 'Fall 2025', status: 'past' as const, season: 'Fall' as const, year: 2025 },
    { id: 'sem-current', label: 'Spring 2026', status: 'current' as const, season: 'Spring' as const, year: 2026 },
    { id: 'sem-future', label: 'Fall 2026', status: 'future' as const, season: 'Fall' as const, year: 2026 },
  ],
  userProfile: {
    completed_courses: [] as { course: string; grade: string; credit_hours: number }[],
    in_progress_courses: [] as { course: string; credit_hours: number }[],
  },
  dispatch: vi.fn(),
  trackFn: vi.fn(),
}));

// ─── Module mocks ─────────────────────────────────────────────────────────────

const MOCK_CATALOG = {
  'ECE 302': { id: 'ECE 302', title: 'Signals and Systems', credits: 4, description: '', prerequisites: [], corequisites: [], grading: '', department: 'ECE' },
  'ECE 306': { id: 'ECE 306', title: 'Intro to Computing', credits: 3, description: '', prerequisites: [], corequisites: [], grading: '', department: 'ECE' },
  'M 408C': { id: 'M 408C', title: 'Differential Calculus', credits: 4, description: '', prerequisites: [], corequisites: [], grading: '', department: 'M' },
};

vi.mock('@/context/DataContext', () => ({
  useCatalogRecord: () => MOCK_CATALOG,
  usePrereqGraph: () => ({ nodes: {}, edges: [] }),
  useUserProfile: () => mocks.userProfile,
}));

vi.mock('@/context/PlanContext', () => ({
  usePlan: () => mocks.plan,
  useSemesters: () => mocks.semesters,
  usePlanDispatch: () => mocks.dispatch,
}));

vi.mock('@/lib/analytics', () => ({
  track: (...args: unknown[]) => mocks.trackFn(...args),
}));

// ─── Import component AFTER mocks ────────────────────────────────────────────

import CoursePickerSheet from './CoursePickerSheet';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CoursePickerSheet', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    mocks.plan = {};
    mocks.userProfile = { completed_courses: [], in_progress_courses: [] };
    mocks.dispatch.mockClear();
    mocks.trackFn.mockClear();
    onClose.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the search input and course results', () => {
    render(<CoursePickerSheet semesterId="sem-current" onClose={onClose} />);
    expect(screen.getByPlaceholderText(/search course/i)).toBeTruthy();
    const options = screen.getAllByRole('option');
    expect(options.some((o) => o.textContent?.includes('ECE 302'))).toBe(true);
    expect(options.some((o) => o.textContent?.includes('ECE 306'))).toBe(true);
    expect(options.some((o) => o.textContent?.includes('M 408C'))).toBe(true);
  });

  it('filters results by query', () => {
    render(<CoursePickerSheet semesterId="sem-current" onClose={onClose} />);
    const input = screen.getByPlaceholderText(/search course/i);
    fireEvent.change(input, { target: { value: '302' } });
    const options = screen.getAllByRole('option');
    expect(options.some((o) => o.textContent?.includes('ECE 302'))).toBe(true);
    expect(options.every((o) => !o.textContent?.includes('ECE 306'))).toBe(true);
  });

  it('tapping a result dispatches ADD_COURSE to the correct semester', () => {
    render(<CoursePickerSheet semesterId="sem-current" onClose={onClose} />);
    const options = screen.getAllByRole('option');
    // Find the ECE 302 option
    const ece302Option = options.find((o) => o.textContent?.includes('ECE 302'));
    expect(ece302Option).toBeTruthy();
    fireEvent.pointerDown(ece302Option!);
    expect(mocks.dispatch).toHaveBeenCalledWith({
      type: 'ADD_COURSE',
      semesterId: 'sem-current',
      courseId: 'ECE 302',
    });
  });

  it('fires track("course_added", { via: "tap" }) on successful add', () => {
    render(<CoursePickerSheet semesterId="sem-current" onClose={onClose} />);
    const options = screen.getAllByRole('option');
    const ece302Option = options.find((o) => o.textContent?.includes('ECE 302'));
    fireEvent.pointerDown(ece302Option!);
    expect(mocks.trackFn).toHaveBeenCalledWith('course_added', { via: 'tap' });
  });

  it('blocks add to a past semester and shows feedback message', () => {
    render(<CoursePickerSheet semesterId="sem-past" onClose={onClose} />);
    const options = screen.getAllByRole('option');
    const ece302Option = options.find((o) => o.textContent?.includes('ECE 302'));
    fireEvent.pointerDown(ece302Option!);
    // Dispatch should NOT be called — reducer would reject, but UI guard fires first
    expect(mocks.dispatch).not.toHaveBeenCalled();
    expect(mocks.trackFn).not.toHaveBeenCalled();
    // Feedback message should appear
    expect(screen.getByText(/already past/i)).toBeTruthy();
  });

  it('excludes a course already placed in the plan', () => {
    mocks.plan = { 'sem-current': ['ECE 302'] };
    render(<CoursePickerSheet semesterId="sem-current" onClose={onClose} />);
    const options = screen.getAllByRole('option');
    expect(options.every((o) => !o.textContent?.includes('ECE 302'))).toBe(true);
    expect(options.some((o) => o.textContent?.includes('ECE 306'))).toBe(true);
  });

  it('excludes courses in a different semester from results (duplicate guard)', () => {
    mocks.plan = { 'sem-future': ['M 408C'] };
    render(<CoursePickerSheet semesterId="sem-current" onClose={onClose} />);
    const options = screen.getAllByRole('option');
    // M 408C placed in sem-future → excluded from picker for sem-current (already in plan)
    expect(options.every((o) => !o.textContent?.includes('M 408C'))).toBe(true);
  });

  it('calls onClose when X is clicked', () => {
    render(<CoursePickerSheet semesterId="sem-current" onClose={onClose} />);
    const closeBtn = screen.getByRole('button', { name: /close course search/i });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('adds to a future semester without issue', () => {
    render(<CoursePickerSheet semesterId="sem-future" onClose={onClose} />);
    const options = screen.getAllByRole('option');
    const ece306Option = options.find((o) => o.textContent?.includes('ECE 306'));
    fireEvent.pointerDown(ece306Option!);
    expect(mocks.dispatch).toHaveBeenCalledWith({
      type: 'ADD_COURSE',
      semesterId: 'sem-future',
      courseId: 'ECE 306',
    });
    expect(mocks.trackFn).toHaveBeenCalledWith('course_added', { via: 'tap' });
  });
});

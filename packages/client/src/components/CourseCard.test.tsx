// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import CourseCard from './CourseCard';

// ─── Mocks ────────────────────────────────────────────────────────────────────
// CourseCard pulls a lot of context for its graduation-delay tooltip. None of it
// matters for the remove-affordance behavior under test, so stub it all out.

const mockDispatch = vi.fn();

vi.mock('@/context/PlanContext', () => ({
  usePlanDispatch: () => mockDispatch,
  usePlan: () => ({}),
  useSemesters: () => [],
  useTechCoreId: () => 'computer_architecture',
  useMathBAToggle: () => false,
}));

vi.mock('@/context/DataContext', () => ({
  useUserProfile: () => null,
  useDegreeRequirements: () => null,
  useTechCoresRecord: () => null,
  useMathRequirements: () => null,
}));

vi.mock('@/hooks/usePrereqGraph', () => ({
  usePrereqGraph: () => ({}),
}));

vi.mock('@/lib/workload', () => ({
  computeGraduationDelay: () => 0,
}));

vi.mock('@/lib/course-utils', () => ({
  inferCategory: () => 'ece-core',
  CATEGORY_BORDER: { 'ece-core': '' },
  getCourseCredits: () => 3,
  getCourseTitle: (id: string) => `Title for ${id}`,
  gpaColorClass: () => '',
  buildTranscriptCredits: () => ({}),
}));

// Surface the detail dialog's open state so we can assert click affordances.
vi.mock('./CourseDetailDialog', () => ({
  default: ({ open }: { open: boolean }) =>
    open ? <div data-testid="detail-dialog-open" /> : null,
}));

const baseProps = {
  courseId: 'ECE 302',
  semesterStatus: 'future' as const,
  catalog: null,
  prereqNodes: {},
  gradeDistributions: {},
};

afterEach(() => {
  cleanup();
  mockDispatch.mockReset();
});

describe('CourseCard remove affordance (TASK-080 BUG 2)', () => {
  it('renders a remove button labeled with the course id when onRemove is provided', () => {
    render(<CourseCard {...baseProps} onRemove={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Remove ECE 302' })).toBeTruthy();
  });

  it('calls onRemove with the course id when the X is clicked', () => {
    const onRemove = vi.fn();
    render(<CourseCard {...baseProps} onRemove={onRemove} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove ECE 302' }));
    expect(onRemove).toHaveBeenCalledWith('ECE 302');
  });

  it('does NOT open the detail dialog when the X is clicked (stopPropagation)', () => {
    render(<CourseCard {...baseProps} onRemove={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove ECE 302' }));
    expect(screen.queryByTestId('detail-dialog-open')).toBeNull();
  });

  it('opens the detail dialog when the card body (not the X) is clicked', () => {
    render(<CourseCard {...baseProps} onRemove={vi.fn()} />);
    // The card body carries the course title; clicking it opens the dialog.
    fireEvent.click(screen.getByText('Title for ECE 302'));
    expect(screen.getByTestId('detail-dialog-open')).toBeTruthy();
  });

  it('does not render a remove button when onRemove is omitted (palette/past cards)', () => {
    render(<CourseCard {...baseProps} />);
    expect(screen.queryByRole('button', { name: 'Remove ECE 302' })).toBeNull();
  });
});

describe('CourseCard side controls layout (focus column)', () => {
  it('renders both pin and remove controls in the side layout', () => {
    render(
      <CourseCard {...baseProps} controlsLayout="side" onRemove={vi.fn()} onTogglePin={vi.fn()} />
    );
    expect(screen.getByRole('button', { name: 'Remove ECE 302' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pin' })).toBeTruthy();
  });

  it('still calls onRemove without opening the dialog in the side layout (stopPropagation)', () => {
    const onRemove = vi.fn();
    render(<CourseCard {...baseProps} controlsLayout="side" onRemove={onRemove} onTogglePin={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove ECE 302' }));
    expect(onRemove).toHaveBeenCalledWith('ECE 302');
    expect(screen.queryByTestId('detail-dialog-open')).toBeNull();
  });

  it('still calls onTogglePin without opening the dialog in the side layout (stopPropagation)', () => {
    const onTogglePin = vi.fn();
    render(<CourseCard {...baseProps} controlsLayout="side" onRemove={vi.fn()} onTogglePin={onTogglePin} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pin' }));
    expect(onTogglePin).toHaveBeenCalledWith('ECE 302');
    expect(screen.queryByTestId('detail-dialog-open')).toBeNull();
  });

  it('still opens the dialog when the card body is clicked in the side layout', () => {
    render(<CourseCard {...baseProps} controlsLayout="side" onRemove={vi.fn()} onTogglePin={vi.fn()} />);
    fireEvent.click(screen.getByText('Title for ECE 302'));
    expect(screen.getByTestId('detail-dialog-open')).toBeTruthy();
  });
});

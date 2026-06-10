// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { CourseListEditor, EMPTY_COMPLETED, EMPTY_INPROGRESS } from './CourseListEditor';
import type { UserProfile } from '@/types';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

type CompletedCourse = UserProfile['completed_courses'][number];
type InProgressCourse = UserProfile['in_progress_courses'][number];

const SAMPLE_COMPLETED: CompletedCourse = {
  course: 'ECE 302',
  title: 'Intro to Electrical Engineering',
  grade: 'A',
  semester: 'Fall 2025',
  type: 'In residence',
  credit_hours: 3,
};

const SAMPLE_INPROGRESS: InProgressCourse = {
  course: 'ECE 312H',
  title: 'Software Engineering I Honors',
  semester: 'Spring 2026',
  credit_hours: 3,
};

function makeProps(overrides?: Partial<React.ComponentProps<typeof CourseListEditor>>) {
  return {
    completedCourses: [],
    inProgressCourses: [],
    onAddCompleted: vi.fn(),
    onUpdateCompleted: vi.fn(),
    onRemoveCompleted: vi.fn(),
    onAddInProgress: vi.fn(),
    onUpdateInProgress: vi.fn(),
    onRemoveInProgress: vi.fn(),
    ...overrides,
  };
}

describe('CourseListEditor — empty state', () => {
  it('renders "No completed courses yet" when empty', () => {
    render(<CourseListEditor {...makeProps()} />);
    expect(screen.getByText('No completed courses yet.')).toBeDefined();
  });

  it('renders "No in-progress courses" when empty', () => {
    render(<CourseListEditor {...makeProps()} />);
    expect(screen.getByText('No in-progress courses.')).toBeDefined();
  });

  it('renders completed and in-progress section labels', () => {
    render(<CourseListEditor {...makeProps()} />);
    expect(screen.getByText(/Completed \(0\)/i)).toBeDefined();
    expect(screen.getByText(/In Progress \(0\)/i)).toBeDefined();
  });
});

describe('CourseListEditor — add completed course', () => {
  it('Add button is disabled when course code is empty', () => {
    render(<CourseListEditor {...makeProps()} />);
    const addBtn = screen.getByLabelText('Add completed course');
    expect((addBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('calls onAddCompleted with correct payload when Add is clicked', () => {
    const onAddCompleted = vi.fn();
    render(<CourseListEditor {...makeProps({ onAddCompleted })} />);

    fireEvent.change(screen.getByLabelText('New completed course code'), { target: { value: 'ECE 302' } });
    fireEvent.change(screen.getByLabelText('New completed course title'), { target: { value: 'Intro to EE' } });
    fireEvent.change(screen.getByLabelText('New completed semester'), { target: { value: 'Fall 2025' } });
    fireEvent.change(screen.getByLabelText('New completed grade'), { target: { value: 'A' } });
    fireEvent.change(screen.getByLabelText('New completed credit hours'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('New completed type'), { target: { value: 'In residence' } });

    fireEvent.click(screen.getByLabelText('Add completed course'));

    expect(onAddCompleted).toHaveBeenCalledTimes(1);
    expect(onAddCompleted).toHaveBeenCalledWith(
      expect.objectContaining({ course: 'ECE 302', title: 'Intro to EE', grade: 'A' })
    );
  });

  it('Add button is enabled once course code is typed', () => {
    render(<CourseListEditor {...makeProps()} />);
    fireEvent.change(screen.getByLabelText('New completed course code'), { target: { value: 'ECE 302' } });
    const addBtn = screen.getByLabelText('Add completed course');
    expect((addBtn as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('CourseListEditor — remove completed course', () => {
  it('calls onRemoveCompleted with the correct index when Remove is clicked', () => {
    const onRemoveCompleted = vi.fn();
    render(
      <CourseListEditor
        {...makeProps({
          completedCourses: [SAMPLE_COMPLETED],
          onRemoveCompleted,
        })}
      />
    );

    // The remove button is inside a group; hover isn't needed in jsdom — button is accessible
    const removeBtn = screen.getByLabelText(`Remove ${SAMPLE_COMPLETED.course}`);
    fireEvent.click(removeBtn);

    expect(onRemoveCompleted).toHaveBeenCalledWith(0);
  });
});

describe('CourseListEditor — edit completed course', () => {
  it('clicking Edit reveals inline edit fields, Save dispatches UPDATE_COMPLETED_COURSE', () => {
    const onUpdateCompleted = vi.fn();
    render(
      <CourseListEditor
        {...makeProps({
          completedCourses: [SAMPLE_COMPLETED],
          onUpdateCompleted,
        })}
      />
    );

    // Enter edit mode
    fireEvent.click(screen.getByLabelText(`Edit ${SAMPLE_COMPLETED.course}`));

    // Change grade field (aria-label="Grade" appears in the edit form)
    const gradeInput = screen.getByLabelText('Grade');
    fireEvent.change(gradeInput, { target: { value: 'B+' } });

    // Save
    fireEvent.click(screen.getByLabelText('Save'));

    expect(onUpdateCompleted).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ grade: 'B+', course: SAMPLE_COMPLETED.course })
    );
  });

  it('Cancel discards draft and does not call onUpdateCompleted', () => {
    const onUpdateCompleted = vi.fn();
    render(
      <CourseListEditor
        {...makeProps({
          completedCourses: [SAMPLE_COMPLETED],
          onUpdateCompleted,
        })}
      />
    );

    fireEvent.click(screen.getByLabelText(`Edit ${SAMPLE_COMPLETED.course}`));
    fireEvent.change(screen.getByLabelText('Grade'), { target: { value: 'F' } });
    fireEvent.click(screen.getByLabelText('Cancel edit'));

    expect(onUpdateCompleted).not.toHaveBeenCalled();
  });
});

describe('CourseListEditor — add in-progress course', () => {
  it('Add button is disabled when course code is empty', () => {
    render(<CourseListEditor {...makeProps()} />);
    const addBtn = screen.getByLabelText('Add in-progress course');
    expect((addBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('calls onAddInProgress with correct payload', () => {
    const onAddInProgress = vi.fn();
    render(<CourseListEditor {...makeProps({ onAddInProgress })} />);

    fireEvent.change(screen.getByLabelText('New in-progress course code'), { target: { value: 'ECE 312H' } });
    fireEvent.change(screen.getByLabelText('New in-progress course title'), { target: { value: 'Software I' } });
    fireEvent.change(screen.getByLabelText('New in-progress semester'), { target: { value: 'Spring 2026' } });
    fireEvent.change(screen.getByLabelText('New in-progress credit hours'), { target: { value: '3' } });

    fireEvent.click(screen.getByLabelText('Add in-progress course'));

    expect(onAddInProgress).toHaveBeenCalledWith(
      expect.objectContaining({ course: 'ECE 312H', semester: 'Spring 2026' })
    );
  });
});

describe('CourseListEditor — remove in-progress course', () => {
  it('calls onRemoveInProgress with the correct index', () => {
    const onRemoveInProgress = vi.fn();
    render(
      <CourseListEditor
        {...makeProps({
          inProgressCourses: [SAMPLE_INPROGRESS],
          onRemoveInProgress,
        })}
      />
    );

    fireEvent.click(screen.getByLabelText(`Remove ${SAMPLE_INPROGRESS.course}`));
    expect(onRemoveInProgress).toHaveBeenCalledWith(0);
  });
});

describe('CourseListEditor — edit in-progress course', () => {
  it('clicking Edit and Save dispatches UPDATE_INPROGRESS_COURSE with updated semester', () => {
    const onUpdateInProgress = vi.fn();
    render(
      <CourseListEditor
        {...makeProps({
          inProgressCourses: [SAMPLE_INPROGRESS],
          onUpdateInProgress,
        })}
      />
    );

    fireEvent.click(screen.getByLabelText(`Edit ${SAMPLE_INPROGRESS.course}`));
    fireEvent.change(screen.getByLabelText('Semester'), { target: { value: 'Fall 2026' } });
    fireEvent.click(screen.getByLabelText('Save'));

    expect(onUpdateInProgress).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ semester: 'Fall 2026', course: SAMPLE_INPROGRESS.course })
    );
  });
});

describe('CourseListEditor — counts', () => {
  it('shows correct count when courses are present', () => {
    render(
      <CourseListEditor
        {...makeProps({
          completedCourses: [SAMPLE_COMPLETED, { ...SAMPLE_COMPLETED, course: 'ECE 306' }],
          inProgressCourses: [SAMPLE_INPROGRESS],
        })}
      />
    );
    expect(screen.getByText(/Completed \(2\)/i)).toBeDefined();
    expect(screen.getByText(/In Progress \(1\)/i)).toBeDefined();
  });
});

describe('EMPTY_COMPLETED and EMPTY_INPROGRESS constants', () => {
  it('EMPTY_COMPLETED has blank course and default credit hours', () => {
    expect(EMPTY_COMPLETED.course).toBe('');
    expect(EMPTY_COMPLETED.credit_hours).toBe(3);
    expect(EMPTY_COMPLETED.type).toBe('In residence');
  });

  it('EMPTY_INPROGRESS has blank course and default credit hours', () => {
    expect(EMPTY_INPROGRESS.course).toBe('');
    expect(EMPTY_INPROGRESS.credit_hours).toBe(3);
  });
});

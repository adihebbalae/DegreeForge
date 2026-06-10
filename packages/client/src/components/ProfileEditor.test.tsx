// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

// ─── Mocks ─────────────────────────────────────────────────────────────────────

// vi.mock factories are hoisted — no top-level variable refs allowed inside.
// Use vi.fn() stubs; wire up return values in beforeEach.

const mockProfileDispatch = vi.fn();
const mockPlanDispatch = vi.fn();
const mockFetchAndLoadDemo = vi.fn();
const mockDeriveTimeline = vi.fn(() => ({} as Record<string, string[]>));
const mockUseOwnedProfile = vi.fn();
const mockUseProfileDispatch = vi.fn(() => mockProfileDispatch);
const mockUsePlanDispatch = vi.fn(() => mockPlanDispatch);

vi.mock('@/context/ProfileContext', () => ({
  useOwnedProfile: () => mockUseOwnedProfile(),
  useProfileDispatch: () => mockUseProfileDispatch(),
  // Thin wrapper so tsc doesn't complain about the spread but still delegates to the spy
  fetchAndLoadDemo: (dispatch: unknown) => mockFetchAndLoadDemo(dispatch),
}));

vi.mock('@/context/PlanContext', () => ({
  usePlanDispatch: () => mockUsePlanDispatch(),
  SEMESTERS: [] as unknown[],
}));

vi.mock('@/lib/derive-timeline', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deriveTimelinePlanFromProfile: (...args: any[]) => (mockDeriveTimeline as (...a: unknown[]) => Record<string, string[]>)(...args),
}));

vi.mock('@/components/CourseListEditor', () => ({
  CourseListEditor: ({
    onAddCompleted,
    onUpdateCompleted,
    onRemoveCompleted,
    onAddInProgress,
    onUpdateInProgress,
    onRemoveInProgress,
  }: {
    completedCourses: unknown[];
    inProgressCourses: unknown[];
    onAddCompleted: (c: unknown) => void;
    onUpdateCompleted: (i: number, c: unknown) => void;
    onRemoveCompleted: (i: number) => void;
    onAddInProgress: (c: unknown) => void;
    onUpdateInProgress: (i: number, c: unknown) => void;
    onRemoveInProgress: (i: number) => void;
  }) => (
    <div data-testid="course-list-editor">
      <button
        onClick={() =>
          onAddCompleted({ course: 'ECE 302', title: 'Test', grade: 'A', semester: 'Fall 2025', type: 'In residence', credit_hours: 3 })
        }
      >
        add-completed
      </button>
      <button
        onClick={() =>
          onUpdateCompleted(0, { course: 'ECE 302', title: 'Updated', grade: 'B', semester: 'Fall 2025', type: 'In residence', credit_hours: 3 })
        }
      >
        update-completed
      </button>
      <button onClick={() => onRemoveCompleted(0)}>remove-completed</button>
      <button
        onClick={() =>
          onAddInProgress({ course: 'ECE 312H', title: 'Test', semester: 'Spring 2026', credit_hours: 3 })
        }
      >
        add-inprogress
      </button>
      <button
        onClick={() =>
          onUpdateInProgress(0, { course: 'ECE 312H', title: 'Updated', semester: 'Fall 2026', credit_hours: 3 })
        }
      >
        update-inprogress
      </button>
      <button onClick={() => onRemoveInProgress(0)}>remove-inprogress</button>
    </div>
  ),
}));

vi.mock('@/components/ui/confirm-dialog', () => ({
  ConfirmDialog: ({
    open,
    title,
    onConfirm,
    onOpenChange,
  }: {
    open: boolean;
    title: string;
    onConfirm: () => void;
    onOpenChange: (v: boolean) => void;
  }) =>
    open ? (
      <div data-testid={`confirm-${title.replace(/\s+/g, '-').toLowerCase()}`}>
        <button
          onClick={() => {
            onConfirm();
            onOpenChange(false);
          }}
        >
          confirm-action
        </button>
        <button onClick={() => onOpenChange(false)}>cancel</button>
      </div>
    ) : null,
}));

// ─── Import under test ─────────────────────────────────────────────────────────

import { ProfileEditor } from './ProfileEditor';

// ─── Baseline profile ──────────────────────────────────────────────────────────

function makeEmptyProfile() {
  return {
    name: '',
    eid: '',
    university: 'The University of Texas at Austin',
    catalog_year: '2024',
    major: 'ece-bse',
    classification: '',
    first_semester: '',
    graduation_target: '',
    tech_core: { declared: '', status: '', required_math: '', required_ece: [] as string[], tech_electives_needed: 0 },
    secondary_aspirations: {
      math_ba: { status: '', notes: '' },
      advanced_math_cert: { status: '', notes: '' },
      jefferson_scholars_cert: { status: '', notes: '' },
    },
    preferences: { course_load: '', course_load_tolerance: 'above_average', time_preference: 'no_preference', summer_courses: false, summer_notes: '' },
    gpa: { cumulative: 0, lower_division: 0, upper_division: 0, gpa_hours: 0, grade_points: 0 },
    credit_summary: { total_hours_transferred: 0, total_hours_taken: 0, total_hours: 0 },
    completed_courses: [] as Array<{ course: string; title: string; grade: string; semester: string; type: string; credit_hours: number }>,
    in_progress_courses: [] as Array<{ course: string; title: string; semester: string; credit_hours: number }>,
    career_interests: [] as string[],
    notes: '',
  };
}

beforeEach(() => {
  mockUseOwnedProfile.mockReturnValue(makeEmptyProfile());
  mockFetchAndLoadDemo.mockResolvedValue({ ...makeEmptyProfile(), name: 'Adi H.' });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('ProfileEditor — renders', () => {
  it('renders Identity section heading', () => {
    render(<ProfileEditor />);
    expect(screen.getByText('Identity')).toBeDefined();
  });

  it('renders GPA section heading', () => {
    render(<ProfileEditor />);
    expect(screen.getByText('GPA')).toBeDefined();
  });

  it('renders Credit Summary section heading', () => {
    render(<ProfileEditor />);
    expect(screen.getByText('Credit Summary')).toBeDefined();
  });

  it('renders Tech Core Declaration heading', () => {
    render(<ProfileEditor />);
    expect(screen.getByText('Tech Core Declaration')).toBeDefined();
  });

  it('renders Career Interests heading', () => {
    render(<ProfileEditor />);
    expect(screen.getByText('Career Interests')).toBeDefined();
  });

  it('renders CourseListEditor', () => {
    render(<ProfileEditor />);
    expect(screen.getByTestId('course-list-editor')).toBeDefined();
  });

  it('renders "Load demo profile (Adi)" button', () => {
    render(<ProfileEditor />);
    expect(screen.getByLabelText('Load demo profile')).toBeDefined();
  });

  it('renders "Clear all / start fresh" button', () => {
    render(<ProfileEditor />);
    expect(screen.getByLabelText('Clear all data')).toBeDefined();
  });

  it('shows graduation_target note pointing to Academic section', () => {
    render(<ProfileEditor />);
    expect(screen.getByText(/Target graduation is set in/i)).toBeDefined();
  });
});

describe('ProfileEditor — identity field dispatch', () => {
  it('changing Name input dispatches UPDATE_PROFILE_FIELD with field=name', () => {
    render(<ProfileEditor />);
    fireEvent.change(document.getElementById('profile-name') as HTMLInputElement, {
      target: { value: 'Test User' },
    });
    expect(mockProfileDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'UPDATE_PROFILE_FIELD', field: 'name', value: 'Test User' })
    );
  });

  it('changing EID input dispatches UPDATE_PROFILE_FIELD with field=eid', () => {
    render(<ProfileEditor />);
    fireEvent.change(document.getElementById('profile-eid') as HTMLInputElement, {
      target: { value: 'abc123' },
    });
    expect(mockProfileDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'UPDATE_PROFILE_FIELD', field: 'eid', value: 'abc123' })
    );
  });
});

describe('ProfileEditor — GPA dispatch', () => {
  it('changing cumulative GPA dispatches UPDATE_PROFILE_FIELD with field=gpa', () => {
    render(<ProfileEditor />);
    fireEvent.change(document.getElementById('gpa-cumulative') as HTMLInputElement, {
      target: { value: '3.75' },
    });
    expect(mockProfileDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'UPDATE_PROFILE_FIELD',
        field: 'gpa',
        value: expect.objectContaining({ cumulative: 3.75 }),
      })
    );
  });

  it('invalid GPA input (non-numeric) coerces to 0', () => {
    render(<ProfileEditor />);
    fireEvent.change(document.getElementById('gpa-cumulative') as HTMLInputElement, {
      target: { value: 'abc' },
    });
    expect(mockProfileDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'UPDATE_PROFILE_FIELD',
        field: 'gpa',
        value: expect.objectContaining({ cumulative: 0 }),
      })
    );
  });
});

describe('ProfileEditor — credit summary dispatch', () => {
  it('changing total hours dispatches UPDATE_PROFILE_FIELD with field=credit_summary', () => {
    render(<ProfileEditor />);
    fireEvent.change(document.getElementById('credit-total') as HTMLInputElement, {
      target: { value: '45' },
    });
    expect(mockProfileDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'UPDATE_PROFILE_FIELD',
        field: 'credit_summary',
        value: expect.objectContaining({ total_hours: 45 }),
      })
    );
  });
});

describe('ProfileEditor — career interests', () => {
  it('shows "No career interests added yet." when list is empty', () => {
    render(<ProfileEditor />);
    expect(screen.getByText('No career interests added yet.')).toBeDefined();
  });

  it('typing and pressing Enter dispatches UPDATE_PROFILE_FIELD with career_interests', () => {
    render(<ProfileEditor />);
    const input = screen.getByLabelText('New career interest');
    fireEvent.change(input, { target: { value: 'VLSI' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(mockProfileDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'UPDATE_PROFILE_FIELD',
        field: 'career_interests',
        value: ['VLSI'],
      })
    );
  });

  it('shows existing interests when list is non-empty', () => {
    mockUseOwnedProfile.mockReturnValue({ ...makeEmptyProfile(), career_interests: ['embedded systems', 'VLSI'] });
    render(<ProfileEditor />);
    expect(screen.getByText('embedded systems')).toBeDefined();
    expect(screen.getByText('VLSI')).toBeDefined();
  });

  it('clicking remove dispatches UPDATE_PROFILE_FIELD without the removed interest', () => {
    mockUseOwnedProfile.mockReturnValue({ ...makeEmptyProfile(), career_interests: ['embedded systems', 'VLSI'] });
    render(<ProfileEditor />);
    fireEvent.click(screen.getByLabelText('Remove embedded systems'));
    expect(mockProfileDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'UPDATE_PROFILE_FIELD',
        field: 'career_interests',
        value: ['VLSI'],
      })
    );
  });
});

describe('ProfileEditor — course list editor wiring', () => {
  it('onAddCompleted triggers ADD_COMPLETED_COURSE dispatch', () => {
    render(<ProfileEditor />);
    fireEvent.click(screen.getByText('add-completed'));
    expect(mockProfileDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ADD_COMPLETED_COURSE' })
    );
  });

  it('onUpdateCompleted triggers UPDATE_COMPLETED_COURSE dispatch', () => {
    render(<ProfileEditor />);
    fireEvent.click(screen.getByText('update-completed'));
    expect(mockProfileDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'UPDATE_COMPLETED_COURSE', index: 0 })
    );
  });

  it('onRemoveCompleted triggers REMOVE_COMPLETED_COURSE dispatch', () => {
    render(<ProfileEditor />);
    fireEvent.click(screen.getByText('remove-completed'));
    expect(mockProfileDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'REMOVE_COMPLETED_COURSE', index: 0 })
    );
  });

  it('onAddInProgress triggers ADD_INPROGRESS_COURSE dispatch', () => {
    render(<ProfileEditor />);
    fireEvent.click(screen.getByText('add-inprogress'));
    expect(mockProfileDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ADD_INPROGRESS_COURSE' })
    );
  });

  it('onUpdateInProgress triggers UPDATE_INPROGRESS_COURSE dispatch', () => {
    render(<ProfileEditor />);
    fireEvent.click(screen.getByText('update-inprogress'));
    expect(mockProfileDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'UPDATE_INPROGRESS_COURSE', index: 0 })
    );
  });

  it('onRemoveInProgress triggers REMOVE_INPROGRESS_COURSE dispatch', () => {
    render(<ProfileEditor />);
    fireEvent.click(screen.getByText('remove-inprogress'));
    expect(mockProfileDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'REMOVE_INPROGRESS_COURSE', index: 0 })
    );
  });
});

describe('ProfileEditor — Load Demo confirm flow', () => {
  it('clicking "Load demo profile" button opens confirm dialog', () => {
    render(<ProfileEditor />);
    fireEvent.click(screen.getByLabelText('Load demo profile'));
    expect(screen.getByTestId('confirm-load-demo-profile-(adi)')).toBeDefined();
  });

  it('confirming Load Demo calls fetchAndLoadDemo and dispatches SET_PLAN', async () => {
    render(<ProfileEditor />);
    fireEvent.click(screen.getByLabelText('Load demo profile'));
    await act(async () => {
      fireEvent.click(screen.getByText('confirm-action'));
    });
    expect(mockFetchAndLoadDemo).toHaveBeenCalledWith(mockProfileDispatch);
    expect(mockPlanDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'SET_PLAN' })
    );
  });
});

describe('ProfileEditor — Clear confirm flow', () => {
  it('clicking "Clear all / start fresh" opens confirm dialog', () => {
    render(<ProfileEditor />);
    fireEvent.click(screen.getByLabelText('Clear all data'));
    expect(screen.getByTestId('confirm-clear-all-data')).toBeDefined();
  });

  it('confirming Clear dispatches CLEAR_PROFILE to profile and RESET_PLAN to plan', () => {
    render(<ProfileEditor />);
    fireEvent.click(screen.getByLabelText('Clear all data'));
    fireEvent.click(screen.getByText('confirm-action'));
    expect(mockProfileDispatch).toHaveBeenCalledWith({ type: 'CLEAR_PROFILE' });
    expect(mockPlanDispatch).toHaveBeenCalledWith({ type: 'RESET_PLAN' });
  });
});

// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { OnboardingWizard } from './OnboardingWizard';
import { DataProvider } from '@/context/DataContext';
import { SettingsProvider } from '@/context/SettingsContext';
import { PlanProvider } from '@/context/PlanContext';
import { ProfileProvider } from '@/context/ProfileContext';

afterEach(cleanup);

// Mock parse-transcript
vi.mock('@/lib/agent-tools/parse-transcript', () => ({
  parseTranscript: vi.fn().mockReturnValue([]),
  parseTranscriptTool: {
    fn: vi.fn().mockReturnValue({ content: { completed_courses: [] } }),
  },
}));

// Mock parse-ida
vi.mock('@/lib/parse-ida', () => ({
  parseIdaAudit: vi.fn().mockReturnValue([]),
}));

// Mock derive-timeline so we can assert what profile it was called with
vi.mock('@/lib/derive-timeline', () => ({
  deriveTimelinePlanFromProfile: vi.fn().mockReturnValue({}),
}));

// Capture dispatched PlanContext actions
const mockPlanDispatch = vi.fn();
vi.mock('@/context/PlanContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/context/PlanContext')>();
  return {
    ...actual,
    usePlanDispatch: () => mockPlanDispatch,
  };
});

// Capture dispatched SettingsContext actions
const mockSettingsDispatch = vi.fn();
vi.mock('@/context/SettingsContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/context/SettingsContext')>();
  return {
    ...actual,
    useSettingsDispatch: () => mockSettingsDispatch,
    useSettings: () => actual.DEFAULT_SETTINGS,
  };
});

// Capture dispatched ProfileContext actions
const mockProfileDispatch = vi.fn();
vi.mock('@/context/ProfileContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/context/ProfileContext')>();
  return {
    ...actual,
    useProfileDispatch: () => mockProfileDispatch,
  };
});

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <DataProvider>
      <ProfileProvider>
        <SettingsProvider>
          <PlanProvider>
            {ui}
          </PlanProvider>
        </SettingsProvider>
      </ProfileProvider>
    </DataProvider>
  );
}

// Helper: advance past step 1 (access code) using the inline Skip button
function skipAccessCodeStep() {
  fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
}

describe('OnboardingWizard', () => {
  it('renders the access code step as the first step', () => {
    renderWithProviders(<OnboardingWizard onComplete={vi.fn()} />);
    expect(screen.getByText('Beta access code')).toBeDefined();
    expect(screen.getByLabelText('Access code')).toBeDefined();
  });

  it('shows step 1 of 7 on the access code step', () => {
    renderWithProviders(<OnboardingWizard onComplete={vi.fn()} />);
    expect(screen.getByText('Step 1 of 7')).toBeDefined();
  });

  it('Enter button on access code step dispatches SET_ACCESS_CODE and advances', () => {
    mockSettingsDispatch.mockClear();
    renderWithProviders(<OnboardingWizard onComplete={vi.fn()} />);

    const input = screen.getByLabelText('Access code');
    fireEvent.change(input, { target: { value: 'test-code-abc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enter' }));

    expect(mockSettingsDispatch).toHaveBeenCalledWith({ type: 'SET_ACCESS_CODE', value: 'test-code-abc' });
    expect(screen.getByText('Confirm Major & Catalog')).toBeDefined();
  });

  it('Skip button on access code step does NOT dispatch SET_ACCESS_CODE and advances', () => {
    mockSettingsDispatch.mockClear();
    renderWithProviders(<OnboardingWizard onComplete={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));

    const setAccessCodeCalls = mockSettingsDispatch.mock.calls.filter(
      ([action]) => action.type === 'SET_ACCESS_CODE'
    );
    expect(setAccessCodeCalls).toHaveLength(0);
    expect(screen.getByText('Confirm Major & Catalog')).toBeDefined();
  });

  it('should render the major/catalog step after skipping access code', () => {
    renderWithProviders(<OnboardingWizard onComplete={vi.fn()} />);
    skipAccessCodeStep();
    expect(screen.getByText('Confirm Major & Catalog')).toBeDefined();
  });

  it('should navigate through the steps when Next is clicked', () => {
    renderWithProviders(<OnboardingWizard onComplete={vi.fn()} />);

    // Step 1 (access code) -> step 2
    skipAccessCodeStep();
    expect(screen.getByText('Confirm Major & Catalog')).toBeDefined();

    // Step 2 -> step 3
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Target Graduation')).toBeDefined();

    // Step 3 -> step 4
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Load Tolerance')).toBeDefined();
  });

  it('should skip to next step when global Skip is clicked (step 2+)', () => {
    renderWithProviders(<OnboardingWizard onComplete={vi.fn()} />);

    skipAccessCodeStep(); // step 1 -> 2
    fireEvent.click(screen.getByRole('button', { name: 'Skip' })); // step 2 -> 3
    expect(screen.getByText('Target Graduation')).toBeDefined();
  });

  it('should go back when Back is clicked', () => {
    renderWithProviders(<OnboardingWizard onComplete={vi.fn()} />);

    skipAccessCodeStep(); // step 1 -> 2
    fireEvent.click(screen.getByRole('button', { name: 'Next' })); // step 2 -> 3
    expect(screen.getByText('Target Graduation')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Back' })); // step 3 -> 2
    expect(screen.getByText('Confirm Major & Catalog')).toBeDefined();
  });

  it('should call onComplete when finishing the wizard', () => {
    const handleComplete = vi.fn();
    renderWithProviders(<OnboardingWizard onComplete={handleComplete} />);

    skipAccessCodeStep(); // 1->2
    fireEvent.click(screen.getByRole('button', { name: 'Skip' })); // 2->3
    fireEvent.click(screen.getByRole('button', { name: 'Skip' })); // 3->4
    fireEvent.click(screen.getByRole('button', { name: 'Skip' })); // 4->5
    fireEvent.click(screen.getByRole('button', { name: 'Skip' })); // 5->6
    fireEvent.click(screen.getByRole('button', { name: 'Next' })); // 6->7

    fireEvent.click(screen.getByRole('button', { name: 'Start Planning' }));
    expect(handleComplete).toHaveBeenCalledTimes(1);
  });

  it('dispatches SET_PROFILE_META with default major and catalogYear on commit', () => {
    mockPlanDispatch.mockClear();
    const handleComplete = vi.fn();
    renderWithProviders(<OnboardingWizard onComplete={handleComplete} />);

    skipAccessCodeStep(); // 1->2
    fireEvent.click(screen.getByRole('button', { name: 'Skip' })); // 2->3
    fireEvent.click(screen.getByRole('button', { name: 'Skip' })); // 3->4
    fireEvent.click(screen.getByRole('button', { name: 'Skip' })); // 4->5
    fireEvent.click(screen.getByRole('button', { name: 'Skip' })); // 5->6
    fireEvent.click(screen.getByRole('button', { name: 'Next' })); // 6->7 (empty transcript)

    fireEvent.click(screen.getByRole('button', { name: 'Start Planning' }));

    expect(mockPlanDispatch).toHaveBeenCalledWith({
      type: 'SET_PROFILE_META',
      major: 'ece-bse',
      catalogYear: '2024',
    });
  });

  it('dispatches SET_PROFILE with mapped completed/in-progress courses on commit', async () => {
    const { parseTranscript } = await import('@/lib/agent-tools/parse-transcript');
    const mockParse = parseTranscript as ReturnType<typeof vi.fn>;
    mockParse.mockReturnValueOnce([
      { courseId: 'ECE 302', title: 'Intro to Electrical Eng', grade: 'A', semester: 'Fall 2025', creditHours: 3 },
      { courseId: 'ECE 306', title: 'Control Systems', grade: 'IP', semester: 'Spring 2026', creditHours: 3 },
    ]);

    mockProfileDispatch.mockClear();
    mockPlanDispatch.mockClear();
    const handleComplete = vi.fn();
    renderWithProviders(<OnboardingWizard onComplete={handleComplete} />);

    skipAccessCodeStep(); // 1->2
    fireEvent.click(screen.getByRole('button', { name: 'Skip' })); // 2->3
    fireEvent.click(screen.getByRole('button', { name: 'Skip' })); // 3->4
    fireEvent.click(screen.getByRole('button', { name: 'Skip' })); // 4->5
    fireEvent.click(screen.getByRole('button', { name: 'Skip' })); // 5->6

    const textarea = screen.getByPlaceholderText(/ECE 302/);
    fireEvent.change(textarea, { target: { value: 'ECE 302 Intro to Electrical Eng A Fall 2025 3' } });

    fireEvent.click(screen.getByRole('button', { name: 'Next' })); // 6->7

    fireEvent.click(screen.getByRole('button', { name: 'Start Planning' }));

    // SET_PROFILE should be dispatched with the mapped courses
    const setProfileCall = mockProfileDispatch.mock.calls.find(
      ([action]) => action.type === 'SET_PROFILE'
    );
    expect(setProfileCall).toBeDefined();
    const profile = setProfileCall![0].profile;
    expect(profile.major).toBe('ece-bse');
    expect(profile.catalog_year).toBe('2024');
    // ECE 302 (grade A) -> completed_courses
    expect(profile.completed_courses).toHaveLength(1);
    expect(profile.completed_courses[0]).toEqual({
      course: 'ECE 302',
      title: 'Intro to Electrical Eng',
      grade: 'A',
      semester: 'Fall 2025',
      type: 'Imported',
      credit_hours: 3,
    });
    // ECE 306 (grade IP) -> in_progress_courses
    expect(profile.in_progress_courses).toHaveLength(1);
    expect(profile.in_progress_courses[0]).toEqual({
      course: 'ECE 306',
      title: 'Control Systems',
      semester: 'Spring 2026',
      credit_hours: 3,
    });
  });

  it('dispatches SET_PLAN after SET_PROFILE on commit', async () => {
    const { parseTranscript } = await import('@/lib/agent-tools/parse-transcript');
    const mockParse = parseTranscript as ReturnType<typeof vi.fn>;
    mockParse.mockReturnValueOnce([
      { courseId: 'ECE 302', title: 'Intro to Electrical Eng', grade: 'A', semester: 'Fall 2025', creditHours: 3 },
    ]);

    mockProfileDispatch.mockClear();
    mockPlanDispatch.mockClear();
    renderWithProviders(<OnboardingWizard onComplete={vi.fn()} />);

    skipAccessCodeStep(); // 1->2
    fireEvent.click(screen.getByRole('button', { name: 'Skip' })); // 2->3
    fireEvent.click(screen.getByRole('button', { name: 'Skip' })); // 3->4
    fireEvent.click(screen.getByRole('button', { name: 'Skip' })); // 4->5
    fireEvent.click(screen.getByRole('button', { name: 'Skip' })); // 5->6

    const textarea = screen.getByPlaceholderText(/ECE 302/);
    fireEvent.change(textarea, { target: { value: 'ECE 302 Intro to Electrical Eng A Fall 2025 3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' })); // 6->7

    fireEvent.click(screen.getByRole('button', { name: 'Start Planning' }));

    // SET_PLAN should be dispatched (derived from the profile)
    const setPlanCall = mockPlanDispatch.mock.calls.find(
      ([action]) => action.type === 'SET_PLAN'
    );
    expect(setPlanCall).toBeDefined();
    // ADD_COURSE must NOT be dispatched (legacy path replaced)
    const addCourseCalls = mockPlanDispatch.mock.calls.filter(
      ([action]) => action.type === 'ADD_COURSE'
    );
    expect(addCourseCalls).toHaveLength(0);
  });

  it('routes to parseIdaAudit when IDA source is selected', async () => {
    const { parseIdaAudit } = await import('@/lib/parse-ida');
    const mockIda = parseIdaAudit as ReturnType<typeof vi.fn>;
    mockIda.mockReturnValueOnce([
      { courseId: 'ECE 302', title: 'Intro EE', grade: 'A', semester: 'Fall 2025', creditHours: 3 },
    ]);

    mockProfileDispatch.mockClear();
    renderWithProviders(<OnboardingWizard onComplete={vi.fn()} />);

    skipAccessCodeStep(); // 1->2
    fireEvent.click(screen.getByRole('button', { name: 'Skip' })); // 2->3
    fireEvent.click(screen.getByRole('button', { name: 'Skip' })); // 3->4
    fireEvent.click(screen.getByRole('button', { name: 'Skip' })); // 4->5
    fireEvent.click(screen.getByRole('button', { name: 'Skip' })); // 5->6

    // Switch to IDA mode
    fireEvent.click(screen.getByRole('button', { name: 'IDA Audit' }));

    const textarea = screen.getByPlaceholderText(/ECE 302/);
    fireEvent.change(textarea, { target: { value: 'ECE 302  Intro EE  A  FA 2025  3.0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' })); // triggers handleParseTranscript

    // parseIdaAudit should have been called (not parseTranscript)
    expect(mockIda).toHaveBeenCalled();
  });

  it('review step shows completed and in-progress counts separately', async () => {
    const { parseTranscript } = await import('@/lib/agent-tools/parse-transcript');
    const mockParse = parseTranscript as ReturnType<typeof vi.fn>;
    mockParse.mockReturnValueOnce([
      { courseId: 'ECE 302', title: 'Intro EE', grade: 'A', semester: 'Fall 2025', creditHours: 3 },
      { courseId: 'ECE 306', title: 'Control Systems', grade: 'B', semester: 'Fall 2025', creditHours: 3 },
      { courseId: 'ECE 319H', title: 'Circuits', grade: 'IP', semester: 'Spring 2026', creditHours: 3 },
    ]);

    renderWithProviders(<OnboardingWizard onComplete={vi.fn()} />);

    skipAccessCodeStep(); // 1->2
    fireEvent.click(screen.getByRole('button', { name: 'Skip' })); // 2->3
    fireEvent.click(screen.getByRole('button', { name: 'Skip' })); // 3->4
    fireEvent.click(screen.getByRole('button', { name: 'Skip' })); // 4->5
    fireEvent.click(screen.getByRole('button', { name: 'Skip' })); // 5->6

    const textarea = screen.getByPlaceholderText(/ECE 302/);
    fireEvent.change(textarea, { target: { value: 'ECE 302 Intro EE A Fall 2025 3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' })); // 6->7

    // Review step: should show 2 completed and 1 in-progress
    expect(screen.getByText('Completed courses')).toBeDefined();
    expect(screen.getByText('In-progress courses')).toBeDefined();
    // Find badges by their adjacent label text
    const completedLabel = screen.getByText('Completed courses');
    const completedRow = completedLabel.closest('div');
    expect(completedRow?.textContent).toContain('2');
    const inProgressLabel = screen.getByText('In-progress courses');
    const inProgressRow = inProgressLabel.closest('div');
    expect(inProgressRow?.textContent).toContain('1');
  });
});

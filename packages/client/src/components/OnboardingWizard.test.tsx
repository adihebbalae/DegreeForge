// @vitest-environment jsdom
// TASK-105: Wizard reflowed to 5 steps (grad_target, load_tolerance, tech_core, import, review).
// access_code and major_catalog steps removed from the first-run flow.
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

// Spy on the analytics wrapper so we can assert the onboarding_completed event
const mockTrack = vi.fn();
vi.mock('@/lib/analytics', () => ({
  track: (...args: unknown[]) => mockTrack(...args),
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

// Helper: skip through steps to reach the import step (step 4)
function skipToImportStep() {
  // step 1 grad_target -> 2
  fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
  // step 2 load_tolerance -> 3
  fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
  // step 3 tech_core -> 4
  fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
}

describe('OnboardingWizard (TASK-105 5-step flow)', () => {
  it('renders the grad_target step as the first step', () => {
    renderWithProviders(<OnboardingWizard onComplete={vi.fn()} />);
    expect(screen.getByText('Target Graduation')).toBeDefined();
  });

  it('shows step 1 of 5 on the first step', () => {
    renderWithProviders(<OnboardingWizard onComplete={vi.fn()} />);
    expect(screen.getByText('Step 1 of 5')).toBeDefined();
  });

  it('does NOT render the access code step', () => {
    renderWithProviders(<OnboardingWizard onComplete={vi.fn()} />);
    expect(screen.queryByText('Beta access code')).toBeNull();
    expect(screen.queryByLabelText('Access code')).toBeNull();
  });

  it('does NOT render the Confirm Major & Catalog step', () => {
    renderWithProviders(<OnboardingWizard onComplete={vi.fn()} />);
    // Step 1 is grad_target — major/catalog step is gone
    expect(screen.queryByText('Confirm Major & Catalog')).toBeNull();
  });

  it('Next advances from grad_target to load_tolerance', () => {
    renderWithProviders(<OnboardingWizard onComplete={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Load Tolerance')).toBeDefined();
  });

  it('Skip advances from step 1 to step 2', () => {
    renderWithProviders(<OnboardingWizard onComplete={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(screen.getByText('Load Tolerance')).toBeDefined();
  });

  it('should navigate through all steps', () => {
    renderWithProviders(<OnboardingWizard onComplete={vi.fn()} />);

    // Step 1 (grad_target) -> step 2
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Load Tolerance')).toBeDefined();

    // Step 2 -> step 3
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Tech Core Preference')).toBeDefined();

    // Step 3 -> step 4
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Import Course History (Optional)')).toBeDefined();
  });

  it('should go back when Back is clicked', () => {
    renderWithProviders(<OnboardingWizard onComplete={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Next' })); // step 1 -> 2
    expect(screen.getByText('Load Tolerance')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Back' })); // step 2 -> 1
    expect(screen.getByText('Target Graduation')).toBeDefined();
  });

  it('Back is disabled on step 1', () => {
    renderWithProviders(<OnboardingWizard onComplete={vi.fn()} />);
    const backBtn = screen.getByRole('button', { name: 'Back' });
    expect(backBtn).toBeDefined();
    expect((backBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('should call onComplete when finishing the wizard', () => {
    const handleComplete = vi.fn();
    renderWithProviders(<OnboardingWizard onComplete={handleComplete} />);

    fireEvent.click(screen.getByRole('button', { name: 'Skip' })); // 1->2
    fireEvent.click(screen.getByRole('button', { name: 'Skip' })); // 2->3
    fireEvent.click(screen.getByRole('button', { name: 'Skip' })); // 3->4
    fireEvent.click(screen.getByRole('button', { name: 'Next' })); // 4->5 (empty transcript)

    fireEvent.click(screen.getByRole('button', { name: 'Start Planning' }));
    expect(handleComplete).toHaveBeenCalledTimes(1);
  });

  it('calls onDismiss when the close button is clicked', () => {
    const handleDismiss = vi.fn();
    renderWithProviders(<OnboardingWizard onComplete={vi.fn()} onDismiss={handleDismiss} />);

    fireEvent.click(screen.getByRole('button', { name: 'Close setup' }));
    expect(handleDismiss).toHaveBeenCalledTimes(1);
  });

  it('does not show close button when onDismiss is not provided', () => {
    renderWithProviders(<OnboardingWizard onComplete={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Close setup' })).toBeNull();
  });

  it('fires the onboarding_completed event on finish', () => {
    mockTrack.mockClear();
    renderWithProviders(<OnboardingWizard onComplete={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Skip' })); // 1->2
    fireEvent.click(screen.getByRole('button', { name: 'Skip' })); // 2->3
    fireEvent.click(screen.getByRole('button', { name: 'Skip' })); // 3->4
    fireEvent.click(screen.getByRole('button', { name: 'Next' })); // 4->5

    fireEvent.click(screen.getByRole('button', { name: 'Start Planning' }));

    expect(mockTrack).toHaveBeenCalledWith('onboarding_completed');
  });

  // TASK-106: onboarding_started fires once on mount
  it('fires onboarding_started once on mount', () => {
    mockTrack.mockClear();
    renderWithProviders(<OnboardingWizard onComplete={vi.fn()} />);

    const startedCalls = mockTrack.mock.calls.filter(([event]) => event === 'onboarding_started');
    expect(startedCalls).toHaveLength(1);
  });

  // TASK-106: onboarding_step_viewed fires with correct step + name on step change
  it('fires onboarding_step_viewed with step and name when step changes', () => {
    mockTrack.mockClear();
    renderWithProviders(<OnboardingWizard onComplete={vi.fn()} />);

    // Step 1 fires immediately on mount (via the step useEffect)
    const step1Views = mockTrack.mock.calls.filter(
      ([event, props]) => event === 'onboarding_step_viewed' && props?.step === 1 && props?.name === 'grad_target'
    );
    expect(step1Views).toHaveLength(1);

    // Advance to step 2
    mockTrack.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Skip' })); // 1->2

    const step2Views = mockTrack.mock.calls.filter(
      ([event, props]) => event === 'onboarding_step_viewed' && props?.step === 2 && props?.name === 'load_tolerance'
    );
    expect(step2Views).toHaveLength(1);
  });

  // TASK-106: import events — attempted + parsed on success
  it('fires onboarding_import_attempted and onboarding_import_parsed on successful parse', async () => {
    const { parseTranscript } = await import('@/lib/agent-tools/parse-transcript');
    const mockParse = parseTranscript as ReturnType<typeof vi.fn>;
    mockParse.mockReturnValueOnce([
      { courseId: 'ECE 302', title: 'Intro EE', grade: 'A', semester: 'Fall 2025', creditHours: 3 },
    ]);

    mockTrack.mockClear();
    renderWithProviders(<OnboardingWizard onComplete={vi.fn()} />);

    skipToImportStep(); // reach step 4

    const textarea = screen.getByPlaceholderText(/ECE 302/);
    fireEvent.change(textarea, { target: { value: 'ECE 302 Intro EE A Fall 2025 3' } });

    mockTrack.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Next' })); // triggers handleParseTranscript

    expect(mockTrack).toHaveBeenCalledWith('onboarding_import_attempted', { source: 'transcript' });
    expect(mockTrack).toHaveBeenCalledWith('onboarding_import_parsed', { source: 'transcript', count: 1 });
    // failed must NOT fire on success
    const failedCalls = mockTrack.mock.calls.filter(([event]) => event === 'onboarding_import_failed');
    expect(failedCalls).toHaveLength(0);
  });

  // TASK-106: import events — attempted + failed when parser returns empty list
  it('fires onboarding_import_attempted and onboarding_import_failed when parser returns 0 courses', async () => {
    const { parseTranscript } = await import('@/lib/agent-tools/parse-transcript');
    const mockParse = parseTranscript as ReturnType<typeof vi.fn>;
    mockParse.mockReturnValueOnce([]); // empty result -> failure

    mockTrack.mockClear();
    renderWithProviders(<OnboardingWizard onComplete={vi.fn()} />);

    skipToImportStep(); // reach step 4

    const textarea = screen.getByPlaceholderText(/ECE 302/);
    fireEvent.change(textarea, { target: { value: 'garbage text that wont parse' } });

    mockTrack.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Next' })); // triggers handleParseTranscript

    expect(mockTrack).toHaveBeenCalledWith('onboarding_import_attempted', { source: 'transcript' });
    expect(mockTrack).toHaveBeenCalledWith('onboarding_import_failed', { source: 'transcript' });
    // parsed must NOT fire on failure
    const parsedCalls = mockTrack.mock.calls.filter(([event]) => event === 'onboarding_import_parsed');
    expect(parsedCalls).toHaveLength(0);
  });

  it('dispatches SET_PROFILE_META with default major and catalogYear on commit', () => {
    mockPlanDispatch.mockClear();
    const handleComplete = vi.fn();
    renderWithProviders(<OnboardingWizard onComplete={handleComplete} />);

    fireEvent.click(screen.getByRole('button', { name: 'Skip' })); // 1->2
    fireEvent.click(screen.getByRole('button', { name: 'Skip' })); // 2->3
    fireEvent.click(screen.getByRole('button', { name: 'Skip' })); // 3->4
    fireEvent.click(screen.getByRole('button', { name: 'Next' })); // 4->5 (empty transcript)

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

    skipToImportStep(); // reach step 4

    const textarea = screen.getByPlaceholderText(/ECE 302/);
    fireEvent.change(textarea, { target: { value: 'ECE 302 Intro to Electrical Eng A Fall 2025 3' } });

    fireEvent.click(screen.getByRole('button', { name: 'Next' })); // 4->5

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

    skipToImportStep(); // reach step 4

    const textarea = screen.getByPlaceholderText(/ECE 302/);
    fireEvent.change(textarea, { target: { value: 'ECE 302 Intro to Electrical Eng A Fall 2025 3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' })); // 4->5

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

    skipToImportStep(); // reach step 4

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

    skipToImportStep(); // reach step 4

    const textarea = screen.getByPlaceholderText(/ECE 302/);
    fireEvent.change(textarea, { target: { value: 'ECE 302 Intro EE A Fall 2025 3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' })); // 4->5

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

  it('review step shows catalog year selector with default 2024', () => {
    renderWithProviders(<OnboardingWizard onComplete={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Skip' })); // 1->2
    fireEvent.click(screen.getByRole('button', { name: 'Skip' })); // 2->3
    fireEvent.click(screen.getByRole('button', { name: 'Skip' })); // 3->4
    fireEvent.click(screen.getByRole('button', { name: 'Next' })); // 4->5

    // Review step shows catalog year
    expect(screen.getByText('Catalog Year')).toBeDefined();
  });
});

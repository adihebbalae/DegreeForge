// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { OnboardingWizard } from './OnboardingWizard';
import { DataProvider } from '@/context/DataContext';
import { SettingsProvider } from '@/context/SettingsContext';
import { PlanProvider } from '@/context/PlanContext';

afterEach(cleanup);

// Mock parse-transcript to expose the pure function
vi.mock('@/lib/agent-tools/parse-transcript', () => ({
  parseTranscript: vi.fn().mockReturnValue([]),
  parseTranscriptTool: {
    fn: vi.fn().mockReturnValue({ content: { completed_courses: [] } }),
  },
}));

// Capture dispatched PlanContext actions so we can assert on them
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

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <DataProvider>
      <SettingsProvider>
        <PlanProvider>
          {ui}
        </PlanProvider>
      </SettingsProvider>
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

  it('dispatches ADD_COURSE for each parsed transcript course on commit', async () => {
    const { parseTranscript } = await import('@/lib/agent-tools/parse-transcript');
    const mockParse = parseTranscript as ReturnType<typeof vi.fn>;
    mockParse.mockReturnValueOnce([
      { courseId: 'ECE 302', title: 'Intro to Electrical Eng', grade: 'A', semester: 'Fall 2025', creditHours: 3 },
      { courseId: 'ECE 306', title: 'Control Systems', grade: 'B+', semester: 'Spring 2099', creditHours: 3 },
    ]);

    mockPlanDispatch.mockClear();
    const handleComplete = vi.fn();
    renderWithProviders(<OnboardingWizard onComplete={handleComplete} />);

    // Navigate to step 6 (transcript)
    skipAccessCodeStep(); // 1->2
    fireEvent.click(screen.getByRole('button', { name: 'Skip' })); // 2->3
    fireEvent.click(screen.getByRole('button', { name: 'Skip' })); // 3->4
    fireEvent.click(screen.getByRole('button', { name: 'Skip' })); // 4->5
    fireEvent.click(screen.getByRole('button', { name: 'Skip' })); // 5->6

    // Type something in the transcript textarea so parse is triggered
    const textarea = screen.getByPlaceholderText(/ECE 302/);
    fireEvent.change(textarea, { target: { value: 'ECE 302 Intro to Electrical Eng A Fall 2025 3' } });

    // Click Next on step 6 — triggers handleParseTranscript
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    // Now on step 7, commit
    fireEvent.click(screen.getByRole('button', { name: 'Start Planning' }));

    // ECE 302 -> semester 'Fall 2025' (valid), ECE 306 -> 'Spring 2099' unknown -> fallback past semester
    const addCourseDispatches = mockPlanDispatch.mock.calls.filter(
      ([action]) => action.type === 'ADD_COURSE'
    );
    expect(addCourseDispatches).toHaveLength(2);
    expect(addCourseDispatches[0][0]).toEqual({ type: 'ADD_COURSE', semesterId: 'Fall 2025', courseId: 'ECE 302' });
    // 'Spring 2099' is not in SEMESTERS, so it falls back to the earliest past semester
    expect(addCourseDispatches[1][0].type).toBe('ADD_COURSE');
    expect(addCourseDispatches[1][0].courseId).toBe('ECE 306');
    expect(addCourseDispatches[1][0].semesterId).not.toBe('Spring 2099');
  });
});

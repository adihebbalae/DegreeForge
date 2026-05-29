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

describe('OnboardingWizard', () => {
  it('should render the first step initially', () => {
    renderWithProviders(<OnboardingWizard onComplete={vi.fn()} />);
    expect(screen.getByText('Confirm Major & Catalog')).toBeDefined();
  });

  it('should navigate through the steps when Next is clicked', () => {
    renderWithProviders(<OnboardingWizard onComplete={vi.fn()} />);

    // Step 1
    fireEvent.click(screen.getByText('Next'));
    expect(screen.getByText('Target Graduation')).toBeDefined();

    // Step 2
    fireEvent.click(screen.getByText('Next'));
    expect(screen.getByText('Load Tolerance')).toBeDefined();
  });

  it('should skip to next step when Skip is clicked', () => {
    renderWithProviders(<OnboardingWizard onComplete={vi.fn()} />);

    // Step 1
    fireEvent.click(screen.getByText('Skip'));
    expect(screen.getByText('Target Graduation')).toBeDefined();
  });

  it('should go back when Back is clicked', () => {
    renderWithProviders(<OnboardingWizard onComplete={vi.fn()} />);

    // Step 1 -> Step 2
    fireEvent.click(screen.getByText('Next'));
    expect(screen.getByText('Target Graduation')).toBeDefined();

    // Step 2 -> Step 1
    fireEvent.click(screen.getByText('Back'));
    expect(screen.getByText('Confirm Major & Catalog')).toBeDefined();
  });

  it('should call onComplete when finishing the wizard', () => {
    const handleComplete = vi.fn();
    renderWithProviders(<OnboardingWizard onComplete={handleComplete} />);

    // Skip through to step 6
    fireEvent.click(screen.getByText('Skip')); // 2
    fireEvent.click(screen.getByText('Skip')); // 3
    fireEvent.click(screen.getByText('Skip')); // 4
    fireEvent.click(screen.getByText('Skip')); // 5
    fireEvent.click(screen.getByText('Next')); // 6

    // Click Start Planning
    fireEvent.click(screen.getByText('Start Planning'));
    expect(handleComplete).toHaveBeenCalledTimes(1);
  });

  it('dispatches SET_PROFILE_META with default major and catalogYear on commit', () => {
    mockPlanDispatch.mockClear();
    const handleComplete = vi.fn();
    renderWithProviders(<OnboardingWizard onComplete={handleComplete} />);

    // Skip through to step 6 (step 5 uses Next button, which calls handleParseTranscript)
    fireEvent.click(screen.getByText('Skip')); // 1→2
    fireEvent.click(screen.getByText('Skip')); // 2→3
    fireEvent.click(screen.getByText('Skip')); // 3→4
    fireEvent.click(screen.getByText('Skip')); // 4→5
    fireEvent.click(screen.getByText('Next')); // 5→6 (empty transcript, calls handleNext directly)

    fireEvent.click(screen.getByText('Start Planning'));

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

    // Navigate to step 5 (transcript)
    fireEvent.click(screen.getByText('Skip')); // 1→2
    fireEvent.click(screen.getByText('Skip')); // 2→3
    fireEvent.click(screen.getByText('Skip')); // 3→4
    fireEvent.click(screen.getByText('Skip')); // 4→5

    // Type something in the transcript textarea so parse is triggered
    const textarea = screen.getByPlaceholderText(/ECE 302/);
    fireEvent.change(textarea, { target: { value: 'ECE 302 Intro to Electrical Eng A Fall 2025 3' } });

    // Click Next on step 5 — triggers handleParseTranscript
    fireEvent.click(screen.getByText('Next'));

    // Now on step 6, commit
    fireEvent.click(screen.getByText('Start Planning'));

    // ECE 302 → semester 'Fall 2025' (valid), ECE 306 → 'Spring 2099' unknown → fallback past semester
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

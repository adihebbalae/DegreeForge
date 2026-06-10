/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { ProgressBars } from './ProgressBars';

vi.mock('@/lib/progress', () => ({
  computeProgress: vi.fn(() => ({
    totalHours: 42,
    totalHoursTarget: 128,
    eceCoreCompleted: 14,
    eceCoreTotal: 21,
    genEdCompleted: 5,
    genEdTotal: 8,
    techCoreCompleted: 2,
    techCoreTotal: 8,
    electiveHours: 0,
    electiveTotalHours: 11,
    mathBACompleted: 1,
    mathBATotal: 6,
  }))
}));

vi.mock('@/context/PlanContext', () => ({
  usePlan: () => ({}),
  useTechCoreId: () => 'software_engineering',
  useMathBAToggle: () => true,
  useWhatIf: () => ({ isActive: false, techCoreId: 'software_engineering', mathBAToggle: true })
}));

vi.mock('@/context/DataContext', () => ({
  useCatalogRecord: () => ({}),
  usePrereqGraph: () => ({ nodes: {}, edges: [] }),
  useDegreeRequirements: () => ({ ece_core: { courses: [] } }),
  useUserProfile: () => ({ completed_courses: [] }),
  useTechCoresRecord: () => ({ software_engineering: { name: 'Software Engineering' } })
}));

// Mock the UI tooltip components
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: any) => <div>{children}</div>,
  TooltipTrigger: ({ children }: any) => <div>{children}</div>,
  TooltipContent: ({ children }: any) => <div>{children}</div>,
  TooltipProvider: ({ children }: any) => <div>{children}</div>,
}));

describe('ProgressBars', () => {
  it('renders segmented progress bars', () => {
    const { getByText } = render(<ProgressBars />);
    expect(getByText('42 / 128 hrs')).toBeDefined();
  });
});

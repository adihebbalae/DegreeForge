// @vitest-environment jsdom
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SplitView } from './SplitView';

const sampleSemesters = [
  { id: 'Fall 2025', label: "Fall '25", status: 'past' as const, year: 2025, season: 'Fall' as const },
  { id: 'Spring 2026', label: "Sp '26", status: 'current' as const, year: 2026, season: 'Spring' as const },
];

const sampleSnapshots = [
  {
    id: 'snap-1',
    name: 'Snapshot 1',
    plan: { 'Fall 2025': ['ECE 302', 'ECE 306'], 'Spring 2026': [] },
    createdAt: 1700000000000,
  },
  {
    id: 'snap-2',
    name: 'Snapshot 2',
    plan: { 'Fall 2025': ['ECE 302'], 'Spring 2026': ['ECE 312H'] },
    createdAt: 1700001000000,
  },
];

const currentPlan: Record<string, string[]> = {
  'Fall 2025': ['ECE 302'],
  'Spring 2026': ['ECE 319H'],
};

vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('./ComparisonToggle', () => ({
  ComparisonToggle: () => <div data-testid="comparison-toggle-mock">Toggle</div>,
}));

vi.mock('@/components/ui/select', () => ({
  Select: ({ children, onValueChange, value }: { children: React.ReactNode; onValueChange: (v: string) => void; value: string }) => (
    <div data-testid="snapshot-picker" data-value={value}>
      {children}
    </div>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  SelectValue: ({ placeholder }: { placeholder: string }) => <span>{placeholder}</span>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => (
    <div data-testid={`option-${value}`}>{children}</div>
  ),
}));

vi.mock('@/context/PlanContext', () => ({
  useSnapshots: vi.fn(),
  usePlan: vi.fn(),
  useSemesters: vi.fn(),
}));

vi.mock('@/lib/plan-diff', () => ({
  computePlanDiff: vi.fn(() => ({ added: [], removed: [], moved: [] })),
}));

import * as PlanContext from '@/context/PlanContext';
import * as PlanDiff from '@/lib/plan-diff';

afterEach(cleanup);

describe('SplitView — empty state (no snapshots)', () => {
  beforeEach(() => {
    vi.mocked(PlanContext.useSnapshots).mockReturnValue([]);
    vi.mocked(PlanContext.usePlan).mockReturnValue(currentPlan);
    vi.mocked(PlanContext.useSemesters).mockReturnValue(sampleSemesters);
    vi.mocked(PlanDiff.computePlanDiff).mockReturnValue({ added: [], removed: [], moved: [] });
  });

  it('renders the Split View heading', () => {
    render(<SplitView />);
    expect(screen.getByText('Split View Comparison')).toBeTruthy();
  });

  it('shows "No Snapshot" label on right pane when no snapshots exist', () => {
    render(<SplitView />);
    expect(screen.queryAllByText('No Snapshot')[0]).toBeTruthy();
  });

  it('does not render the snapshot picker when there are no snapshots', () => {
    render(<SplitView />);
    expect(screen.queryAllByTestId('snapshot-picker')).toHaveLength(0);
  });
});

describe('SplitView — with snapshots', () => {
  beforeEach(() => {
    vi.mocked(PlanContext.useSnapshots).mockReturnValue(sampleSnapshots);
    vi.mocked(PlanContext.usePlan).mockReturnValue(currentPlan);
    vi.mocked(PlanContext.useSemesters).mockReturnValue(sampleSemesters);
    vi.mocked(PlanDiff.computePlanDiff).mockReturnValue({ added: [], removed: [], moved: [] });
  });

  it('renders both pane headers', () => {
    render(<SplitView />);
    expect(screen.getByText('Current Plan')).toBeTruthy();
    expect(screen.queryAllByText('Snapshot 1').length).toBeGreaterThan(0);
  });

  it('renders the snapshot picker when snapshots exist', () => {
    render(<SplitView />);
    expect(screen.queryByTestId('snapshot-picker')).toBeTruthy();
  });

  it('snapshot picker shows all available snapshot options', () => {
    render(<SplitView />);
    expect(screen.queryByTestId('option-snap-1')).toBeTruthy();
    expect(screen.queryByTestId('option-snap-2')).toBeTruthy();
  });

  it('picker defaults to first snapshot id', () => {
    render(<SplitView />);
    const pickers = screen.getAllByTestId('snapshot-picker');
    expect(pickers[0].getAttribute('data-value')).toBe('snap-1');
  });
});

describe('SplitView — compare mode with diff results', () => {
  beforeEach(() => {
    vi.mocked(PlanContext.useSnapshots).mockReturnValue(sampleSnapshots);
    vi.mocked(PlanContext.usePlan).mockReturnValue(currentPlan);
    vi.mocked(PlanContext.useSemesters).mockReturnValue(sampleSemesters);
    vi.mocked(PlanDiff.computePlanDiff).mockReturnValue({
      added: [{ courseId: 'ECE 306', semester: 'Fall 2025' }],
      removed: [{ courseId: 'ECE 319H', semester: 'Spring 2026' }],
      moved: [],
    });
  });

  it('calls computePlanDiff with the current plan and right snapshot plan', () => {
    render(<SplitView />);
    expect(vi.mocked(PlanDiff.computePlanDiff)).toHaveBeenCalledWith(currentPlan, sampleSnapshots[0].plan);
  });

  it('renders courses from the current plan (ECE 302 in left pane)', () => {
    render(<SplitView />);
    // ECE 302 is in both current plan and snapshot 1, so it appears in both panes
    expect(screen.queryAllByText('ECE 302').length).toBeGreaterThan(0);
  });

  it('renders courses from the snapshot plan (ECE 306 in right pane)', () => {
    render(<SplitView />);
    // ECE 306 is in snapshot 1 but not current plan, appears in right pane
    expect(screen.queryByText('ECE 306')).toBeTruthy();
  });
});

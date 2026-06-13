// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { OptimizeMode } from '@/lib/solver';

// Spy on the analytics wrapper.
const mockTrack = vi.fn();
vi.mock('@/lib/analytics', () => ({
  track: (...args: unknown[]) => mockTrack(...args),
}));

// react-router useNavigate must not require a real router in this isolated test.
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

// Data context hooks — return minimal truthy values so handleRecommendPlan's
// guard passes and runPlan() executes.
vi.mock('@/context/DataContext', () => ({
  useDegreeRequirements: () => ({}),
  useTechCoresRecord: () => ({ 'ca-es': { name: 'CA&ES' } }),
  useMathRequirements: () => ({}),
  useCatalogRecord: () => ({}),
  useOfferingSchedule: () => ({}),
}));

// Plan context hooks — empty future plan so handleRecommendPlan -> runPlan
// directly (no confirm dialog).
const mockDispatch = vi.fn();
vi.mock('@/context/PlanContext', () => ({
  usePlanDispatch: () => mockDispatch,
  useTechCoreId: () => 'ca-es',
  useMathBAToggle: () => false,
  useSemesters: () => [{ id: 'fall-2026', label: 'Fall 2026', status: 'future' }],
  usePlan: () => ({ 'fall-2026': [] }),
  usePinnedCourses: () => [],
}));

vi.mock('@/hooks/usePrereqGraph', () => ({
  usePrereqGraph: () => ({ nodes: {}, edges: [] }),
}));

vi.mock('@/hooks/useEffectiveProfile', () => ({
  useEffectiveProfile: () => ({ completed_courses: [], in_progress_courses: [] }),
}));

// generateAutoPlan returns an empty, well-formed result so runPlan completes
// after firing the event.
vi.mock('@/lib/auto-planner', () => ({
  generateAutoPlan: () => ({ plan: {}, unplacedCourses: [], warnings: [] }),
}));

// optimizeMode is driven per-test via this controllable mock of useUi.
let currentMode: OptimizeMode = 'fastest';
vi.mock('@/context/UiContext', () => ({
  useUi: () => ({ optimizeMode: currentMode }),
}));

import { useRecommendPlan } from './useRecommendPlan';

describe('useRecommendPlan → plan_recommended event', () => {
  beforeEach(() => {
    mockTrack.mockClear();
  });

  it("fires plan_recommended { mode: 'fastest' } on recommend", () => {
    currentMode = 'fastest';
    const { result } = renderHook(() => useRecommendPlan());
    act(() => {
      result.current.handleRecommendPlan();
    });
    expect(mockTrack).toHaveBeenCalledWith('plan_recommended', { mode: 'fastest' });
  });

  it("fires plan_recommended { mode: 'easiest' } when optimize mode is easiest", () => {
    currentMode = 'easiest';
    const { result } = renderHook(() => useRecommendPlan());
    act(() => {
      result.current.handleRecommendPlan();
    });
    expect(mockTrack).toHaveBeenCalledWith('plan_recommended', { mode: 'easiest' });
  });
});

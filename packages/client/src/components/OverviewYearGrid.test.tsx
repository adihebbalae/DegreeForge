// @vitest-environment jsdom
/**
 * OverviewYearGrid — focused-year scoping tests.
 *
 * Proves the unfocused overview shows every academic year, while the focused slim
 * strip shows ONLY the academic year that CONTAINS the focused semester (its
 * Fall/Spring/Summer trio) — e.g. focus Spring 2028 → the 2027–28 column. All data
 * hooks and the SemesterTile child are mocked; the test exercises the year-scoping
 * derivation, not the data layer.
 */

import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import OverviewYearGrid from './OverviewYearGrid';
import type { Semester } from '@/types';

// Two academic years: 2026–27 (Fall 2026, Spring 2027) and 2027–28 (Fall 2027, Spring 2028).
const semesters: Semester[] = [
  { id: 'fall-2026', label: 'Fall 2026', status: 'future', season: 'Fall', year: 2026 },
  { id: 'spring-2027', label: 'Spring 2027', status: 'future', season: 'Spring', year: 2027 },
  { id: 'fall-2027', label: 'Fall 2027', status: 'future', season: 'Fall', year: 2027 },
  { id: 'spring-2028', label: 'Spring 2028', status: 'future', season: 'Spring', year: 2028 },
];

vi.mock('@/context/PlanContext', () => ({
  useSemesters: () => semesters,
  usePlan: () => ({}),
}));
vi.mock('@/context/DataContext', () => ({
  useCatalogRecord: () => null,
  usePrereqGraph: () => ({ nodes: {} }),
  useGradeDistributions: () => ({}),
  useUserProfile: () => null,
  useDataLoading: () => false,
}));
vi.mock('@/hooks/useDiagnostics', () => ({ useDiagnostics: () => null }));
vi.mock('@/hooks/useStressScore', () => ({ useStressScore: () => null }));
vi.mock('@/hooks/useEffectiveProfile', () => ({ useEffectiveProfile: () => null }));
vi.mock('@/lib/course-utils', () => ({ buildTermLoadCredits: () => ({}) }));
vi.mock('@/lib/auto-planner', () => ({ getCreditHourCap: () => 15 }));
vi.mock('./SemesterTile', () => ({
  default: ({ semester }: { semester: Semester }) => (
    <div data-testid={`tile-${semester.id}`}>{semester.label}</div>
  ),
}));

afterEach(cleanup);

describe('OverviewYearGrid focused-year scoping', () => {
  it('shows both academic-year columns when not focused', () => {
    render(<OverviewYearGrid focusedSemesterId={null} onTileClick={vi.fn()} />);
    expect(screen.getByText('2026–27')).toBeTruthy();
    expect(screen.getByText('2027–28')).toBeTruthy();
    // All four semester tiles present.
    expect(screen.getByTestId('tile-fall-2026')).toBeTruthy();
    expect(screen.getByTestId('tile-spring-2028')).toBeTruthy();
  });

  it('shows ONLY the academic year containing the focused semester', () => {
    // Spring 2028 belongs to academic year 2027 (2027–28).
    render(<OverviewYearGrid focusedSemesterId="spring-2028" onTileClick={vi.fn()} />);

    expect(screen.getByText('2027–28')).toBeTruthy();
    expect(screen.queryByText('2026–27')).toBeNull();

    // Only the 2027–28 trio's tiles render; the 2026–27 ones are gone.
    expect(screen.getByTestId('tile-fall-2027')).toBeTruthy();
    expect(screen.getByTestId('tile-spring-2028')).toBeTruthy();
    expect(screen.queryByTestId('tile-fall-2026')).toBeNull();
    expect(screen.queryByTestId('tile-spring-2027')).toBeNull();
  });
});

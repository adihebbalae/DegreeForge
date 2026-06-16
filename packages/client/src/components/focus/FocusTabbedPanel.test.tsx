// @vitest-environment jsdom
/**
 * FocusTabbedPanel — single tab-strip tests.
 *
 * Proves the focus view surfaces ONE tab strip (Insights · Add · Best Path),
 * that selecting tabs swaps the rendered panel, and that the panel honours a
 * controlled `activeTab` / `onTabChange` (used by FocusEditor's "+ Add course"
 * button to jump straight to Add). Child panels and diagnostics are mocked so
 * the test exercises the tab wiring, not the data layer.
 */

import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import FocusTabbedPanel from './FocusTabbedPanel';
import type { Semester } from '@/types';

// ─── Child panel / hook mocks ───────────────────────────────────────────────
vi.mock('./FocusInsightsPanel', () => ({
  default: () => <div data-testid="insights-panel">insights</div>,
}));
vi.mock('./FocusAddPanel', () => ({
  default: () => <div data-testid="add-panel">add</div>,
}));
vi.mock('@/components/BestPathContent', () => ({
  default: () => <div data-testid="bestpath-content">bestpath</div>,
}));
vi.mock('@/hooks/useDiagnostics', () => ({
  useDiagnostics: () => ({
    criticalPath: { chain: ['ECE 313'] },
    bottlenecks: [],
  }),
}));

const semester: Semester = {
  id: 'sem-3',
  label: 'Fall 2026',
  status: 'future',
  season: 'Fall',
  year: 2026,
};

afterEach(cleanup);

describe('FocusTabbedPanel', () => {
  it('renders a single tab strip with Insights, Add, and Best Path', () => {
    render(<FocusTabbedPanel semester={semester} creditHourCap={18} />);
    const tabs = screen.getAllByRole('button');
    expect(tabs.map((t) => t.textContent)).toEqual(['Insights', 'Add', 'Best Path']);
  });

  it('defaults to the Insights tab when uncontrolled', () => {
    render(<FocusTabbedPanel semester={semester} creditHourCap={18} />);
    expect(screen.getByTestId('insights-panel')).toBeTruthy();
    expect(screen.queryByTestId('add-panel')).toBeNull();
    expect(screen.queryByTestId('bestpath-content')).toBeNull();
  });

  it('switches tabs on click (uncontrolled)', () => {
    render(<FocusTabbedPanel semester={semester} creditHourCap={18} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByTestId('add-panel')).toBeTruthy();
    expect(screen.queryByTestId('insights-panel')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Best Path' }));
    expect(screen.getByTestId('bestpath-content')).toBeTruthy();
    expect(screen.queryByTestId('add-panel')).toBeNull();
  });

  it('honours a controlled activeTab and reports changes via onTabChange', () => {
    const onTabChange = vi.fn();
    const { rerender } = render(
      <FocusTabbedPanel
        semester={semester}
        creditHourCap={18}
        activeTab="add"
        onTabChange={onTabChange}
      />,
    );
    // Controlled to "add": the Add panel shows regardless of internal state.
    expect(screen.getByTestId('add-panel')).toBeTruthy();

    // Clicking a tab does NOT change internal state — it reports up via callback.
    fireEvent.click(screen.getByRole('button', { name: 'Insights' }));
    expect(onTabChange).toHaveBeenCalledWith('insights');
    // Still showing Add because the controlled prop hasn't changed.
    expect(screen.getByTestId('add-panel')).toBeTruthy();

    // Parent updates the controlled prop -> Insights shows.
    rerender(
      <FocusTabbedPanel
        semester={semester}
        creditHourCap={18}
        activeTab="insights"
        onTabChange={onTabChange}
      />,
    );
    expect(screen.getByTestId('insights-panel')).toBeTruthy();
  });
});

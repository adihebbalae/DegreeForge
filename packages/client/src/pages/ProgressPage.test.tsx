// @vitest-environment jsdom
/**
 * ProgressPage — TASK-105 Phase 2 / TASK-098
 *
 * Black-box checks:
 *   1. Direct nav (no fromUpload state) renders ProgressAuditPage without crashing.
 *   2. fromUpload state renders ProgressReveal (skeleton visible).
 *   3. fromUpload=false renders ProgressAuditPage directly.
 *   4. [Security] Invalid/unexpected state fields are coerced to safe defaults.
 */
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// ── mock the heavy components so the test focuses on routing logic ───────────
// ProgressReveal mock: captures the fromUpload path
vi.mock('@/components/ProgressReveal', () => ({
  ProgressReveal: ({ completed, inProgress, source }: { completed: number; inProgress: number; source: string }) => (
    <div data-testid="mock-progress-reveal">
      Reveal: {completed} completed / {inProgress} in progress / {source}
    </div>
  ),
}));

// DegreeRadial + RequirementCards mock: heavy SVG/grid; not under test here
vi.mock('@/components/DegreeRadial', () => ({
  DegreeRadial: () => <div data-testid="mock-degree-radial" role="img" aria-label="0% complete" />,
}));
vi.mock('@/components/RequirementCards', () => ({
  RequirementCards: () => <div data-testid="mock-requirement-cards" />,
}));

// Context mocks so ProgressAuditPage can render without providers
vi.mock('@/context/PlanContext', () => ({
  usePlan: () => ({}),
  useTechCoreId: () => 'computers',
  useMathBAToggle: () => false,
  useWhatIf: () => ({ isActive: false, techCoreId: 'computers', mathBAToggle: false }),
}));
vi.mock('@/context/DataContext', () => ({
  useCatalogRecord: () => null,
  useDegreeRequirements: () => null,
  useUserProfile: () => null,
  useTechCoresRecord: () => null,
}));
vi.mock('@/lib/progress', () => ({
  computeProgress: () => null,
}));
vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));

import ProgressPage from './ProgressPage';

afterEach(cleanup);

function renderWithState(state?: Record<string, unknown>) {
  return render(
    <MemoryRouter
      initialEntries={[{ pathname: '/progress', state: state ?? null }]}
    >
      <Routes>
        <Route path="/progress" element={<ProgressPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ProgressPage', () => {
  it('direct nav (no state) renders ProgressAuditPage without crashing', () => {
    renderWithState();
    // ProgressAuditPage renders its loading skeleton when context data is null
    expect(screen.getByTestId('progress-audit-loading')).toBeDefined();
    expect(screen.queryByTestId('mock-progress-reveal')).toBeNull();
  });

  it('fromUpload=false renders ProgressAuditPage (no reveal)', () => {
    renderWithState({ fromUpload: false });
    expect(screen.getByTestId('progress-audit-loading')).toBeDefined();
    expect(screen.queryByTestId('mock-progress-reveal')).toBeNull();
  });

  it('fromUpload=true renders ProgressReveal with counts from state', () => {
    renderWithState({ fromUpload: true, completed: 18, inProgress: 2, source: 'ida' });
    const reveal = screen.getByTestId('mock-progress-reveal');
    expect(reveal).toBeDefined();
    expect(reveal.textContent).toContain('18');
    expect(reveal.textContent).toContain('2');
    expect(screen.queryByTestId('mock-progress-dashboard')).toBeNull();
  });

  it('fromUpload=true with 0 counts still renders ProgressReveal (counts from state)', () => {
    // The no-false-reward gate is enforced in OnboardingWizard (never navigates on 0 courses);
    // ProgressPage itself just renders what it receives. This test verifies it doesn't crash.
    renderWithState({ fromUpload: true, completed: 0, inProgress: 0, source: 'transcript' });
    expect(screen.getByTestId('mock-progress-reveal')).toBeDefined();
  });

  // [Security] state validation checks
  it('coerces an unrecognized source to "unknown"', () => {
    renderWithState({ fromUpload: true, completed: 5, inProgress: 1, source: 'malicious_value' });
    const reveal = screen.getByTestId('mock-progress-reveal');
    expect(reveal.textContent).toContain('unknown');
    expect(reveal.textContent).not.toContain('malicious_value');
  });

  it('coerces a negative completed count to 0', () => {
    renderWithState({ fromUpload: true, completed: -99, inProgress: 1, source: 'transcript' });
    const reveal = screen.getByTestId('mock-progress-reveal');
    expect(reveal.textContent).toContain('0 completed');
  });

  it('coerces a non-finite completed count to 0', () => {
    renderWithState({ fromUpload: true, completed: Infinity, inProgress: 1, source: 'ida' });
    const reveal = screen.getByTestId('mock-progress-reveal');
    expect(reveal.textContent).toContain('0 completed');
  });

  it('floors a fractional count', () => {
    renderWithState({ fromUpload: true, completed: 7.9, inProgress: 0, source: 'transcript' });
    const reveal = screen.getByTestId('mock-progress-reveal');
    expect(reveal.textContent).toContain('7 completed');
  });

  it('accepts valid source values "transcript" and "ida" unchanged', () => {
    renderWithState({ fromUpload: true, completed: 3, inProgress: 0, source: 'transcript' });
    expect(screen.getByTestId('mock-progress-reveal').textContent).toContain('transcript');
    cleanup();
    renderWithState({ fromUpload: true, completed: 3, inProgress: 0, source: 'ida' });
    expect(screen.getByTestId('mock-progress-reveal').textContent).toContain('ida');
  });
});

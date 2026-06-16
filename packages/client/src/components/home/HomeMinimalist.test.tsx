// @vitest-environment jsdom
/**
 * HomeMinimalist — shell render tests.
 *
 * Proves the minimalist-shell variant: it mounts, renders the plan (semester
 * cards from the mobile list), the "≡" menu opens its tool list, and tapping a
 * semester card opens the editor sheet. Heavy planner children (grid, focus
 * editor, panels, command palette) are mocked so the test exercises the shell
 * wiring, not the whole data layer.
 */

import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Radix dropdown relies on pointer APIs jsdom doesn't implement. Polyfill the
// minimal surface so opening the menu via pointer events works in tests.
if (!('PointerEvent' in window)) {
  // @ts-expect-error — minimal shim, not the full PointerEvent spec.
  window.PointerEvent = class PointerEvent extends MouseEvent {};
}
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// ─── Mutable mock state ─────────────────────────────────────────────────────
const mocks = vi.hoisted(() => ({
  focusedSemesterId: null as string | null,
  setFocusedSemesterId: vi.fn((id: string | null) => { mocks.focusedSemesterId = id; }),
  setChatOpen: vi.fn(),
  setWhatIfOpen: vi.fn(),
  setPaletteOpen: vi.fn(),
  semesters: [
    { id: 'sem-1', label: 'Fall 2025', status: 'past', season: 'Fall', year: 2025 },
    { id: 'sem-2', label: 'Spring 2026', status: 'current', season: 'Spring', year: 2026 },
    { id: 'sem-3', label: 'Fall 2026', status: 'future', season: 'Fall', year: 2026 },
  ],
  plan: { 'sem-2': ['ECE 313'], 'sem-3': ['ECE 445L'] } as Record<string, string[]>,
}));

// ─── Context mocks ──────────────────────────────────────────────────────────
vi.mock('@/context/UiContext', () => ({
  useUi: () => ({
    chatOpen: false, setChatOpen: mocks.setChatOpen,
    whatIfOpen: false, setWhatIfOpen: mocks.setWhatIfOpen,
    paletteOpen: false, setPaletteOpen: mocks.setPaletteOpen,
    focusedSemesterId: mocks.focusedSemesterId,
    setFocusedSemesterId: mocks.setFocusedSemesterId,
  }),
}));

vi.mock('@/context/PlanContext', () => ({
  useSemesters: () => mocks.semesters,
  usePlan: () => mocks.plan,
  usePlanDispatch: () => vi.fn(),
  useSnapshotDispatch: () => vi.fn(),
}));

vi.mock('@/context/DataContext', () => ({
  useCatalogRecord: () => ({}),
  usePrereqGraph: () => ({ nodes: {}, edges: [] }),
  useGradeDistributions: () => ({}),
  useUserProfile: () => ({ completed_courses: [], in_progress_courses: [] }),
  useDataLoading: () => false,
}));

vi.mock('@/hooks/useStressScore', () => ({ useStressScore: () => null }));
vi.mock('@/hooks/useDiagnostics', () => ({ useDiagnostics: () => null }));
vi.mock('@/hooks/useEffectiveProfile', () => ({ useEffectiveProfile: () => null }));
vi.mock('@/hooks/useRecommendPlan', () => ({
  useRecommendPlan: () => ({ handleRecommendPlan: vi.fn(), noticeProps: null, confirmProps: null }),
}));

// usePlanIO touches profile/plan contexts; stub it.
vi.mock('./usePlanIO', () => ({
  usePlanIO: () => ({
    fileInputRef: { current: null },
    exportPlan: vi.fn(),
    openImport: vi.fn(),
    handleImportFile: vi.fn(),
    importError: null,
    clearImportError: vi.fn(),
  }),
}));

// lib helpers — keep simple, deterministic.
vi.mock('@/lib/course-utils', () => ({
  buildTermLoadCredits: () => ({}),
  getCourseCredits: () => 3,
  inferCategory: () => 'ece_core',
  seasonEmoji: () => '🍂',
  // simplified placeholder classes — real CATEGORY_BG uses HSL values (see course-utils.ts); these tests don't assert color values
  CATEGORY_BG: { ece_core: 'bg-orange-500', tech_core: 'bg-green-500', gen_ed: 'bg-amber-500', elective: 'bg-gray-500', math: 'bg-purple-500' },
}));
vi.mock('@/lib/auto-planner', () => ({ getCreditHourCap: () => 15 }));
vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));

// Heavy children — mock to lightweight markers.
vi.mock('@/components/OverviewYearGrid', () => ({ default: () => <div data-testid="grid" /> }));
vi.mock('@/components/FocusEditor', () => ({
  default: ({ focusedSemesterId }: { focusedSemesterId: string }) => (
    <div data-testid="focus-editor">{focusedSemesterId}</div>
  ),
}));
vi.mock('@/components/CommandPalette', () => ({ default: () => null }));
vi.mock('@/components/ChatPanel', () => ({ default: () => <div /> }));
vi.mock('@/components/WhatIfPanel', () => ({ default: () => <div /> }));
vi.mock('@/components/CoursePalette', () => ({ default: () => <div /> }));
vi.mock('@/components/PlanComparison', () => ({ PlanComparisonPanel: () => null }));
vi.mock('@/components/PlanOptimizeControl', () => ({
  default: ({ hideReadout }: { hideReadout?: boolean }) => (
    <div data-testid="optimize-control" data-hide-readout={hideReadout ? 'true' : 'false'} />
  ),
}));

import HomeMinimalist from './HomeMinimalist';

function renderShell() {
  // react-router NavLink needs a router; minimal shim via MemoryRouter.
  const { MemoryRouter } = require('react-router-dom');
  return render(<MemoryRouter><HomeMinimalist /></MemoryRouter>);
}

beforeEach(() => {
  mocks.focusedSemesterId = null;
  vi.clearAllMocks();
});
afterEach(cleanup);

describe('HomeMinimalist', () => {
  it('mounts with the thin top bar (logo + optimize control + menu)', () => {
    renderShell();
    expect(screen.getByTestId('minimalist-topbar')).toBeDefined();
    expect(screen.getByLabelText('DegreeForge home')).toBeDefined();
    // Two instances: one compact (mobile, hideReadout=true) + one full (desktop).
    const controls = screen.getAllByTestId('optimize-control');
    expect(controls).toHaveLength(2);
    expect(screen.getByTestId('minimalist-menu-trigger')).toBeDefined();
  });

  it('renders compact (hideReadout) control for mobile and full control for desktop', () => {
    renderShell();
    const controls = screen.getAllByTestId('optimize-control');
    const compact = controls.find((el) => el.getAttribute('data-hide-readout') === 'true');
    const full = controls.find((el) => el.getAttribute('data-hide-readout') === 'false');
    expect(compact).toBeDefined();
    expect(full).toBeDefined();
  });

  it('renders the plan as semester cards in the mobile list', () => {
    renderShell();
    const list = screen.getByTestId('minimalist-mobile-list');
    // All three semesters render as tappable cards.
    expect(within(list).getByText('Fall 2025')).toBeDefined();
    expect(within(list).getByText('Spring 2026')).toBeDefined();
    expect(within(list).getByText('Fall 2026')).toBeDefined();
    // Planned course chips show.
    expect(within(list).getByText('ECE 313')).toBeDefined();
    expect(within(list).getByText('ECE 445L')).toBeDefined();
  });

  it('opens the ≡ menu showing the tool list', () => {
    renderShell();
    const trigger = screen.getByTestId('minimalist-menu-trigger');
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
    fireEvent.pointerUp(trigger, { button: 0 });
    fireEvent.click(trigger);
    expect(screen.getByText('Chat')).toBeDefined();
    expect(screen.getByText('What-If')).toBeDefined();
    expect(screen.getByText('Course palette')).toBeDefined();
    expect(screen.getByText('Recommend plan')).toBeDefined();
    expect(screen.getByText('Compare')).toBeDefined();
    // Schedule removed for alpha launch.
    expect(screen.getByText('Settings')).toBeDefined();
    expect(screen.getByText('Export plan')).toBeDefined();
    expect(screen.getByText('Import plan')).toBeDefined();
    expect(screen.getByText('Help')).toBeDefined();
  });

  it('tapping a semester card focuses it (drives the editor sheet)', () => {
    renderShell();
    const list = screen.getByTestId('minimalist-mobile-list');
    fireEvent.click(within(list).getByText('Spring 2026'));
    expect(mocks.setFocusedSemesterId).toHaveBeenCalledWith('sem-2');
  });

  it('shows the editor sheet body when a semester is focused', () => {
    mocks.focusedSemesterId = 'sem-3';
    renderShell();
    const sheet = screen.getByTestId('minimalist-semester-sheet');
    expect(within(sheet).getByTestId('focus-editor').textContent).toBe('sem-3');
  });
});

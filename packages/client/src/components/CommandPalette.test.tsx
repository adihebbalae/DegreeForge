/**
 * @vitest-environment jsdom
 *
 * Unit tests for CommandPalette:
 *  1. Renders when commandPaletteOpen = true; absent when false
 *  2. Search filters results by code and title
 *  3. Excludes courses already in the plan or completed
 *  4. Enter dispatches ADD_COURSE to the focused semester when one is set
 *  5. When no focusedSemesterId, default target is the first FUTURE semester (not current)
 *  6. Esc closes the palette without adding a course
 *  7. Mouse click on a result adds the course
 *  8. Shows hint when no target semester exists
 *  9. Changing the selector and adding dispatches to the chosen semester
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup, within } from '@testing-library/react';

// ─── Hoisted mutable state — must use vi.hoisted to be available in vi.mock factories ──

const mocks = vi.hoisted(() => ({
  commandPaletteOpen: true,
  focusedSemesterId: 'sem-2' as string | null,
  plan: {} as Record<string, string[]>,
  semesters: [
    { id: 'sem-1', label: 'Fall 2025', status: 'past', season: 'Fall', year: 2025 },
    { id: 'sem-2', label: 'Spring 2026', status: 'current', season: 'Spring', year: 2026 },
    { id: 'sem-3', label: 'Fall 2026', status: 'future', season: 'Fall', year: 2026 },
  ],
  userProfile: {
    completed_courses: [] as { course: string; grade: string; credit_hours: number }[],
    in_progress_courses: [] as { course: string; credit_hours: number }[],
  },
  dispatch: vi.fn(),
  setCommandPaletteOpen: vi.fn(),
  setFocusedSemesterId: vi.fn(),
}));

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('@/context/UiContext', () => ({
  useUi: () => ({
    commandPaletteOpen: mocks.commandPaletteOpen,
    setCommandPaletteOpen: mocks.setCommandPaletteOpen,
    focusedSemesterId: mocks.focusedSemesterId,
    setFocusedSemesterId: mocks.setFocusedSemesterId,
  }),
}));

const MOCK_CATALOG = {
  'ECE 302': { id: 'ECE 302', title: 'Signals and Systems', credits: 4, description: '', prerequisites: [], corequisites: [], grading: '', department: 'ECE' },
  'ECE 306': { id: 'ECE 306', title: 'Intro to Computing', credits: 3, description: '', prerequisites: [], corequisites: [], grading: '', department: 'ECE' },
  'M 408C': { id: 'M 408C', title: 'Differential Calculus', credits: 4, description: '', prerequisites: [], corequisites: [], grading: '', department: 'M' },
};

vi.mock('@/context/DataContext', () => ({
  useCatalogRecord: () => MOCK_CATALOG,
  usePrereqGraph: () => ({ nodes: {}, edges: [] }),
  useUserProfile: () => mocks.userProfile,
}));

vi.mock('@/context/PlanContext', () => ({
  usePlan: () => mocks.plan,
  useSemesters: () => mocks.semesters,
  usePlanDispatch: () => mocks.dispatch,
}));

// ─── Import component AFTER mocks ────────────────────────────────────────────
import CommandPalette from './CommandPalette';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DEFAULT_SEMESTERS = [
  { id: 'sem-1', label: 'Fall 2025', status: 'past', season: 'Fall', year: 2025 },
  { id: 'sem-2', label: 'Spring 2026', status: 'current', season: 'Spring', year: 2026 },
  { id: 'sem-3', label: 'Fall 2026', status: 'future', season: 'Fall', year: 2026 },
];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CommandPalette', () => {
  beforeEach(() => {
    // Reset to clean defaults before each test
    mocks.commandPaletteOpen = true;
    mocks.focusedSemesterId = 'sem-2';
    mocks.plan = {};
    mocks.userProfile = { completed_courses: [], in_progress_courses: [] };
    mocks.semesters = [...DEFAULT_SEMESTERS];
    mocks.dispatch.mockClear();
    mocks.setCommandPaletteOpen.mockClear();
    mocks.setFocusedSemesterId.mockClear();
  });

  afterEach(() => {
    cleanup(); // unmount after each test to avoid DOM accumulation
  });

  it('renders the search input when open', () => {
    render(<CommandPalette />);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByPlaceholderText(/search course/i)).toBeTruthy();
  });

  it('does not render when commandPaletteOpen is false', () => {
    mocks.commandPaletteOpen = false;
    render(<CommandPalette />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows catalog courses unfiltered when query is empty', () => {
    render(<CommandPalette />);
    const listbox = screen.getByRole('listbox', { name: /course results/i });
    const options = within(listbox).getAllByRole('option');
    expect(options.some((o) => o.textContent?.includes('ECE 302'))).toBe(true);
    expect(options.some((o) => o.textContent?.includes('ECE 306'))).toBe(true);
    expect(options.some((o) => o.textContent?.includes('M 408C'))).toBe(true);
  });

  it('filters results by course code (substring)', () => {
    render(<CommandPalette />);
    const input = screen.getByPlaceholderText(/search course/i);
    fireEvent.change(input, { target: { value: '302' } });
    const listbox = screen.getByRole('listbox', { name: /course results/i });
    const options = within(listbox).getAllByRole('option');
    expect(options.some((o) => o.textContent?.includes('ECE 302'))).toBe(true);
    expect(options.every((o) => !o.textContent?.includes('ECE 306'))).toBe(true);
    expect(options.every((o) => !o.textContent?.includes('M 408C'))).toBe(true);
  });

  it('filters results by course title (case-insensitive)', () => {
    render(<CommandPalette />);
    const input = screen.getByPlaceholderText(/search course/i);
    fireEvent.change(input, { target: { value: 'calculus' } });
    const listbox = screen.getByRole('listbox', { name: /course results/i });
    const options = within(listbox).getAllByRole('option');
    expect(options.some((o) => o.textContent?.includes('M 408C'))).toBe(true);
    expect(options.every((o) => !o.textContent?.includes('ECE 302'))).toBe(true);
  });

  it('excludes courses already in the plan', () => {
    mocks.plan = { 'sem-1': ['ECE 302'] };
    render(<CommandPalette />);
    const listbox = screen.getByRole('listbox', { name: /course results/i });
    const options = within(listbox).getAllByRole('option');
    expect(options.every((o) => !o.textContent?.includes('ECE 302'))).toBe(true);
    expect(options.some((o) => o.textContent?.includes('ECE 306'))).toBe(true);
  });

  it('excludes completed courses', () => {
    mocks.userProfile = {
      completed_courses: [{ course: 'M 408C', grade: 'A', credit_hours: 4 }],
      in_progress_courses: [],
    };
    render(<CommandPalette />);
    const listbox = screen.getByRole('listbox', { name: /course results/i });
    const options = within(listbox).getAllByRole('option');
    expect(options.every((o) => !o.textContent?.includes('M 408C'))).toBe(true);
    expect(options.some((o) => o.textContent?.includes('ECE 302'))).toBe(true);
  });

  it('Enter dispatches ADD_COURSE to focusedSemesterId and closes palette', () => {
    // focusedSemesterId = 'sem-2' (current, non-past) — should pre-select it
    render(<CommandPalette />);
    const dialog = screen.getByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'Enter' });
    expect(mocks.dispatch).toHaveBeenCalledWith({
      type: 'ADD_COURSE',
      semesterId: 'sem-2',
      courseId: expect.any(String),
    });
    expect(mocks.setFocusedSemesterId).toHaveBeenCalledWith('sem-2');
    expect(mocks.setCommandPaletteOpen).toHaveBeenCalledWith(false);
  });

  it('when focusedSemesterId is null, default target is the first FUTURE semester (not current)', () => {
    mocks.focusedSemesterId = null;
    render(<CommandPalette />);
    const dialog = screen.getByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'Enter' });
    // sem-3 is the only future semester; sem-2 is current — must pick sem-3
    expect(mocks.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ADD_COURSE', semesterId: 'sem-3' })
    );
  });

  it('when focusedSemesterId is null and no future semester exists, falls back to the current semester', () => {
    mocks.focusedSemesterId = null;
    mocks.semesters = [
      { id: 'sem-1', label: 'Fall 2025', status: 'past', season: 'Fall', year: 2025 },
      { id: 'sem-2', label: 'Spring 2026', status: 'current', season: 'Spring', year: 2026 },
    ];
    render(<CommandPalette />);
    const dialog = screen.getByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'Enter' });
    expect(mocks.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ADD_COURSE', semesterId: 'sem-2' })
    );
  });

  it('Esc calls setCommandPaletteOpen(false) without dispatching ADD_COURSE', () => {
    render(<CommandPalette />);
    const dialog = screen.getByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(mocks.setCommandPaletteOpen).toHaveBeenCalledWith(false);
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });

  it('ArrowDown moves highlight and Enter adds the second result', () => {
    render(<CommandPalette />);
    const dialog = screen.getByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'ArrowDown' });
    fireEvent.keyDown(dialog, { key: 'Enter' });
    expect(mocks.dispatch).toHaveBeenCalledTimes(1);
    const call = mocks.dispatch.mock.calls[0][0];
    expect(call.type).toBe('ADD_COURSE');
    expect(call.semesterId).toBe('sem-2');
  });

  it('clicking a result adds that course', () => {
    render(<CommandPalette />);
    const listbox = screen.getByRole('listbox', { name: /course results/i });
    const items = within(listbox).getAllByRole('option');
    act(() => {
      fireEvent.mouseDown(items[0]);
    });
    expect(mocks.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ADD_COURSE' })
    );
    expect(mocks.setCommandPaletteOpen).toHaveBeenCalledWith(false);
  });

  it('shows a hint when no target semester is available', () => {
    mocks.focusedSemesterId = null;
    mocks.semesters = [
      { id: 'sem-1', label: 'Fall 2025', status: 'past', season: 'Fall', year: 2025 },
    ];
    render(<CommandPalette />);
    const dialog = screen.getByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'Enter' });
    expect(mocks.dispatch).not.toHaveBeenCalled();
    expect(screen.getByText(/no current or focused semester/i)).toBeTruthy();
  });

  it('changing the semester selector and pressing Enter dispatches ADD_COURSE to the chosen semester', () => {
    mocks.focusedSemesterId = null;
    // Default will be sem-3 (first future); change it to sem-2 (current)
    render(<CommandPalette />);
    const selector = screen.getByRole('combobox', { name: /target semester/i });
    fireEvent.change(selector, { target: { value: 'sem-2' } });
    const dialog = screen.getByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'Enter' });
    expect(mocks.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ADD_COURSE', semesterId: 'sem-2' })
    );
  });
});

// @vitest-environment jsdom
/**
 * SemesterTile unit tests.
 * Covers:
 *   #1 — Ctrl+Space / Meta+Space does NOT activate the tile (no onClick).
 *        Plain Space / Enter still activates it.
 *   #3 — Draggable chip data: future chips carry { type, courseId, source, semesterId }.
 *        Past chips are NOT draggable (disabled prop).
 *   #4 — Chips render as colored cards (have category bg class) not bare text.
 */

import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import SemesterTile from './SemesterTile';

// ─── dnd-kit mocks ─────────────────────────────────────────────────────────────
// Capture the data passed to useDraggable so we can assert on it.
const capturedDraggableArgs: { id: string; disabled?: boolean; data?: Record<string, unknown> }[] = [];

vi.mock('@dnd-kit/core', () => {
  const actual = { DndContext: ({ children }: { children: unknown }) => children };
  return {
    ...actual,
    useDroppable: () => ({
      setNodeRef: vi.fn(),
      isOver: false,
    }),
    useDndMonitor: () => {},
    useDraggable: (args: { id: string; disabled?: boolean; data?: Record<string, unknown> }) => {
      capturedDraggableArgs.push({ ...args, data: args.data as Record<string, unknown> });
      return {
        attributes: { 'data-draggable': 'true' },
        listeners: {},
        setNodeRef: vi.fn(),
        isDragging: false,
      };
    },
  };
});

vi.mock('@/context/PlanContext', () => ({
  usePlanDispatch: () => vi.fn(),
}));
vi.mock('@/context/UiContext', () => ({
  useUi: () => ({ highlightedCourseId: null }),
}));
vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));
vi.mock('@/lib/workload', () => ({
  computeSemesterDifficulty: () => ({ bucket: 'light', semesterDifficulty: 10 }),
  HEAT_STRIPE_CLASS: { light: 'bg-green-200', medium: 'bg-amber-200', heavy: 'bg-red-200', extreme: 'bg-red-500' },
}));
vi.mock('@/lib/auto-planner', () => ({ getCreditHourCap: () => 15 }));
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: unknown }) => <>{children}</>,
  TooltipTrigger: ({ children, asChild }: { children: unknown; asChild?: boolean }) => <>{children}</>,
  TooltipContent: ({ children }: { children: unknown }) => <>{children}</>,
}));

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const futureSemester = {
  id: 'fall-2026',
  label: 'Fall 2026',
  status: 'future' as const,
  season: 'Fall' as const,
  year: 2026,
};

const pastSemester = {
  id: 'fall-2024',
  label: 'Fall 2024',
  status: 'past' as const,
  season: 'Fall' as const,
  year: 2024,
};

const baseProps = {
  catalog: null,
  prereqNodes: {},
  gradeDistributions: {},
  transcriptCredits: {},
  isFocused: false,
  slackLabel: null,
  stressResult: null,
  onClick: vi.fn(),
};

// ─── Tests ────────────────────────────────────────────────────────────────────

afterEach(cleanup);

describe('SemesterTile keydown — fix #1', () => {
  beforeEach(() => {
    baseProps.onClick = vi.fn();
  });

  it('activates onClick on Enter', () => {
    render(<SemesterTile semester={futureSemester} courseIds={[]} {...baseProps} />);
    // Target the tile root div by its partial aria-label (avoids matching ✕ buttons)
    const tile = screen.getByRole('button', { name: /Fall 2026/ });
    fireEvent.keyDown(tile, { key: 'Enter' });
    expect(baseProps.onClick).toHaveBeenCalledOnce();
  });

  it('activates onClick on bare Space', () => {
    render(<SemesterTile semester={futureSemester} courseIds={[]} {...baseProps} />);
    const tile = screen.getByRole('button', { name: /Fall 2026/ });
    fireEvent.keyDown(tile, { key: ' ' });
    expect(baseProps.onClick).toHaveBeenCalledOnce();
  });

  it('does NOT activate onClick on Ctrl+Space', () => {
    render(<SemesterTile semester={futureSemester} courseIds={[]} {...baseProps} />);
    const tile = screen.getByRole('button', { name: /Fall 2026/ });
    fireEvent.keyDown(tile, { key: ' ', ctrlKey: true });
    expect(baseProps.onClick).not.toHaveBeenCalled();
  });

  it('does NOT activate onClick on Meta+Space', () => {
    render(<SemesterTile semester={futureSemester} courseIds={[]} {...baseProps} />);
    const tile = screen.getByRole('button', { name: /Fall 2026/ });
    fireEvent.keyDown(tile, { key: ' ', metaKey: true });
    expect(baseProps.onClick).not.toHaveBeenCalled();
  });
});

describe('SemesterTile course chips — fix #3 (draggable data)', () => {
  beforeEach(() => {
    capturedDraggableArgs.length = 0;
  });

  it('future chip registers useDraggable with correct semesterId and source=timeline', () => {
    render(
      <SemesterTile
        semester={futureSemester}
        courseIds={['ECE 313']}
        {...baseProps}
      />
    );
    const chipDrag = capturedDraggableArgs.find(a => String(a.id).includes('ECE 313'));
    expect(chipDrag).toBeDefined();
    expect(chipDrag?.data?.source).toBe('timeline');
    expect(chipDrag?.data?.semesterId).toBe('fall-2026');
    expect(chipDrag?.data?.courseId).toBe('ECE 313');
    expect(chipDrag?.disabled).toBe(false);
  });

  it('past chip registers useDraggable with disabled=true', () => {
    render(
      <SemesterTile
        semester={pastSemester}
        courseIds={['ECE 302']}
        {...baseProps}
      />
    );
    const chipDrag = capturedDraggableArgs.find(a => String(a.id).includes('ECE 302'));
    expect(chipDrag).toBeDefined();
    expect(chipDrag?.disabled).toBe(true);
  });
});

describe('SemesterTile course chips — fix #4 (card rendering)', () => {
  it('chip renders the course id as text', () => {
    render(
      <SemesterTile
        semester={futureSemester}
        courseIds={['ECE 445L']}
        {...baseProps}
      />
    );
    expect(screen.getByText('ECE 445L')).toBeDefined();
  });

  it('chip element carries a category bg class (not a bare dot)', () => {
    render(
      <SemesterTile
        semester={futureSemester}
        courseIds={['ECE 445L']}
        {...baseProps}
      />
    );
    // The chip outer span carries data-course-id; use querySelector for precision.
    const chipSpan = document.querySelector('span[data-course-id="ECE 445L"]');
    expect(chipSpan).not.toBeNull();
    // The chip span itself carries the category background color class.
    expect(chipSpan!.className).toMatch(/bg-\[/);
  });
});

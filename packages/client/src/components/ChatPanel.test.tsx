// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Mock runAgentTurn so no real Ollama calls happen
const mockRunAgentTurn = vi.fn();

vi.mock('@/lib/agent-loop', () => ({
  runAgentTurn: (...args: unknown[]) => mockRunAgentTurn(...args),
  createOllamaProvider: () => ({ complete: vi.fn() }),
}));

vi.mock('@/lib/agent-tools/registry', () => ({
  DEFAULT_ENABLED_TOOLS: [],
  TOOL_REGISTRY: [],
}));

vi.mock('@/context/PlanContext', () => ({
  usePlan: () => ({
    'Fall 2025': ['ECE 302'],
    'Spring 2026': [],
  }),
  useSemesters: () => [
    { id: 'Fall 2025', label: "Fall '25", status: 'past', year: 2025, season: 'Fall' },
    { id: 'Spring 2026', label: "Sp '26", status: 'future', year: 2026, season: 'Spring' },
  ],
  useTechCoreId: () => 'computer_architecture',
  useMathBAToggle: () => false,
  usePlanDispatch: () => vi.fn(),
}));

vi.mock('@/context/DataContext', () => ({
  useUserProfile: () => null,
  useCatalogRecord: () => ({
    'ECE 302': { id: 'ECE 302', title: 'Intro EE', credits: 3, description: '', prerequisites: [], corequisites: [], grading: 'Regular', department: 'ECE' },
    'ECE 306': { id: 'ECE 306', title: 'Intro Computing', credits: 3, description: '', prerequisites: [], corequisites: [], grading: 'Regular', department: 'ECE' },
  }),
  usePrereqGraph: () => ({ nodes: {}, edges: [] }),
  useGradeDistributions: () => ({}),
  useDegreeRequirements: () => null,
  useTechCoresRecord: () => null,
  useOfferingSchedule: () => ({}),
  // Provides the raw FallSections document for section-aware tools
  useFallSectionsRaw: () => null,
}));

vi.mock('@/lib/course-utils', () => ({
  getCourseTitle: (_id: string) => _id,
}));

// ChatPanel reads enabledTools from settings; empty array → falls back to DEFAULT_ENABLED_TOOLS (also [])
vi.mock('@/context/SettingsContext', () => ({
  useSettings: () => ({ enabledTools: [] }),
}));

// Mock ReactMarkdown so we don't need remark/MDX transforms
vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => <span>{children}</span>,
}));

// ─── Import under test ────────────────────────────────────────────────────────

import ChatPanel, { validateOp, validateOpCount, MAX_OPS_PER_TURN } from './ChatPanel';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CATALOG = {
  'ECE 302': { id: 'ECE 302' },
  'ECE 306': { id: 'ECE 306' },
};

const SEMESTER_IDS = ['Fall 2025', 'Spring 2026'];

const PLAN: Record<string, string[]> = {
  'Fall 2025': ['ECE 302'],
  'Spring 2026': [],
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ─── validateOp unit tests ─────────────────────────────────────────────────────

describe('validateOp', () => {
  it('returns null for a valid add op', () => {
    const err = validateOp(
      { op: 'add', courseId: 'ECE 306', semesterId: 'Spring 2026' },
      CATALOG,
      SEMESTER_IDS,
      PLAN
    );
    expect(err).toBeNull();
  });

  it('returns error for unknown courseId', () => {
    const err = validateOp(
      { op: 'add', courseId: 'ECE 999', semesterId: 'Spring 2026' },
      CATALOG,
      SEMESTER_IDS,
      PLAN
    );
    expect(err).not.toBeNull();
    expect(err!.reason).toContain('ECE 999');
    expect(err!.reason).toContain('catalog');
  });

  it('returns error for unknown semesterId on add', () => {
    const err = validateOp(
      { op: 'add', courseId: 'ECE 306', semesterId: 'Summer 2026' },
      CATALOG,
      SEMESTER_IDS,
      PLAN
    );
    expect(err).not.toBeNull();
    expect(err!.reason).toContain('Summer 2026');
  });

  it('returns error for duplicate placement (same course already in another semester)', () => {
    const err = validateOp(
      { op: 'add', courseId: 'ECE 302', semesterId: 'Spring 2026' },
      CATALOG,
      SEMESTER_IDS,
      PLAN // ECE 302 is already in Fall 2025
    );
    expect(err).not.toBeNull();
    expect(err!.reason).toContain('ECE 302');
    expect(err!.reason).toContain('Fall 2025');
  });

  it('returns error for unrecognised op type', () => {
    const err = validateOp(
      { op: 'teleport' as 'add', courseId: 'ECE 302', semesterId: 'Spring 2026' },
      CATALOG,
      SEMESTER_IDS,
      PLAN
    );
    expect(err).not.toBeNull();
    expect(err!.reason).toContain('teleport');
  });

  it('returns null for a valid remove op', () => {
    const err = validateOp(
      { op: 'remove', courseId: 'ECE 302', semesterId: 'Fall 2025' },
      CATALOG,
      SEMESTER_IDS,
      PLAN
    );
    expect(err).toBeNull();
  });

  it('returns null for a valid move op', () => {
    const err = validateOp(
      { op: 'move', courseId: 'ECE 302', fromSemesterId: 'Fall 2025', toSemesterId: 'Spring 2026' },
      CATALOG,
      SEMESTER_IDS,
      PLAN
    );
    expect(err).toBeNull();
  });

  it('returns error for move with unknown toSemesterId', () => {
    const err = validateOp(
      { op: 'move', courseId: 'ECE 302', fromSemesterId: 'Fall 2025', toSemesterId: 'Fall 2099' },
      CATALOG,
      SEMESTER_IDS,
      PLAN
    );
    expect(err).not.toBeNull();
    expect(err!.reason).toContain('Fall 2099');
  });
});

// ─── validateOpCount unit tests ───────────────────────────────────────────────

describe('validateOpCount', () => {
  it('returns null when op count is within limit', () => {
    const ops = Array.from({ length: MAX_OPS_PER_TURN }, (_, i) => ({
      op: 'add' as const,
      courseId: `ECE ${300 + i}`,
      semesterId: 'Spring 2026',
    }));
    expect(validateOpCount(ops)).toBeNull();
  });

  it('returns error string when op count exceeds limit', () => {
    const ops = Array.from({ length: MAX_OPS_PER_TURN + 1 }, (_, i) => ({
      op: 'add' as const,
      courseId: `ECE ${300 + i}`,
      semesterId: 'Spring 2026',
    }));
    const result = validateOpCount(ops);
    expect(result).not.toBeNull();
    expect(result).toContain(String(MAX_OPS_PER_TURN + 1));
    expect(result).toContain(String(MAX_OPS_PER_TURN));
  });
});

// ─── ChatPanel integration tests ─────────────────────────────────────────────

describe('ChatPanel', () => {
  beforeEach(() => {
    // Default: agent returns a plain text response
    mockRunAgentTurn.mockResolvedValue({
      finalText: 'Hello! I can help with your degree plan.',
      toolCallMade: null,
      toolResult: null,
    });
  });

  it('renders the empty state initially', () => {
    render(<ChatPanel />);
    expect(screen.getByPlaceholderText('Ask about your plan...')).toBeDefined();
  });

  it('calls runAgentTurn when the user sends a message (happy path)', async () => {
    render(<ChatPanel />);

    const input = screen.getByPlaceholderText('Ask about your plan...');
    fireEvent.change(input, { target: { value: 'hi' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => {
      expect(mockRunAgentTurn).toHaveBeenCalledTimes(1);
    });

    const callArgs = mockRunAgentTurn.mock.calls[0];
    // history, userMessage, opts
    expect(callArgs[1]).toBe('hi');

    await waitFor(() => {
      expect(screen.getByText('Hello! I can help with your degree plan.')).toBeDefined();
    });
  });

  it('renders proposedOps diff card when agent calls propose_plan_edit', async () => {
    mockRunAgentTurn.mockResolvedValue({
      finalText: '{"type":"plan_edit_proposal","proposal":{"operations":[{"op":"add","courseId":"ECE 306","semesterId":"Spring 2026"}],"reasoning":"Fits your schedule"}}',
      toolCallMade: { name: 'propose_plan_edit', args: {} },
      toolResult: {
        type: 'plan_edit_proposal',
        proposal: {
          operations: [{ op: 'add', courseId: 'ECE 306', semesterId: 'Spring 2026' }],
          reasoning: 'Fits your schedule',
        },
        message: 'Plan edit proposal ready',
      },
    });

    render(<ChatPanel />);

    const input = screen.getByPlaceholderText('Ask about your plan...');
    fireEvent.change(input, { target: { value: 'add ECE 306' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('Proposed Plan Changes')).toBeDefined();
    });

    expect(screen.getByText('Fits your schedule')).toBeDefined();
    expect(screen.getByText(/Add ECE 306/)).toBeDefined();
  });

  it('shows inline error when Accept is clicked for unknown courseId', async () => {
    mockRunAgentTurn.mockResolvedValue({
      finalText: '',
      toolCallMade: { name: 'propose_plan_edit', args: {} },
      toolResult: {
        type: 'plan_edit_proposal',
        proposal: {
          operations: [{ op: 'add', courseId: 'ECE 999', semesterId: 'Spring 2026' }],
          reasoning: 'Adding unknown course',
        },
      },
    });

    render(<ChatPanel />);

    const input = screen.getByPlaceholderText('Ask about your plan...');
    fireEvent.change(input, { target: { value: 'add ECE 999' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('Proposed Plan Changes')).toBeDefined();
    });

    const acceptButtons = screen.getAllByTitle('Accept');
    fireEvent.click(acceptButtons[0]);

    await waitFor(() => {
      // The error <p> element should contain both "ECE 999" and "catalog"
      const errEl = screen.getByText(/is not in the catalog/);
      expect(errEl).toBeDefined();
      expect(errEl.textContent).toContain('ECE 999');
    });
  });

  it('shows inline error when Accept is clicked for unknown semesterId', async () => {
    mockRunAgentTurn.mockResolvedValue({
      finalText: '',
      toolCallMade: { name: 'propose_plan_edit', args: {} },
      toolResult: {
        type: 'plan_edit_proposal',
        proposal: {
          operations: [{ op: 'add', courseId: 'ECE 306', semesterId: 'Summer 2099' }],
          reasoning: 'Bad semester',
        },
      },
    });

    render(<ChatPanel />);

    const input = screen.getByPlaceholderText('Ask about your plan...');
    fireEvent.change(input, { target: { value: 'test' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('Proposed Plan Changes')).toBeDefined();
    });

    const acceptButtons = screen.getAllByTitle('Accept');
    fireEvent.click(acceptButtons[0]);

    await waitFor(() => {
      const errEl = screen.getByText(/does not exist in your plan/);
      expect(errEl).toBeDefined();
      expect(errEl.textContent).toContain('Summer 2099');
    });
  });

  it('shows inline error when Accept would create a duplicate placement', async () => {
    // ECE 302 is already in Fall 2025 per the mock
    mockRunAgentTurn.mockResolvedValue({
      finalText: '',
      toolCallMade: { name: 'propose_plan_edit', args: {} },
      toolResult: {
        type: 'plan_edit_proposal',
        proposal: {
          operations: [{ op: 'add', courseId: 'ECE 302', semesterId: 'Spring 2026' }],
          reasoning: 'Duplicate placement',
        },
      },
    });

    render(<ChatPanel />);

    const input = screen.getByPlaceholderText('Ask about your plan...');
    fireEvent.change(input, { target: { value: 'test' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('Proposed Plan Changes')).toBeDefined();
    });

    const acceptButtons = screen.getAllByTitle('Accept');
    fireEvent.click(acceptButtons[0]);

    await waitFor(() => {
      const errEl = screen.getByText(/is already placed in/);
      expect(errEl).toBeDefined();
      expect(errEl.textContent).toContain('ECE 302');
      expect(errEl.textContent).toContain('Fall 2025');
    });
  });

  it('rejects proposals with too many ops (op-count overflow)', async () => {
    const tooManyOps = Array.from({ length: MAX_OPS_PER_TURN + 1 }, (_, i) => ({
      op: 'add' as const,
      courseId: 'ECE 306',
      semesterId: 'Spring 2026',
    }));

    mockRunAgentTurn.mockResolvedValue({
      finalText: '',
      toolCallMade: { name: 'propose_plan_edit', args: {} },
      toolResult: {
        type: 'plan_edit_proposal',
        proposal: {
          operations: tooManyOps,
          reasoning: 'Too many ops',
        },
      },
    });

    render(<ChatPanel />);

    const input = screen.getByPlaceholderText('Ask about your plan...');
    fireEvent.change(input, { target: { value: 'test' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => {
      // Proposal card should NOT appear — error replaces it
      expect(screen.queryByText('Proposed Plan Changes')).toBeNull();
    });
  });

  it('shows graceful error message when runAgentTurn rejects', async () => {
    mockRunAgentTurn.mockRejectedValue(new Error('Ollama not running'));

    render(<ChatPanel />);

    const input = screen.getByPlaceholderText('Ask about your plan...');
    fireEvent.change(input, { target: { value: 'hi' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('Ollama not running')).toBeDefined();
    });
  });
});

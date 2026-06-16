// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

// vi.mock is hoisted, so the factory must use inline values (no top-level const refs)
vi.mock('@/lib/agent-tools/registry', () => ({
  TOOL_REGISTRY: [
    {
      name: 'get_course_info',
      description: 'Get full information about a course.',
      schema: {},
      defaultEnabled: true,
      fn: () => {},
    },
    {
      name: 'search_catalog',
      description: 'Search the course catalog by keyword.',
      schema: {},
      defaultEnabled: false,
      fn: () => {},
    },
  ],
  DEFAULT_ENABLED_TOOLS: [
    {
      name: 'get_course_info',
      description: 'Get full information about a course.',
      schema: {},
      defaultEnabled: true,
      fn: () => {},
    },
  ],
}));

const mockDispatch = vi.fn();
let mockSettings = {
  loadTolerance: 'above_average' as const,
  gradTarget: 'Spring 2029',
  techCoreId: 'computer_architecture',
  mathBAToggle: false,
  schedulerWeights: { gpa: 0.35, timeFit: 0.20, buildingPenalty: 0.10, instructionMode: 0.15, professorPreference: 0.15, daySpread: 0.05 },
  timeWindow: 'no_preference' as const,
  instructionMode: 'no_preference' as const,
  profPreferences: [],
  paletteSortMode: 'recommended' as const,
  enabledTools: ['get_course_info'],
};

vi.mock('@/context/SettingsContext', () => ({
  useSettings: () => mockSettings,
  useSettingsDispatch: () => mockDispatch,
}));

vi.mock('@/context/DataContext', () => ({
  useTechCoresRecord: () => null,
}));

// Stub ProfileEditor so SettingsPage tests don't need the full profile context chain
vi.mock('@/components/ProfileEditor', () => ({
  ProfileEditor: () => <div data-testid="profile-editor">ProfileEditor</div>,
}));

// Stub UI primitives that require Radix/DOM internals not present in jsdom
vi.mock('@/components/ui/select', () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/separator', () => ({
  Separator: () => <hr />,
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock('@/components/ui/confirm-dialog', () => ({
  ConfirmDialog: () => null,
}));

vi.mock('@/components/ui/switch', () => ({
  Switch: ({ checked, onCheckedChange }: { checked: boolean; onCheckedChange: (v: boolean) => void }) => (
    <input type="checkbox" checked={checked} onChange={(e) => onCheckedChange(e.target.checked)} />
  ),
}));

// ─── Import under test ────────────────────────────────────────────────────────

import SettingsPage from './SettingsPage';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  // Reset mock settings to default
  mockSettings = {
    loadTolerance: 'above_average',
    gradTarget: 'Spring 2029',
    techCoreId: 'computer_architecture',
    mathBAToggle: false,
    schedulerWeights: { gpa: 0.35, timeFit: 0.20, buildingPenalty: 0.10, instructionMode: 0.15, professorPreference: 0.15, daySpread: 0.05 },
    timeWindow: 'no_preference',
    instructionMode: 'no_preference',
    profPreferences: [],
    paletteSortMode: 'recommended',
    enabledTools: ['get_course_info'],
  };
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SettingsPage Profile section', () => {
  it('renders the Profile section heading', () => {
    render(<SettingsPage />);
    expect(screen.getByText('Profile')).toBeDefined();
  });

  it('renders the ProfileEditor component', () => {
    render(<SettingsPage />);
    expect(screen.getByTestId('profile-editor')).toBeDefined();
  });

  it('does not render the old "Transcript edits are coming soon" notice', () => {
    render(<SettingsPage />);
    const notice = screen.queryByText(/Transcript edits are coming soon/);
    expect(notice).toBeNull();
  });
});

// ── Schedule-optimizer sections — hidden for alpha launch (SCHEDULE_ENABLED=false) ──
// The Scheduler Preferences (weight sliders, Time-of-Day, Instruction Mode) and
// Professor Preferences sections tune the schedule optimizer, which is unreachable in
// the alpha (Schedule/Career nav + routes are commented out). They are gated behind
// SCHEDULE_ENABLED in lib/features.ts. These assert they are absent while the flag is off.
describe('SettingsPage schedule-optimizer sections (SCHEDULE_ENABLED=false — hidden for alpha launch)', () => {
  it('does not render the Scheduler Preferences section', () => {
    render(<SettingsPage />);
    expect(screen.queryByText('Scheduler Preferences')).toBeNull();
    expect(screen.queryByText('GPA / Grade Quality')).toBeNull();
    expect(screen.queryByText('Time-of-Day Preference')).toBeNull();
    expect(screen.queryByText('Preferred Instruction Mode')).toBeNull();
  });

  it('does not render the Professor Preferences section', () => {
    render(<SettingsPage />);
    expect(screen.queryByText('Professor Preferences')).toBeNull();
  });

  it('still renders the visible Academic, Profile, and Import sections', () => {
    render(<SettingsPage />);
    expect(screen.getByText('Academic')).toBeDefined();
    expect(screen.getByText('Profile')).toBeDefined();
    expect(screen.getByText('Import & Personalize')).toBeDefined();
  });
});

// ── Chat Tools section tests — skipped for soft launch (AI_ENABLED=false hides this section) ──
// The Chat Tools section (provider, access code, tool toggles) is hidden behind AI_ENABLED.
// These tests remain so they can be un-skipped when AI is re-enabled (set AI_ENABLED=true in lib/features.ts).
describe.skip('SettingsPage Chat Tools section (AI_ENABLED=false — hidden for soft launch)', () => {
  it('renders a "Chat Tools" heading', () => {
    render(<SettingsPage />);
    expect(screen.getByText('Chat Tools')).toBeDefined();
  });

  it('renders every tool from TOOL_REGISTRY by name', () => {
    render(<SettingsPage />);
    expect(screen.getByText('get_course_info')).toBeDefined();
    expect(screen.getByText('search_catalog')).toBeDefined();
  });

  it('renders tool descriptions', () => {
    render(<SettingsPage />);
    expect(screen.getByText('Get full information about a course.')).toBeDefined();
    expect(screen.getByText('Search the course catalog by keyword.')).toBeDefined();
  });

  it('enabled tool checkbox is checked; disabled tool is unchecked', () => {
    render(<SettingsPage />);
    // get_course_info is in enabledTools → checked
    const checkedBox = screen.getByLabelText('get_course_info');
    expect((checkedBox as HTMLInputElement).getAttribute('data-state')).toBe('checked');
    // search_catalog is NOT in enabledTools → unchecked
    const uncheckedBox = screen.getByLabelText('search_catalog');
    expect((uncheckedBox as HTMLInputElement).getAttribute('data-state')).toBe('unchecked');
  });

  it('clicking a tool checkbox dispatches TOGGLE_TOOL with the correct name', () => {
    render(<SettingsPage />);
    // Click the unchecked tool to enable it
    const uncheckedBox = screen.getByLabelText('search_catalog');
    fireEvent.click(uncheckedBox);
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'TOGGLE_TOOL', toolName: 'search_catalog' });
  });

  it('clicking an already-checked tool dispatches TOGGLE_TOOL to disable it', () => {
    render(<SettingsPage />);
    const checkedBox = screen.getByLabelText('get_course_info');
    fireEvent.click(checkedBox);
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'TOGGLE_TOOL', toolName: 'get_course_info' });
  });
});

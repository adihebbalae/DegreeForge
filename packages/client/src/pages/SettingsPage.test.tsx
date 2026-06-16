// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
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

// Helper: click a TOC tab by its accessible name to switch panels.
function selectTab(name: string | RegExp) {
  fireEvent.click(screen.getByRole('tab', { name }));
}

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

// ─── TOC navigation ─────────────────────────────────────────────────────────────

describe('SettingsPage TOC navigation', () => {
  it('renders a tablist with the always-on sections', () => {
    render(<SettingsPage />);
    expect(screen.getByRole('tablist', { name: /settings sections/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Academic' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Profile' })).toBeDefined();
    expect(screen.getByRole('tab', { name: /import & personalize/i })).toBeDefined();
  });

  it('defaults to the Academic panel with that tab selected', () => {
    render(<SettingsPage />);
    expect(screen.getByRole('tab', { name: 'Academic' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tabpanel', { name: 'Academic' })).toBeDefined();
  });

  it('switches panels when a TOC tab is clicked (panel-switch, not scroll)', () => {
    render(<SettingsPage />);
    // Academic panel is up first; Profile content is NOT mounted yet.
    expect(screen.queryByTestId('profile-editor')).toBeNull();

    selectTab('Profile');

    // Now the Profile panel is mounted and its tab is selected.
    expect(screen.getByTestId('profile-editor')).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Profile' }).getAttribute('aria-selected')).toBe('true');
    // Academic panel is gone (only the active section renders).
    expect(screen.queryByRole('tabpanel', { name: 'Academic' })).toBeNull();
  });

  it('reaches the Import & Personalize panel via the TOC', () => {
    render(<SettingsPage />);
    selectTab(/import & personalize/i);
    const panel = screen.getByRole('tabpanel', { name: /import & personalize/i });
    expect(within(panel).getByRole('button', { name: /open setup/i })).toBeDefined();
  });
});

// ─── Academic controls ───────────────────────────────────────────────────────────

describe('SettingsPage Academic section', () => {
  it('renders all four Academic controls on the default panel', () => {
    render(<SettingsPage />);
    expect(screen.getByText('Credit Load Tolerance')).toBeDefined();
    expect(screen.getByText('Target Graduation')).toBeDefined();
    expect(screen.getByText('Tech Core Track')).toBeDefined();
    expect(screen.getByText('Math BA Double Major')).toBeDefined();
  });

  it('toggling Math BA dispatches SET_MATH_BA', () => {
    render(<SettingsPage />);
    const toggle = screen.getByRole('checkbox');
    fireEvent.click(toggle);
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'SET_MATH_BA', value: true });
  });
});

// ─── Profile section ─────────────────────────────────────────────────────────────

describe('SettingsPage Profile section', () => {
  it('renders the Profile tab in the TOC', () => {
    render(<SettingsPage />);
    expect(screen.getByRole('tab', { name: 'Profile' })).toBeDefined();
  });

  it('renders the ProfileEditor component when the Profile panel is active', () => {
    render(<SettingsPage />);
    selectTab('Profile');
    expect(screen.getByTestId('profile-editor')).toBeDefined();
  });

  it('does not render the old "Transcript edits are coming soon" notice', () => {
    render(<SettingsPage />);
    selectTab('Profile');
    const notice = screen.queryByText(/Transcript edits are coming soon/);
    expect(notice).toBeNull();
  });
});

// ─── Flag-gated sections (SCHEDULE_ENABLED=false, AI_ENABLED=false) ────────────────
// These sections are omitted from the live section list while their flag is off, so
// neither a TOC tab nor a panel for them should exist.

describe('SettingsPage flag-gated sections (hidden for soft launch)', () => {
  it('does not render Scheduler / Professor tabs while SCHEDULE_ENABLED=false', () => {
    render(<SettingsPage />);
    expect(screen.queryByRole('tab', { name: /scheduler preferences/i })).toBeNull();
    expect(screen.queryByRole('tab', { name: /professor preferences/i })).toBeNull();
  });

  it('does not render Scheduler weight sliders while SCHEDULE_ENABLED=false', () => {
    render(<SettingsPage />);
    expect(screen.queryByText('GPA / Grade Quality')).toBeNull();
    expect(screen.queryByText('Time-of-Day Preference')).toBeNull();
  });

  it('does not render the Chat Tools tab while AI_ENABLED=false', () => {
    render(<SettingsPage />);
    expect(screen.queryByRole('tab', { name: /chat tools/i })).toBeNull();
    expect(screen.queryByText('get_course_info')).toBeNull();
  });
});

// ── Chat Tools section tests — skipped for soft launch (AI_ENABLED=false hides this section) ──
// The Chat Tools section (provider, access code, tool toggles) is hidden behind AI_ENABLED.
// These tests remain so they can be un-skipped when AI is re-enabled (set AI_ENABLED=true in lib/features.ts).
// When un-skipped, first navigate to the Chat Tools panel: selectTab(/chat tools/i).
describe.skip('SettingsPage Chat Tools section (AI_ENABLED=false — hidden for soft launch)', () => {
  it('renders a "Chat Tools" heading', () => {
    render(<SettingsPage />);
    selectTab(/chat tools/i);
    expect(screen.getByText('Enabled Tools')).toBeDefined();
  });

  it('renders every tool from TOOL_REGISTRY by name', () => {
    render(<SettingsPage />);
    selectTab(/chat tools/i);
    expect(screen.getByText('get_course_info')).toBeDefined();
    expect(screen.getByText('search_catalog')).toBeDefined();
  });

  it('renders tool descriptions', () => {
    render(<SettingsPage />);
    selectTab(/chat tools/i);
    expect(screen.getByText('Get full information about a course.')).toBeDefined();
    expect(screen.getByText('Search the course catalog by keyword.')).toBeDefined();
  });

  it('enabled tool checkbox is checked; disabled tool is unchecked', () => {
    render(<SettingsPage />);
    selectTab(/chat tools/i);
    // get_course_info is in enabledTools → checked
    const checkedBox = screen.getByLabelText('get_course_info');
    expect((checkedBox as HTMLInputElement).getAttribute('data-state')).toBe('checked');
    // search_catalog is NOT in enabledTools → unchecked
    const uncheckedBox = screen.getByLabelText('search_catalog');
    expect((uncheckedBox as HTMLInputElement).getAttribute('data-state')).toBe('unchecked');
  });

  it('clicking a tool checkbox dispatches TOGGLE_TOOL with the correct name', () => {
    render(<SettingsPage />);
    selectTab(/chat tools/i);
    // Click the unchecked tool to enable it
    const uncheckedBox = screen.getByLabelText('search_catalog');
    fireEvent.click(uncheckedBox);
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'TOGGLE_TOOL', toolName: 'search_catalog' });
  });

  it('clicking an already-checked tool dispatches TOGGLE_TOOL to disable it', () => {
    render(<SettingsPage />);
    selectTab(/chat tools/i);
    const checkedBox = screen.getByLabelText('get_course_info');
    fireEvent.click(checkedBox);
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'TOGGLE_TOOL', toolName: 'get_course_info' });
  });
});

// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { UserProfile } from '@/types';
import { EMPTY_PROFILE } from '@/context/ProfileContext';

afterEach(cleanup);

// ── Router: capture navigation targets without a real router. ─────────────────
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

// ── Analytics: spy on product events. ─────────────────────────────────────────
const mockTrack = vi.fn();
vi.mock('@/lib/analytics', () => ({
  track: (...args: unknown[]) => mockTrack(...args),
}));

// ── Recommend / auto-plan path: the seed step the hub must invoke. ────────────
const mockRecommend = vi.fn();
vi.mock('@/hooks/useRecommendPlan', () => ({
  useRecommendPlan: () => ({ handleRecommendPlan: mockRecommend, noticeProps: null, confirmProps: null }),
}));

// ── Data context: tech cores + a controllable owned profile. ──────────────────
// ownedProfile is mutated by the SET_PROFILE dispatch so the hub's two-phase
// finish effect (which waits for graduation_target to settle) can resolve.
let ownedProfile: UserProfile = { ...EMPTY_PROFILE };
vi.mock('@/context/DataContext', () => ({
  useTechCoresRecord: () => ({ comp_arch: { name: 'Computer Architecture' } }),
  useUserProfile: () => ownedProfile,
}));

// ── Settings dispatch spy. ────────────────────────────────────────────────────
const mockSettingsDispatch = vi.fn();
vi.mock('@/context/SettingsContext', () => ({
  useSettingsDispatch: () => mockSettingsDispatch,
}));

// ── Profile dispatch: SET_PROFILE updates the controllable ownedProfile. ──────
const mockProfileDispatch = vi.fn((action: { type: string; profile?: UserProfile }) => {
  if (action.type === 'SET_PROFILE' && action.profile) {
    ownedProfile = action.profile;
  }
});
vi.mock('@/context/ProfileContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/context/ProfileContext')>();
  return {
    ...actual,
    useProfileDispatch: () => mockProfileDispatch,
  };
});

// ── UI context: capture optimize mode selection. ──────────────────────────────
const mockSetOptimizeMode = vi.fn();
vi.mock('@/context/UiContext', () => ({
  useUi: () => ({ setOptimizeMode: mockSetOptimizeMode }),
}));

import HomeWizardHub from './HomeWizardHub';

function advance() {
  fireEvent.click(screen.getByRole('button', { name: /^Next/ }));
}

describe('HomeWizardHub', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockTrack.mockClear();
    mockRecommend.mockClear();
    mockSettingsDispatch.mockClear();
    mockProfileDispatch.mockClear();
    mockSetOptimizeMode.mockClear();
    ownedProfile = { ...EMPTY_PROFILE };
  });

  it('starts on the standing step with a 4-step rail', () => {
    render(<HomeWizardHub />);
    expect(screen.getByText('Where are you in your degree?')).toBeDefined();
    expect(screen.getByLabelText('Setup progress')).toBeDefined();
    expect(screen.getByText('Review')).toBeDefined();
  });

  it('advances through the steps with Next', () => {
    render(<HomeWizardHub />);
    advance(); // → Goal
    expect(screen.getByText('When do you want to graduate?')).toBeDefined();
    advance(); // → Track
    expect(screen.getByText('Pick a tech core track')).toBeDefined();
    advance(); // → Review
    expect(screen.getByText('Ready to launch')).toBeDefined();
  });

  it('Back returns to the previous step', () => {
    render(<HomeWizardHub />);
    advance(); // → Goal
    fireEvent.click(screen.getByRole('button', { name: /^Back/ }));
    expect(screen.getByText('Where are you in your degree?')).toBeDefined();
  });

  it('Skip to planner routes to /plan without seeding a plan', () => {
    render(<HomeWizardHub />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Skip to planner' })[0]);
    expect(mockNavigate).toHaveBeenCalledWith('/plan');
    expect(mockRecommend).not.toHaveBeenCalled();
  });

  it('Launch persists choices, seeds via Recommend, and routes to /plan', () => {
    render(<HomeWizardHub />);
    advance(); // → Goal
    advance(); // → Track
    advance(); // → Review

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Launch planner/ }));
    });

    // Choices persisted through the same context dispatches onboarding uses.
    expect(mockSettingsDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'SET_GRAD_TARGET' })
    );
    expect(mockSettingsDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'SET_LOAD_TOLERANCE' })
    );
    expect(mockProfileDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'SET_PROFILE' })
    );
    expect(mockSetOptimizeMode).toHaveBeenCalledWith('fastest');

    // Seed + route happen after the profile settles (two-phase finish effect).
    expect(mockRecommend).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/plan');
  });

  it('fires wizard_hub_completed with the chosen mode on launch', () => {
    render(<HomeWizardHub />);
    advance();
    advance();
    advance();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Launch planner/ }));
    });
    expect(mockTrack).toHaveBeenCalledWith(
      'wizard_hub_completed',
      expect.objectContaining({ mode: 'fastest' })
    );
  });
});

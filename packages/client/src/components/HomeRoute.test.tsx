// @vitest-environment jsdom
/**
 * HomeRoute / Layout chrome wiring — TASK-078.
 *
 * Proves two things without the heavy variant/page internals:
 *   1. Each of the four variant keys resolved by useHomeVariant renders its
 *      expected component through HomeRoute's VARIANT_COMPONENTS map.
 *   2. The global Header (+ OptimizeStrip, which lives inside it) is suppressed
 *      on "/" when the active variant is `minimalist-shell` (it supplies its own
 *      chrome), and present for `cleaned-planner` and on non-home routes.
 *
 * useHomeVariant is mocked to force the resolved key deterministically — this is
 * the same value the real hook feeds into HomeRoute/Layout regardless of whether
 * it came from `?variant=`, the localStorage override, the PostHog flag, or the
 * viewport default, so mocking the hook exercises the exact wiring under test.
 */

import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { HomeVariant } from '../hooks/useHomeVariant';

// ── Force the resolved variant. ───────────────────────────────────────────────
// Mocked as a pure factory (no importOriginal) so the real hook's analytics /
// persist imports aren't pulled in — only `useHomeVariant` is consumed here, and
// `HomeVariant` is a type (erased at runtime).
let mockVariant: HomeVariant = 'cleaned-planner';
vi.mock('../hooks/useHomeVariant', () => ({
  useHomeVariant: () => mockVariant,
}));

// ── Lightweight markers for every variant target + the global Header. ─────────
vi.mock('../pages/PlannerPage', () => ({ default: () => <div data-testid="planner-page" /> }));
vi.mock('./home/HomeMinimalist', () => ({ default: () => <div data-testid="home-minimalist" /> }));
vi.mock('./home/HomeLandingDashboard', () => ({ default: () => <div data-testid="home-landing" /> }));
vi.mock('./home/HomeWizardHub', () => ({ default: () => <div data-testid="home-wizard" /> }));
vi.mock('./Header', () => ({ default: () => <header data-testid="global-header" /> }));
// Other routed pages — never reached at "/", but Layout imports them eagerly.
vi.mock('../pages/SchedulerPage', () => ({ default: () => <div data-testid="scheduler-page" /> }));
vi.mock('../pages/SettingsPage', () => ({ default: () => <div data-testid="settings-page" /> }));
vi.mock('../pages/CareerPage', () => ({ default: () => <div data-testid="career-page" /> }));

import HomeRoute from './HomeRoute';
import Layout from './Layout';

afterEach(() => {
  cleanup();
  mockVariant = 'cleaned-planner';
});

function renderHome(variant: HomeVariant) {
  mockVariant = variant;
  return render(
    <MemoryRouter initialEntries={['/']}>
      <HomeRoute />
    </MemoryRouter>,
  );
}

function renderLayoutAt(path: string, variant: HomeVariant) {
  mockVariant = variant;
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Layout />
    </MemoryRouter>,
  );
}

describe('HomeRoute variant mapping', () => {
  it('cleaned-planner → PlannerPage (the control)', () => {
    renderHome('cleaned-planner');
    expect(screen.getByTestId('planner-page')).toBeDefined();
  });

  it('minimalist-shell → HomeMinimalist', () => {
    renderHome('minimalist-shell');
    expect(screen.getByTestId('home-minimalist')).toBeDefined();
  });

  it('landing-dashboard → HomeLandingDashboard', () => {
    renderHome('landing-dashboard');
    expect(screen.getByTestId('home-landing')).toBeDefined();
  });

  it('wizard-hub → HomeWizardHub', () => {
    renderHome('wizard-hub');
    expect(screen.getByTestId('home-wizard')).toBeDefined();
  });
});

describe('Layout global chrome suppression', () => {
  it('hides the global Header on "/" for minimalist-shell (variant brings its own)', () => {
    renderLayoutAt('/', 'minimalist-shell');
    expect(screen.queryByTestId('global-header')).toBeNull();
    // The minimalist variant still renders (its own chrome lives inside it).
    expect(screen.getByTestId('home-minimalist')).toBeDefined();
  });

  it('keeps the global Header on "/" for cleaned-planner', () => {
    renderLayoutAt('/', 'cleaned-planner');
    expect(screen.getByTestId('global-header')).toBeDefined();
    expect(screen.getByTestId('planner-page')).toBeDefined();
  });

  it('keeps the global Header on non-home routes even if minimalist is the home variant', () => {
    renderLayoutAt('/settings', 'minimalist-shell');
    expect(screen.getByTestId('global-header')).toBeDefined();
    expect(screen.getByTestId('settings-page')).toBeDefined();
  });
});

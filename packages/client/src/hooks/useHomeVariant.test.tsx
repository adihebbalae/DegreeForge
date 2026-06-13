// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks for the three external resolution sources. Each test sets the return
// values to assert the precedence order: query param > override > flag > default.
const mockGetFeatureFlag = vi.fn<(key: string) => string | boolean | undefined>();
const mockSafeGetRaw = vi.fn<(key: string) => string | null>();
let mockIsMobile = false;

vi.mock('@/lib/analytics', () => ({
  getFeatureFlag: (key: string) => mockGetFeatureFlag(key),
}));

vi.mock('@/lib/persist', () => ({
  safeGetRaw: (key: string) => mockSafeGetRaw(key),
}));

vi.mock('./useMediaQuery', () => ({
  useMediaQuery: () => mockIsMobile,
}));

import { useHomeVariant } from './useHomeVariant';

function setQuery(search: string) {
  window.history.replaceState({}, '', search ? `/?${search}` : '/');
}

describe('useHomeVariant — resolution order', () => {
  beforeEach(() => {
    mockGetFeatureFlag.mockReset().mockReturnValue(undefined);
    mockSafeGetRaw.mockReset().mockReturnValue(null);
    mockIsMobile = false;
    setQuery('');
  });

  it('(a) ?variant= query param wins over everything else', () => {
    setQuery('variant=minimalist-shell');
    mockSafeGetRaw.mockReturnValue('wizard-hub');
    mockGetFeatureFlag.mockReturnValue('landing-dashboard');
    const { result } = renderHook(() => useHomeVariant());
    expect(result.current).toBe('minimalist-shell');
  });

  it('ignores an unknown ?variant value and falls through', () => {
    setQuery('variant=not-a-real-variant');
    const { result } = renderHook(() => useHomeVariant());
    expect(result.current).toBe('cleaned-planner'); // desktop default
  });

  it('(b) localStorage override wins over flag + default', () => {
    mockSafeGetRaw.mockReturnValue('wizard-hub');
    mockGetFeatureFlag.mockReturnValue('landing-dashboard');
    const { result } = renderHook(() => useHomeVariant());
    expect(result.current).toBe('wizard-hub');
  });

  it('(c) PostHog flag wins over default when no param/override', () => {
    mockGetFeatureFlag.mockReturnValue('landing-dashboard');
    const { result } = renderHook(() => useHomeVariant());
    expect(result.current).toBe('landing-dashboard');
  });

  it('(d) default is cleaned-planner on desktop', () => {
    mockIsMobile = false;
    const { result } = renderHook(() => useHomeVariant());
    expect(result.current).toBe('cleaned-planner');
  });

  it('(d) default is minimalist-shell on mobile (<768px)', () => {
    mockIsMobile = true;
    const { result } = renderHook(() => useHomeVariant());
    expect(result.current).toBe('minimalist-shell');
  });

  it('does not throw when PostHog is absent (flag returns undefined)', () => {
    mockGetFeatureFlag.mockReturnValue(undefined);
    expect(() => renderHook(() => useHomeVariant())).not.toThrow();
  });
});

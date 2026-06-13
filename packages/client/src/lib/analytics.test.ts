// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock posthog-js so we can observe capture/init without a real network client.
const mockCapture = vi.fn();
const mockInit = vi.fn();
vi.mock('posthog-js', () => ({
  default: {
    init: (...args: unknown[]) => mockInit(...args),
    capture: (...args: unknown[]) => mockCapture(...args),
  },
}));

describe('analytics.track', () => {
  beforeEach(() => {
    mockCapture.mockClear();
    mockInit.mockClear();
    vi.resetModules();
  });

  it('is a no-op when PostHog was never initialized (no key)', async () => {
    // Fresh module instance with initialized=false (initAnalytics not called).
    const { track } = await import('./analytics');
    track('some_event', { a: 1 });
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it('forwards event + props to posthog.capture once initialized', async () => {
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test_key');
    const { initAnalytics, track } = await import('./analytics');
    initAnalytics();
    track('plan_recommended', { mode: 'easiest' });
    expect(mockCapture).toHaveBeenCalledWith('plan_recommended', { mode: 'easiest' });
    vi.unstubAllEnvs();
  });
});

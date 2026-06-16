// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock posthog-js so we can observe capture/init without a real network client.
const mockCapture = vi.fn();
const mockInit = vi.fn();
const mockRegister = vi.fn();
const mockSetPersonProperties = vi.fn();
const mockCaptureException = vi.fn();
const mockGetFeatureFlag = vi.fn();

vi.mock('posthog-js', () => ({
  default: {
    init: (...args: unknown[]) => mockInit(...args),
    capture: (...args: unknown[]) => mockCapture(...args),
    register: (...args: unknown[]) => mockRegister(...args),
    setPersonProperties: (...args: unknown[]) => mockSetPersonProperties(...args),
    captureException: (...args: unknown[]) => mockCaptureException(...args),
    getFeatureFlag: (...args: unknown[]) => mockGetFeatureFlag(...args),
  },
}));

describe('analytics.track', () => {
  beforeEach(() => {
    mockCapture.mockClear();
    mockInit.mockClear();
    mockRegister.mockClear();
    mockSetPersonProperties.mockClear();
    mockCaptureException.mockClear();
    mockGetFeatureFlag.mockClear();
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

// ---------------------------------------------------------------------------
// Fix 1: syncInternalFlag — token-gate logic
// ---------------------------------------------------------------------------

describe('syncInternalFlag — local dev (no VITE_INTERNAL_TOKEN)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    localStorage.clear();
  });

  it('?internal=1 sets the flag when no token is configured', async () => {
    Object.defineProperty(window, 'location', {
      value: { search: '?internal=1' },
      writable: true,
      configurable: true,
    });
    const { initAnalytics } = await import('./analytics');
    initAnalytics(); // no VITE_POSTHOG_KEY → runs syncInternalFlag then returns early
    expect(localStorage.getItem('df_internal')).toBe('true');
  });

  it('?internal=0 removes the flag when no token is configured', async () => {
    localStorage.setItem('df_internal', 'true');
    Object.defineProperty(window, 'location', {
      value: { search: '?internal=0' },
      writable: true,
      configurable: true,
    });
    const { initAnalytics } = await import('./analytics');
    initAnalytics();
    expect(localStorage.getItem('df_internal')).toBeNull();
  });

  it('no ?internal param leaves localStorage unchanged', async () => {
    localStorage.setItem('df_internal', 'true');
    Object.defineProperty(window, 'location', {
      value: { search: '' },
      writable: true,
      configurable: true,
    });
    const { initAnalytics } = await import('./analytics');
    initAnalytics();
    expect(localStorage.getItem('df_internal')).toBe('true');
  });
});

describe('syncInternalFlag — prod (VITE_INTERNAL_TOKEN set)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    localStorage.clear();
  });

  it('?internal=<TOKEN> sets the flag when the token matches', async () => {
    vi.stubEnv('VITE_INTERNAL_TOKEN', 'supersecret');
    Object.defineProperty(window, 'location', {
      value: { search: '?internal=supersecret' },
      writable: true,
      configurable: true,
    });
    const { initAnalytics } = await import('./analytics');
    initAnalytics();
    expect(localStorage.getItem('df_internal')).toBe('true');
  });

  it('?internal=1 is ignored (does NOT set flag) when token is configured', async () => {
    vi.stubEnv('VITE_INTERNAL_TOKEN', 'supersecret');
    Object.defineProperty(window, 'location', {
      value: { search: '?internal=1' },
      writable: true,
      configurable: true,
    });
    const { initAnalytics } = await import('./analytics');
    initAnalytics();
    expect(localStorage.getItem('df_internal')).toBeNull();
  });

  it('non-matching token value is ignored', async () => {
    vi.stubEnv('VITE_INTERNAL_TOKEN', 'supersecret');
    Object.defineProperty(window, 'location', {
      value: { search: '?internal=wrongvalue' },
      writable: true,
      configurable: true,
    });
    const { initAnalytics } = await import('./analytics');
    initAnalytics();
    expect(localStorage.getItem('df_internal')).toBeNull();
  });

  it('empty ?internal= is ignored when token is configured', async () => {
    vi.stubEnv('VITE_INTERNAL_TOKEN', 'supersecret');
    Object.defineProperty(window, 'location', {
      value: { search: '?internal=' },
      writable: true,
      configurable: true,
    });
    const { initAnalytics } = await import('./analytics');
    initAnalytics();
    expect(localStorage.getItem('df_internal')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Fix 2: before_send — $exception PII scrub
// ---------------------------------------------------------------------------

// Helper: extract the before_send function passed to posthog.init
function getBeforeSend(): ((event: unknown) => unknown) | undefined {
  const call = mockInit.mock.calls[0];
  if (!call) return undefined;
  const config = call[1] as Record<string, unknown>;
  return config['before_send'] as (event: unknown) => unknown;
}

describe('before_send scrub — $exception events', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.unstubAllEnvs();
    mockInit.mockClear();
    Object.defineProperty(window, 'location', {
      value: { search: '' },
      writable: true,
      configurable: true,
    });
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test_key');
    const { initAnalytics } = await import('./analytics');
    initAnalytics();
  });

  it('scrubs course codes and letter grades from $exception_message', () => {
    const beforeSend = getBeforeSend()!;
    const result = beforeSend({
      event: '$exception',
      properties: {
        $exception_message: 'Failed to load ECE 312: grade A- not found',
        $exception_type: 'Error',
        $exception_list: [],
      },
    }) as { properties: Record<string, unknown> };
    expect(result.properties['$exception_message']).toBe(
      'Failed to load [redacted]: grade [redacted] not found'
    );
  });

  it('scrubs GPA decimal from $exception_message', () => {
    const beforeSend = getBeforeSend()!;
    const result = beforeSend({
      event: '$exception',
      properties: {
        $exception_message: 'GPA dropped to 3.75 after semester',
        $exception_type: 'Error',
        $exception_list: [],
      },
    }) as { properties: Record<string, unknown> };
    expect(result.properties['$exception_message']).toBe(
      'GPA dropped to [redacted] after semester'
    );
  });

  it('scrubs course code from $exception_type', () => {
    const beforeSend = getBeforeSend()!;
    const result = beforeSend({
      event: '$exception',
      properties: {
        $exception_message: 'something',
        $exception_type: 'ECE 460N validation error',
        $exception_list: [],
      },
    }) as { properties: Record<string, unknown> };
    expect(result.properties['$exception_type']).toBe('[redacted] validation error');
  });

  it('scrubs value and type fields inside $exception_list entries', () => {
    const beforeSend = getBeforeSend()!;
    const result = beforeSend({
      event: '$exception',
      properties: {
        $exception_message: 'err',
        $exception_type: 'Error',
        $exception_list: [
          { value: 'Course ECE 312 has grade B+', type: 'ECE 312 Error' },
        ],
      },
    }) as { properties: { $exception_list: Array<Record<string, unknown>> } };
    expect(result.properties['$exception_list'][0]['value']).toBe(
      'Course [redacted] has grade [redacted]'
    );
    expect(result.properties['$exception_list'][0]['type']).toBe('[redacted] Error');
  });

  it('passes non-$exception events through untouched', () => {
    const beforeSend = getBeforeSend()!;
    const event = {
      event: 'plan_recommended',
      properties: { mode: 'easiest', label: 'ECE 312 A-' },
    };
    const result = beforeSend(event);
    expect(result).toBe(event); // same reference, unmodified
  });

  it('returns null unchanged (drop-event signal)', () => {
    const beforeSend = getBeforeSend()!;
    expect(beforeSend(null)).toBeNull();
  });
});

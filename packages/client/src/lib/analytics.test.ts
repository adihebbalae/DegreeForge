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
// Helper: extract the before_send function passed to posthog.init
// ---------------------------------------------------------------------------
function getBeforeSend(): ((event: unknown) => unknown) | undefined {
  const call = mockInit.mock.calls[0];
  if (!call) return undefined;
  const config = call[1] as Record<string, unknown>;
  return config['before_send'] as (event: unknown) => unknown;
}

// ---------------------------------------------------------------------------
// Helper: extract the full init config passed to posthog.init
// ---------------------------------------------------------------------------
function getInitConfig(): Record<string, unknown> | undefined {
  const call = mockInit.mock.calls[0];
  if (!call) return undefined;
  return call[1] as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Part A: verify init config disables all DOM-content autocapture surfaces
// ---------------------------------------------------------------------------

describe('initAnalytics config — DOM autocapture disabled', () => {
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

  it('sets autocapture: false', () => {
    const config = getInitConfig()!;
    expect(config['autocapture']).toBe(false);
  });

  it('sets rageclick: false', () => {
    const config = getInitConfig()!;
    expect(config['rageclick']).toBe(false);
  });

  it('sets capture_heatmaps: false', () => {
    const config = getInitConfig()!;
    expect(config['capture_heatmaps']).toBe(false);
  });

  it('sets capture_dead_clicks: false', () => {
    const config = getInitConfig()!;
    expect(config['capture_dead_clicks']).toBe(false);
  });

  it('keeps disable_session_recording: true', () => {
    const config = getInitConfig()!;
    expect(config['disable_session_recording']).toBe(true);
  });

  it('keeps capture_pageview: true', () => {
    const config = getInitConfig()!;
    expect(config['capture_pageview']).toBe(true);
  });

  it('keeps capture_exceptions: true', () => {
    const config = getInitConfig()!;
    expect(config['capture_exceptions']).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Part B / scrubEvent routing — backstop scrubber tests
// ---------------------------------------------------------------------------

describe('scrubEvent — $autocapture events', () => {
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

  it('redacts a course code in $el_text of a $autocapture event', () => {
    const beforeSend = getBeforeSend()!;
    const result = beforeSend({
      event: '$autocapture',
      properties: { $el_text: 'ECE 312', $event_type: 'click' },
    }) as { properties: Record<string, unknown> };
    expect(result.properties['$el_text']).toBe('[redacted]');
    expect(result.properties['$event_type']).toBe('click'); // non-text prop untouched
  });

  it('redacts a grade in $el_text of a $autocapture event', () => {
    const beforeSend = getBeforeSend()!;
    const result = beforeSend({
      event: '$autocapture',
      properties: { $el_text: 'Grade: A+' },
    }) as { properties: Record<string, unknown> };
    expect(result.properties['$el_text']).toBe('Grade: [redacted]');
  });

  it('passes through $autocapture with no $el_text unchanged', () => {
    const beforeSend = getBeforeSend()!;
    const input = {
      event: '$autocapture',
      properties: { $event_type: 'click', $lib: 'web' },
    };
    const result = beforeSend(input) as { properties: Record<string, unknown> };
    expect(result.properties['$event_type']).toBe('click');
    expect(result.properties['$lib']).toBe('web');
  });
});

describe('scrubEvent — $copy_autocapture events', () => {
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

  it('redacts clipboard text (selected_content) in a $copy_autocapture event', () => {
    const beforeSend = getBeforeSend()!;
    const result = beforeSend({
      event: '$copy_autocapture',
      properties: { selected_content: 'ECE 312 — Grade A-' },
    }) as { properties: Record<string, unknown> };
    expect(result.properties['selected_content']).toBe('[redacted] — Grade [redacted]');
  });

  it('handles $copy_autocapture with no selected_content gracefully', () => {
    const beforeSend = getBeforeSend()!;
    const input = {
      event: '$copy_autocapture',
      properties: { $lib: 'web' },
    };
    const result = beforeSend(input) as { properties: Record<string, unknown> };
    expect(result.properties['$lib']).toBe('web');
  });
});

describe('scrubEvent — $pageview / $pageleave events', () => {
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

  it('scrubs $current_url on $pageview (future-proofing, today is a no-op)', () => {
    const beforeSend = getBeforeSend()!;
    const result = beforeSend({
      event: '$pageview',
      properties: {
        $current_url: 'https://degreeforge.app/progress',
        $pathname: '/progress',
        $referrer: 'https://degreeforge.app/',
      },
    }) as { properties: Record<string, unknown> };
    // No academic data in current routes — strings pass through unchanged
    expect(result.properties['$current_url']).toBe('https://degreeforge.app/progress');
    expect(result.properties['$pathname']).toBe('/progress');
    expect(result.properties['$referrer']).toBe('https://degreeforge.app/');
  });

  it('scrubs a hypothetical URL that embeds a course code', () => {
    const beforeSend = getBeforeSend()!;
    const result = beforeSend({
      event: '$pageview',
      properties: {
        $current_url: 'https://degreeforge.app/course/ECE 312',
        $pathname: '/course/ECE 312',
        $referrer: '',
      },
    }) as { properties: Record<string, unknown> };
    expect(result.properties['$current_url']).toBe('https://degreeforge.app/course/[redacted]');
    expect(result.properties['$pathname']).toBe('/course/[redacted]');
  });

  it('scrubs $current_url on $pageleave too', () => {
    const beforeSend = getBeforeSend()!;
    const result = beforeSend({
      event: '$pageleave',
      properties: {
        $current_url: 'https://degreeforge.app/course/ECE 460N',
        $pathname: '/course/ECE 460N',
        $referrer: '',
      },
    }) as { properties: Record<string, unknown> };
    expect(result.properties['$current_url']).toBe('https://degreeforge.app/course/[redacted]');
  });
});

describe('scrubEvent — allow-listed custom track() events pass through UNTOUCHED', () => {
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

  it('passes a benign custom event through UNCHANGED (same reference)', () => {
    const beforeSend = getBeforeSend()!;
    const event = {
      event: 'plan_recommended',
      properties: { mode: 'fastest' },
    };
    const result = beforeSend(event);
    expect(result).toBe(event); // exact same object reference — nothing cloned
  });

  it('passes onboarding_step_completed through UNCHANGED', () => {
    const beforeSend = getBeforeSend()!;
    const event = {
      event: 'onboarding_step_completed',
      properties: { step: 'import_transcript', method: 'pdf' },
    };
    const result = beforeSend(event);
    expect(result).toBe(event);
  });
});

// ---------------------------------------------------------------------------
// Fix 2: before_send scrub — $exception PII scrub (original tests, kept green)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// scrubString — unit tests for the widened COURSE_CODE_RE
// ---------------------------------------------------------------------------

// We test scrubString indirectly through the before_send scrubber on
// $exception events (which call scrubString on $exception_message).

describe('scrubString — course code coverage', () => {
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

  const cases: [string, string][] = [
    // input message                     expected output
    ['ECE 312 failed',                  '[redacted] failed'],
    ['ECE  312 double space',           '[redacted] double space'],
    ['M 408D required',                 '[redacted] required'],
    ['C S 363M prereq',                 '[redacted] prereq'],
    ['B M E 311 conflict',              '[redacted] conflict'],
    ['M E 326 not offered',             '[redacted] not offered'],
    ['E E 319K overlap',                '[redacted] overlap'],
    ['A E 333T missing',                '[redacted] missing'],
    ['took ECE 312 and ECE 445',        'took [redacted] and [redacted]'],
  ];

  for (const [input, expected] of cases) {
    it(`scrubs "${input}"`, () => {
      const beforeSend = getBeforeSend()!;
      const result = beforeSend({
        event: '$exception',
        properties: {
          $exception_message: input,
          $exception_type: 'Error',
          $exception_list: [],
        },
      }) as { properties: Record<string, unknown> };
      expect(result.properties['$exception_message']).toBe(expected);
    });
  }
});

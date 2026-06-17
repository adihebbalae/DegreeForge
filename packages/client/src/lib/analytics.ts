/// <reference types="vite/client" />
import posthog from 'posthog-js'
import type { CaptureResult } from 'posthog-js'

let initialized = false

// Patterns for scrubbing PII from autocaptured $exception events.
// Course codes: e.g. "ECE 312", "M 408D", "CS 311H"
const COURSE_CODE_RE = /\b[A-Z]{1,4}\s?\d{3}[A-Z]?\b/g
// UT letter grades: A+/A/A- through F, W, Q, CR, NC — anchored by word boundary
// on the left and a non-letter-grade character (or end of string) on the right.
const LETTER_GRADE_RE = /\b(?:CR|NC|[ABCDF][+-]?|[WQ])(?![A-Za-z0-9])/g
// GPA-looking decimals: 0.00–4.99
const GPA_DECIMAL_RE = /\b[0-4]\.\d{1,2}\b/g

function scrubString(value: string): string {
  return value
    .replace(COURSE_CODE_RE, '[redacted]')
    .replace(LETTER_GRADE_RE, '[redacted]')
    .replace(GPA_DECIMAL_RE, '[redacted]')
}

/**
 * Scrub PII from a PostHog $exception event before it is sent.
 * Non-exception events are returned untouched.
 */
function scrubExceptionEvent(event: CaptureResult): CaptureResult {
  if (event.event !== '$exception') return event

  const props = { ...event.properties }

  if (typeof props['$exception_message'] === 'string') {
    props['$exception_message'] = scrubString(props['$exception_message'])
  }
  if (typeof props['$exception_type'] === 'string') {
    props['$exception_type'] = scrubString(props['$exception_type'])
  }
  if (Array.isArray(props['$exception_list'])) {
    props['$exception_list'] = (props['$exception_list'] as unknown[]).map((entry) => {
      if (!entry || typeof entry !== 'object') return entry
      const e = { ...(entry as Record<string, unknown>) }
      if (typeof e['value'] === 'string') e['value'] = scrubString(e['value'])
      if (typeof e['type'] === 'string') e['type'] = scrubString(e['type'])
      if (e['stacktrace'] && typeof e['stacktrace'] === 'object') {
        const st = { ...(e['stacktrace'] as Record<string, unknown>) }
        if (typeof st['raw'] === 'string') st['raw'] = scrubString(st['raw'])
        e['stacktrace'] = st
      }
      return e
    })
  }

  return { ...event, properties: props }
}

/**
 * TASK-107: Persist/clear the internal-session flag from the URL param.
 * This runs before the early-return so it works even in local dev (no key).
 *
 * When VITE_INTERNAL_TOKEN is set (prod):
 *   ?internal=<TOKEN>  → sets localStorage['df_internal'] = 'true'
 *   Any other value (bare ?internal=1 etc.) → silently ignored
 *
 * When VITE_INTERNAL_TOKEN is not set (local dev):
 *   ?internal=1 → sets localStorage['df_internal'] = 'true'
 *   ?internal=0 → removes localStorage['df_internal']
 */
function syncInternalFlag() {
  try {
    const params = new URLSearchParams(window.location.search)
    if (!params.has('internal')) return

    const token = import.meta.env.VITE_INTERNAL_TOKEN as string | undefined

    if (token) {
      // Prod: only an exact token match sets the flag; anything else is a no-op
      if (params.get('internal') === token) {
        localStorage.setItem('df_internal', 'true')
      }
    } else {
      // Local dev: honor the original convenience shortcuts
      if (params.get('internal') === '1') {
        localStorage.setItem('df_internal', 'true')
      } else {
        localStorage.removeItem('df_internal')
      }
    }
  } catch {
    // localStorage may be unavailable in sandboxed iframes — ignore
  }
}

/**
 * TASK-107: If the internal flag is set AND PostHog is initialized, register
 * `internal: true` as a super property (on every event) and as a person property
 * so dashboards can filter out developer sessions.
 */
function applyInternalFlag() {
  try {
    if (localStorage.getItem('df_internal') === 'true') {
      posthog.register({ internal: true })
      posthog.setPersonProperties({ internal: true })
    }
  } catch {
    // Defensive: never throw from analytics setup
  }
}

export function initAnalytics() {
  // TASK-107: sync the flag from URL before early-return so it persists in local dev too
  syncInternalFlag()

  const key = import.meta.env.VITE_POSTHOG_KEY
  if (!key) return // local dev / no key -> disabled
  posthog.init(key, {
    api_host: import.meta.env.VITE_POSTHOG_HOST ?? 'https://us.i.posthog.com',
    person_profiles: 'identified_only',
    capture_pageview: true,
    // capture_exceptions enables autocapture of uncaught errors + unhandled promise rejections as $exception events.
    // posthog-js v1.384.0+ handles this natively via ExceptionObserver.
    capture_exceptions: true,
    // Session replay is intentionally disabled: grades, courses, and GPA render
    // on screen after transcript import and must never be recorded or transmitted.
    // Event analytics and scrubbed exception capture are unaffected.
    disable_session_recording: true,
    before_send: (event: CaptureResult | null) => {
      if (!event) return event
      return scrubExceptionEvent(event)
    },
  })
  initialized = true

  // TASK-107: tag internal/developer sessions so they can be excluded from dashboards
  applyInternalFlag()
}

/**
 * Fire a product event to PostHog. Safe no-op when PostHog was never initialized
 * (local dev / no VITE_POSTHOG_KEY), so call sites never need to guard.
 */
export function track(event: string, props?: Record<string, unknown>): void {
  if (!initialized) return
  posthog.capture(event, props)
}

/**
 * Read a PostHog feature flag value. Returns `undefined` when PostHog was never
 * initialized (local dev / no key) or the flag isn't set, so call sites can treat
 * "PostHog absent" and "flag unset" identically and fall through to their default.
 * Never throws.
 */
export function getFeatureFlag(key: string): string | boolean | undefined {
  if (!initialized) return undefined
  try {
    return posthog.getFeatureFlag(key)
  } catch {
    return undefined
  }
}

/**
 * Report an exception to PostHog. Safe no-op when PostHog is not initialized.
 *
 * PRIVACY: only the error object (message + stack) and the explicitly provided
 * `extra` object are sent. Never attach plan state, profile, grades, or course
 * data — users are promised those values never leave their device.
 */
export function captureException(error: unknown, extra?: Record<string, unknown>): void {
  if (!initialized) return
  posthog.captureException(error, extra)
}

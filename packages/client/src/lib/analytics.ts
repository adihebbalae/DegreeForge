/// <reference types="vite/client" />
import posthog from 'posthog-js'

let initialized = false

/**
 * TASK-107: Persist/clear the internal-session flag from the URL param.
 * This runs before the early-return so it works even in local dev (no key).
 * ?internal=1 → sets localStorage['df_internal'] = 'true'
 * ?internal=0 → removes localStorage['df_internal']
 */
function syncInternalFlag() {
  try {
    const params = new URLSearchParams(window.location.search)
    if (params.has('internal')) {
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
    session_recording: { maskAllInputs: true }, // mask all input values in replay (protects the access code + any sensitive entry)
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

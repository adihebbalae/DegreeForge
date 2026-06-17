/// <reference types="vite/client" />
import posthog from 'posthog-js'
import type { CaptureResult } from 'posthog-js'

let initialized = false

// ---------------------------------------------------------------------------
// Privacy invariant
//
// Only three categories of data may reach PostHog:
//   1. Explicitly allow-listed track() events — primitives/enums only, already
//      audited at every call site. Passed through UNTOUCHED by scrubEvent.
//   2. Clean $pageview / $pageleave events — current routes carry no academic
//      data, but $current_url / $pathname / $referrer are scrubbed as a guard
//      against a future route that embeds a course code or GPA.
//   3. $exception events — PII-scrubbed before send by scrubExceptionEvent.
//
// Nothing containing letter grades, course codes, or GPA may egress by ANY
// path. To enforce this:
//   A. All DOM-content autocapture surfaces are disabled in posthog.init():
//      autocapture (clicks/changes that capture $el_text), rageclick,
//      heatmaps, and dead-clicks. Session replay is also disabled.
//   B. before_send runs scrubEvent() as a belt-and-suspenders backstop: even
//      if any of the above are ever re-enabled, content is still redacted.
//
// Future maintainers: do NOT enable autocapture, heatmaps, dead-clicks, or
// session recording. Do NOT put academic data (course codes, grades, GPA) in
// any route path or URL query string.
// ---------------------------------------------------------------------------

// Patterns for scrubbing PII from events.
// Course codes: catches single-dept ("ECE 312", "M 408D") and multi-word
// departments ("C S 363M", "B M E 311", "E E 319K") with one or more spaces.
const COURSE_CODE_RE = /\b[A-Z]{1,4}(?:\s+[A-Z]{1,3})*\s*\d{3}[A-Z]?\b/g
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
 */
function scrubExceptionEvent(event: CaptureResult): CaptureResult {
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
 * Belt-and-suspenders backstop: scrubs any auto-captured DOM/URL content
 * before it is sent to PostHog, regardless of which capture surfaces are
 * enabled in the init config.
 *
 * Routing:
 *   $exception          → scrubExceptionEvent (message, type, stack)
 *   $autocapture        → scrub $el_text (element text content)
 *   $copy_autocapture   → scrub selected_content (clipboard text)
 *   $pageview /
 *   $pageleave          → scrub $current_url, $pathname, $referrer
 *   everything else     → returned UNTOUCHED (allow-listed track() events
 *                         are verified safe; scrubbing them risks false
 *                         redaction of benign strings)
 */
function scrubEvent(event: CaptureResult): CaptureResult {
  switch (event.event) {
    case '$exception': {
      return scrubExceptionEvent(event)
    }

    case '$autocapture': {
      const props = { ...event.properties }
      if (typeof props['$el_text'] === 'string') {
        props['$el_text'] = scrubString(props['$el_text'])
      }
      return { ...event, properties: props }
    }

    case '$copy_autocapture': {
      const props = { ...event.properties }
      // PostHog v1.384.0: the clipboard text is in `selected_content`
      if (typeof props['selected_content'] === 'string') {
        props['selected_content'] = scrubString(props['selected_content'])
      }
      return { ...event, properties: props }
    }

    case '$pageview':
    case '$pageleave': {
      const props = { ...event.properties }
      if (typeof props['$current_url'] === 'string') {
        props['$current_url'] = scrubString(props['$current_url'])
      }
      if (typeof props['$pathname'] === 'string') {
        props['$pathname'] = scrubString(props['$pathname'])
      }
      if (typeof props['$referrer'] === 'string') {
        props['$referrer'] = scrubString(props['$referrer'])
      }
      return { ...event, properties: props }
    }

    default:
      // Allow-listed custom track() events: return untouched.
      return event
  }
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

    // --- Privacy: disable all DOM-content autocapture surfaces ---
    // Grades, courses, and GPA render as DOM text after transcript import.
    // Any surface that reads element text or clipboard content is a data leak.
    // Verified option names against posthog-js v1.384.0 (@posthog/types PostHogConfig).
    autocapture: false,          // disables $autocapture events (clicks/changes + $el_text capture)
                                 // also disables copy/cut text capture (AutocaptureConfig.capture_copied_text)
    rageclick: false,            // disables $rageclick events (PostHogConfig.rageclick: boolean | RageclickConfig)
    capture_heatmaps: false,     // disables $heatmap_data events (PostHogConfig.capture_heatmaps)
    capture_dead_clicks: false,  // disables dead-click events (PostHogConfig.capture_dead_clicks)

    // Session replay is intentionally disabled: grades, courses, and GPA render
    // on screen after transcript import and must never be recorded or transmitted.
    disable_session_recording: true,

    before_send: (event: CaptureResult | null) => {
      if (!event) return event
      return scrubEvent(event)
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

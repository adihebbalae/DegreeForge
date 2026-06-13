/// <reference types="vite/client" />
import posthog from 'posthog-js'

let initialized = false

export function initAnalytics() {
  const key = import.meta.env.VITE_POSTHOG_KEY
  if (!key) return // local dev / no key -> disabled
  posthog.init(key, {
    api_host: import.meta.env.VITE_POSTHOG_HOST ?? 'https://us.i.posthog.com',
    person_profiles: 'identified_only',
    capture_pageview: true,
    session_recording: { maskAllInputs: true }, // mask all input values in replay (protects the access code + any sensitive entry)
  })
  initialized = true
}

/**
 * Fire a product event to PostHog. Safe no-op when PostHog was never initialized
 * (local dev / no VITE_POSTHOG_KEY), so call sites never need to guard.
 */
export function track(event: string, props?: Record<string, unknown>): void {
  if (!initialized) return
  posthog.capture(event, props)
}

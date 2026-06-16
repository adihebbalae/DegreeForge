/**
 * Feature flags for soft-launch / deployment gating.
 *
 * AI_ENABLED = false hides every UI entry point that triggers a backend /api/*
 * call (Chat panel, AI Smart Auto-Plan, AI Questionnaire, Access code field,
 * Chat Tools section in Settings). The code and server endpoints are fully
 * retained — re-enabling is a one-line change here.
 *
 * To re-enable AI features:
 *   1. Set AI_ENABLED = true below.
 *   2. Ensure ANTHROPIC_API_KEY is set server-side and the Express server is running.
 */
export const AI_ENABLED = false;

/**
 * SCHEDULE_ENABLED = false hides the two Settings sections that configure the
 * schedule optimizer (Scheduler Preferences — scoring-weight sliders, Time-of-Day,
 * Instruction Mode — and Professor Preferences). The optimizer is unreachable in the
 * alpha launch: the Schedule + Career nav links and their routes are separately
 * commented out in Header.tsx and the router, so these settings tune a feature the
 * user cannot open. The section code and the underlying reducer/state are fully
 * retained — re-enabling is a one-line change here (set SCHEDULE_ENABLED = true),
 * plus restoring the commented-out Schedule/Career nav links + route elements.
 */
export const SCHEDULE_ENABLED = false;

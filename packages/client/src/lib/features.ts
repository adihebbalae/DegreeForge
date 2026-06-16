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

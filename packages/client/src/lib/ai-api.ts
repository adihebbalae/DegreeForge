import { serverBaseUrl } from './agent-loop';

/**
 * ai-api.ts
 *
 * Thin client helper for the Express AI endpoints (/api/recommend,
 * /api/generate-questionnaire). Centralizes the base-URL resolution, the
 * `x-access-code` invite-beta header, the JSON content-type, and the non-2xx →
 * Error mapping that each caller previously hand-rolled.
 */

/**
 * POST a JSON body to an AI endpoint and return the parsed JSON response.
 *
 * @param path        endpoint path beginning with '/', e.g. '/api/recommend'
 * @param body        JSON-serializable request payload
 * @param accessCode  invite-beta access code sent as `x-access-code` (empty
 *                    string is safe — the server ignores it when the gate is off)
 * @throws Error with the server's `error` field (or HTTP statusText) on non-2xx.
 */
export async function postAiJson<T = unknown>(
  path: string,
  body: unknown,
  accessCode: string
): Promise<T> {
  const response = await fetch(`${serverBaseUrl()}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-access-code': accessCode,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}) as { error?: string });
    throw new Error((errData as { error?: string }).error || response.statusText);
  }

  return response.json() as Promise<T>;
}

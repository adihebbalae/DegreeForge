import { describe, it, expect, vi, afterEach } from 'vitest';
import { postAiJson } from './ai-api';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('postAiJson', () => {
  it('POSTs JSON with the access-code header and returns the parsed body', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ ok: 1 }), { status: 200 }));

    const out = await postAiJson<{ ok: number }>('/api/recommend', { a: 1 }, 'code-123');

    expect(out).toEqual({ ok: 1 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/api\/recommend$/);
    expect(init?.method).toBe('POST');
    const headers = init?.headers as Record<string, string>;
    expect(headers['x-access-code']).toBe('code-123');
    expect(headers['Content-Type']).toBe('application/json');
    expect(init?.body).toBe(JSON.stringify({ a: 1 }));
  });

  it('throws with the server error field on non-2xx', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'rate limited' }), { status: 429 })
    );
    await expect(postAiJson('/api/recommend', {}, '')).rejects.toThrow(/rate limited/);
  });

  it('falls back to statusText when the error body has no error field', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('not json', { status: 500, statusText: 'Internal Server Error' })
    );
    await expect(postAiJson('/api/recommend', {}, '')).rejects.toThrow(/Internal Server Error/);
  });
});

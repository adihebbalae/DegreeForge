import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Minimal express-like stubs ────────────────────────────────────────────────
function makeRes() {
  const listeners: Record<string, (() => void)[]> = {};
  const res = {
    statusCode: 200,
    body: null as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
    on(event: string, fn: () => void) {
      listeners[event] = listeners[event] ?? [];
      listeners[event].push(fn);
      return this;
    },
    emit(event: string) {
      (listeners[event] ?? []).forEach(fn => fn());
    },
  };
  return res;
}

function makeReq(ip: string) {
  return { ip } as { ip: string };
}

// ── Tests ────────────────────────────────────────────────────────────────────
describe('tokenCap middleware', () => {
  // Re-import the module fresh for each suite to get a clean buckets map.
  // We use vi.resetModules() + dynamic import pattern.
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reads TOKEN_CAP_DAILY from env', async () => {
    vi.stubEnv('TOKEN_CAP_DAILY', '5');
    const { TOKEN_CAP_DAILY } = await import('./tokenCap.js');
    expect(TOKEN_CAP_DAILY).toBe(5);
  });

  it('falls back to 200000 when env is unset', async () => {
    const { TOKEN_CAP_DAILY } = await import('./tokenCap.js');
    expect(TOKEN_CAP_DAILY).toBe(200_000);
  });

  it('allows requests under the budget', async () => {
    vi.stubEnv('TOKEN_CAP_DAILY', '3');
    const { tokenCapMiddleware } = await import('./tokenCap.js');
    const req = makeReq('1.2.3.4');
    const res = makeRes();
    const next = vi.fn();

    tokenCapMiddleware(req as any, res as any, next);
    res.emit('finish');

    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(200);
  });

  it('returns 429 after budget is exhausted', async () => {
    vi.stubEnv('TOKEN_CAP_DAILY', '2');
    const { tokenCapMiddleware } = await import('./tokenCap.js');
    const req = makeReq('10.0.0.1');
    const next = vi.fn();

    // Exhaust 2-request budget
    for (let i = 0; i < 2; i++) {
      const res = makeRes();
      tokenCapMiddleware(req as any, res as any, next);
      res.emit('finish');
    }

    // Third request should be blocked
    const blockedRes = makeRes();
    const blockedNext = vi.fn();
    tokenCapMiddleware(req as any, blockedRes as any, blockedNext);

    expect(blockedNext).not.toHaveBeenCalled();
    expect(blockedRes.statusCode).toBe(429);
  });

  it('evicts stale buckets when day window has rolled over', async () => {
    vi.stubEnv('TOKEN_CAP_DAILY', '1');
    const { tokenCapMiddleware } = await import('./tokenCap.js');
    const req = makeReq('20.0.0.1');

    // Use up the 1-request budget
    const res1 = makeRes();
    const next1 = vi.fn();
    tokenCapMiddleware(req as any, res1 as any, next1);
    res1.emit('finish');

    // Advance time past midnight
    const realNow = Date.now;
    vi.stubGlobal('Date', class extends Date {
      static now() { return realNow() + 25 * 60 * 60 * 1000; } // +25 hours
    });

    // Same IP should get a fresh bucket because stale entries are evicted
    const res2 = makeRes();
    const next2 = vi.fn();
    tokenCapMiddleware(req as any, res2 as any, next2);

    expect(next2).toHaveBeenCalledOnce();

    vi.stubGlobal('Date', Date);
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

function makeRes() {
  const res = {
    statusCode: 200,
    body: null as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  };
  return res;
}

function makeReq(headers: Record<string, string> = {}): Partial<Request> {
  return { headers } as unknown as Partial<Request>;
}

describe('requireAccessCode middleware', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('passes freely when BETA_ACCESS_SECRET is unset (local dev)', async () => {
    // env is not stubbed — BETA_ACCESS_SECRET is undefined
    const { requireAccessCode } = await import('./accessCode.js');
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    requireAccessCode(req as Request, res as unknown as Response, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(200);
  });

  it('returns 401 when secret is set and header is missing', async () => {
    vi.stubEnv('BETA_ACCESS_SECRET', 'super-secret-beta');
    const { requireAccessCode } = await import('./accessCode.js');
    const req = makeReq(); // no x-access-code header
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    requireAccessCode(req as Request, res as unknown as Response, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect((res.body as Record<string, string>).error).toBe('Invalid or missing access code');
  });

  it('returns 401 when secret is set and header value is wrong', async () => {
    vi.stubEnv('BETA_ACCESS_SECRET', 'super-secret-beta');
    const { requireAccessCode } = await import('./accessCode.js');
    const req = makeReq({ 'x-access-code': 'wrong-code-xxxx' });
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    requireAccessCode(req as Request, res as unknown as Response, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('passes when secret is set and correct header is provided', async () => {
    vi.stubEnv('BETA_ACCESS_SECRET', 'super-secret-beta');
    const { requireAccessCode } = await import('./accessCode.js');
    const req = makeReq({ 'x-access-code': 'super-secret-beta' });
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    requireAccessCode(req as Request, res as unknown as Response, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(200);
  });

  it('returns 401 when secret is set and header length differs (timing-safe path)', async () => {
    vi.stubEnv('BETA_ACCESS_SECRET', 'super-secret-beta');
    const { requireAccessCode } = await import('./accessCode.js');
    const req = makeReq({ 'x-access-code': 'short' });
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    requireAccessCode(req as Request, res as unknown as Response, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });
});

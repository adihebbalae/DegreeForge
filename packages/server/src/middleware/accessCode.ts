import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

/**
 * Invite-code access gate for the beta.
 *
 * When BETA_ACCESS_SECRET is unset or empty, this middleware is a no-op so
 * local dev works without any extra configuration.
 *
 * When BETA_ACCESS_SECRET is set, the request must include the header
 * `x-access-code` with a value that matches the secret, compared via
 * a constant-time comparison to prevent timing attacks.
 */
export function requireAccessCode(req: Request, res: Response, next: NextFunction): void {
  const secret = process.env.BETA_ACCESS_SECRET;

  // No secret configured — pass freely (local dev / no-op mode)
  if (!secret) {
    next();
    return;
  }

  const provided = req.headers['x-access-code'];

  if (typeof provided !== 'string') {
    res.status(401).json({ error: 'Invalid or missing access code' });
    return;
  }

  // Guard against length mismatch before timingSafeEqual (which requires equal
  // buffer lengths). Comparing lengths is not timing-sensitive because the
  // secret length is itself not secret.
  if (provided.length !== secret.length) {
    res.status(401).json({ error: 'Invalid or missing access code' });
    return;
  }

  const a = Buffer.from(provided);
  const b = Buffer.from(secret);

  if (!crypto.timingSafeEqual(a, b)) {
    res.status(401).json({ error: 'Invalid or missing access code' });
    return;
  }

  next();
}

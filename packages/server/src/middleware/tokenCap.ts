import { Request, Response, NextFunction } from 'express';

// TODO(TASK-030): replace IP-keying with Clerk user ID once auth is wired

export const TOKEN_CAP_DAILY = 200_000;

interface TokenBucket {
  tokens: number;
  resetAt: number;
}

function nextMidnightUtc(): number {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.getTime();
}

const buckets = new Map<string, TokenBucket>();

export function tokenCapMiddleware(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip ?? 'unknown';

  let bucket = buckets.get(ip);
  const now = Date.now();

  if (!bucket || now >= bucket.resetAt) {
    bucket = { tokens: 0, resetAt: nextMidnightUtc() };
    buckets.set(ip, bucket);
  }

  if (bucket.tokens >= TOKEN_CAP_DAILY) {
    res.status(429).json({
      error: 'Daily token limit reached',
      resetAt: new Date(bucket.resetAt).toISOString(),
    });
    return;
  }

  res.on('finish', () => {
    if (bucket) {
      bucket.tokens += 2_000;
    }
  });

  next();
}

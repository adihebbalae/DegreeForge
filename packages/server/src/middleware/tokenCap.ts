import { Request, Response, NextFunction } from 'express';

// TODO(TASK-030): replace IP-keying with Clerk user ID once auth is wired

// Per-day request budget per IP. This middleware cannot observe real token
// counts at request time (the response is streamed / returned async), so it
// enforces an approximate *request* budget rather than a true token cap.
// Each completed request is counted as 1 unit. The daily budget can be
// overridden via the TOKEN_CAP_DAILY environment variable.
//
// Naming: the exported constant retains its original name for backward
// compatibility; its value is now read from the environment.
export const TOKEN_CAP_DAILY: number = parseInt(process.env.TOKEN_CAP_DAILY ?? '200000', 10) || 200_000;

interface RequestBucket {
  requests: number;
  resetAt: number;
}

function nextMidnightUtc(): number {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.getTime();
}

const buckets = new Map<string, RequestBucket>();

// Evict buckets whose day-window has expired to prevent unbounded memory growth.
function evictStaleBuckets(now: number): void {
  for (const [ip, bucket] of buckets) {
    if (now >= bucket.resetAt) {
      buckets.delete(ip);
    }
  }
}

export function tokenCapMiddleware(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip ?? 'unknown';
  const now = Date.now();

  // Evict stale entries before every check. The map is bounded to the number
  // of unique IPs seen in the current UTC day, so this is O(map size) but
  // keeps memory proportional to active users only.
  evictStaleBuckets(now);

  let bucket = buckets.get(ip);

  if (!bucket || now >= bucket.resetAt) {
    bucket = { requests: 0, resetAt: nextMidnightUtc() };
    buckets.set(ip, bucket);
  }

  if (bucket.requests >= TOKEN_CAP_DAILY) {
    res.status(429).json({
      error: 'Daily request limit reached',
      resetAt: new Date(bucket.resetAt).toISOString(),
    });
    return;
  }

  res.on('finish', () => {
    if (bucket) {
      bucket.requests += 1;
    }
  });

  next();
}

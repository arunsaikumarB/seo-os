import type { Request, Response, NextFunction } from 'express';

/** Simple in-memory sliding-window rate limiter (per IP + path prefix). */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(opts: {
  windowMs?: number;
  max?: number;
  keyPrefix?: string;
} = {}) {
  const windowMs = opts.windowMs ?? 60_000;
  const max = opts.max ?? 120;
  const keyPrefix = opts.keyPrefix ?? 'global';

  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${keyPrefix}:${ip}`;
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - bucket.count)));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));
    if (bucket.count > max) {
      res.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests. Please retry shortly.',
        },
      });
      return;
    }
    next();
  };
}

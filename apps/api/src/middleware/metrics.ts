import type { Request, Response, NextFunction } from 'express';
import { recordRequest } from '../lib/metrics.js';

/** Record per-route latency for /metrics and ops health */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  res.on('finish', () => {
    const route = `${req.method} ${req.route?.path ?? req.path}`;
    recordRequest(route, Date.now() - start, res.statusCode >= 500);
  });
  next();
}

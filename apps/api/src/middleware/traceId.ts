import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export interface RequestWithTrace extends Request {
  traceId: string;
  requestId: string;
}

export function traceIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming =
    (req.headers['x-trace-id'] as string) ||
    (req.headers['x-request-id'] as string) ||
    (req.headers['x-correlation-id'] as string) ||
    randomUUID();
  const traceId = incoming;
  (req as RequestWithTrace).traceId = traceId;
  (req as RequestWithTrace).requestId = traceId;
  res.setHeader('X-Trace-Id', traceId);
  res.setHeader('X-Request-Id', traceId);
  res.setHeader('X-Correlation-Id', traceId);
  next();
}

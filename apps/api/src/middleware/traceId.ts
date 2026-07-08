import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export interface RequestWithTrace extends Request {
  traceId: string;
}

export function traceIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const traceId = (req.headers['x-trace-id'] as string) || randomUUID();
  (req as RequestWithTrace).traceId = traceId;
  res.setHeader('X-Trace-Id', traceId);
  next();
}

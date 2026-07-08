import type { NextFunction, Request, Response } from 'express';
import { AppError, isAppError } from '@seo-os/shared';
import { logger } from '../lib/logger.js';
import type { RequestWithTrace } from './traceId.js';

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const traceId = (req as RequestWithTrace).traceId;

  if (isAppError(err)) {
    logger.warn({ err, traceId }, err.message);
    res.status(err.status).json(err.toProblemDetails(req.originalUrl, traceId));
    return;
  }

  logger.error({ err, traceId }, 'Unhandled error');
  const problem = new AppError(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  res.status(500).json(problem.toProblemDetails(req.originalUrl, traceId));
}

export function notFoundHandler(req: Request, res: Response): void {
  const traceId = (req as RequestWithTrace).traceId;
  const problem = new AppError(
    404,
    'RESOURCE_NOT_FOUND',
    `Route not found: ${req.method} ${req.path}`
  );
  res.status(404).json(problem.toProblemDetails(req.originalUrl, traceId));
}

import type { NextFunction, Request, Response } from 'express';
import { AppError, isAppError } from '@seo-os/shared';
import { logger } from '../lib/logger.js';
import type { RequestWithTrace } from './traceId.js';

interface PostgrestErrorLike {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

function isPostgrestError(err: unknown): err is PostgrestErrorLike {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof (err as PostgrestErrorLike).code === 'string'
  );
}

function mapDatabaseError(err: PostgrestErrorLike): AppError {
  logger.error({ supabaseError: err }, 'Database error');

  if (err.code === '23505') {
    return new AppError(409, 'VALIDATION_ERROR', 'A project with this domain already exists');
  }
  if (err.code === '23503') {
    return new AppError(400, 'VALIDATION_ERROR', 'Invalid organization or user reference');
  }
  if (err.code === '22P02') {
    return new AppError(400, 'VALIDATION_ERROR', 'Invalid identifier format');
  }

  return new AppError(500, 'INTERNAL_ERROR', err.message ?? 'Database operation failed');
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const traceId = (req as RequestWithTrace).traceId;

  if (isAppError(err)) {
    logger.warn({ err, traceId }, err.message);
    res.status(err.status).json(err.toProblemDetails(req.originalUrl, traceId));
    return;
  }

  if (isPostgrestError(err)) {
    const problem = mapDatabaseError(err);
    res.status(problem.status).json(problem.toProblemDetails(req.originalUrl, traceId));
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

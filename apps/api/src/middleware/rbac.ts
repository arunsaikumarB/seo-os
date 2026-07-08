import type { NextFunction, RequestHandler, Response } from 'express';
import { AppError, ROLE_HIERARCHY } from '@seo-os/shared';
import type { OrgRole } from '@seo-os/shared';
import type { AuthenticatedRequest } from './auth.js';

export function requireRole(minRole: OrgRole): RequestHandler {
  return (req, _res: Response, next: NextFunction): void => {
    const authReq = req as AuthenticatedRequest;
    const userLevel = ROLE_HIERARCHY[authReq.auth.orgRole] ?? 0;
    const requiredLevel = ROLE_HIERARCHY[minRole] ?? 0;
    if (userLevel < requiredLevel) {
      next(new AppError(403, 'AUTH_FORBIDDEN', `Requires ${minRole} role or higher`));
      return;
    }
    next();
  };
}

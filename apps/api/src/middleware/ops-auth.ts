import { createHash, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { getEnv } from '../config/env.js';
import { authMiddleware } from './auth.js';
import { requireRole } from './rbac.js';

/** Compare bearer secrets without leaking length or prefix via timing. */
export function tokensMatch(presented: string, expected: string): boolean {
  const left = createHash('sha256').update(presented).digest();
  const right = createHash('sha256').update(expected).digest();
  return timingSafeEqual(left, right);
}

function presentedBearer(header: string | undefined): string {
  if (!header?.startsWith('Bearer ')) return '';
  return header.slice('Bearer '.length).trim();
}

type OpsAuthDeps = {
  internalToken: () => string | undefined;
  authenticateAdmin: RequestHandler;
};

const defaultDeps: OpsAuthDeps = {
  internalToken: () => getEnv().OPS_INTERNAL_TOKEN,
  authenticateAdmin: (req, res, next) => {
    void authMiddleware(req, res, (err) => {
      if (err) {
        next(err);
        return;
      }
      requireRole('admin')(req, res, next);
    });
  },
};

/**
 * /metrics and /ops/* — internal probe token, or an org owner/admin JWT
 * (X-Org-Id + membership, same as the rest of the API).
 */
export function requireOpsAccess(deps: OpsAuthDeps = defaultDeps): RequestHandler {
  return (req, res, next) => {
    const expected = deps.internalToken();
    const presented = presentedBearer(req.headers.authorization);
    if (expected && presented && tokensMatch(presented, expected)) {
      next();
      return;
    }
    deps.authenticateAdmin(req, res, next);
  };
}

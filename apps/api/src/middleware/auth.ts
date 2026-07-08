import type { NextFunction, Request, Response } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { AppError } from '@seo-os/shared';
import type { OrgRole, TenantContext } from '@seo-os/shared';
import { getEnv } from '../config/env.js';
import { getSupabaseAdmin } from '../lib/supabase.js';
import type { RequestWithTrace } from './traceId.js';

export interface AuthenticatedRequest extends RequestWithTrace {
  auth: TenantContext;
  accessToken: string;
}

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(supabaseUrl: string) {
  if (!jwksCache.has(supabaseUrl)) {
    jwksCache.set(
      supabaseUrl,
      createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`))
    );
  }
  return jwksCache.get(supabaseUrl)!;
}

async function verifyToken(token: string): Promise<{ sub: string }> {
  const env = getEnv();
  try {
    const jwks = getJwks(env.SUPABASE_URL);
    const { payload } = await jwtVerify(token, jwks, {
      issuer: `${env.SUPABASE_URL}/auth/v1`,
      audience: 'authenticated',
    });
    if (!payload.sub) throw new Error('Missing sub');
    return { sub: payload.sub };
  } catch {
    throw new AppError(401, 'AUTH_INVALID_TOKEN', 'Invalid or expired token');
  }
}

/**
 * Auth foundation — validates JWT and resolves org membership.
 * Sprint 1 will expand project-level access checks.
 */
export async function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new AppError(401, 'AUTH_INVALID_TOKEN', 'Missing authorization token');
    }

    const token = header.slice(7);
    const { sub: userId } = await verifyToken(token);
    const orgId = req.headers['x-org-id'] as string | undefined;

    if (!orgId) {
      throw new AppError(403, 'AUTH_FORBIDDEN', 'X-Org-Id header required');
    }

    const supabase = getSupabaseAdmin();
    const { data: member, error } = await supabase
      .from('org_members')
      .select('role, status')
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .single();

    if (error || !member || member.status !== 'active') {
      throw new AppError(403, 'AUTH_FORBIDDEN', 'Not a member of this organization');
    }

    const traceId = (req as RequestWithTrace).traceId;
    const projectId = req.params.projectId as string | undefined;

    (req as AuthenticatedRequest).auth = {
      userId,
      orgId,
      orgRole: member.role as OrgRole,
      projectId,
      traceId,
    };
    (req as AuthenticatedRequest).accessToken = token;

    next();
  } catch (err) {
    next(err);
  }
}

/** JWT only — no org context required (e.g. create first organization) */
export async function jwtOnlyMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new AppError(401, 'AUTH_INVALID_TOKEN', 'Missing authorization token');
    }
    const token = header.slice(7);
    const { sub: userId } = await verifyToken(token);
    const traceId = (req as RequestWithTrace).traceId;
    (req as AuthenticatedRequest).auth = {
      userId,
      orgId: '',
      orgRole: 'member',
      traceId,
    };
    (req as AuthenticatedRequest).accessToken = token;
    next();
  } catch (err) {
    next(err);
  }
}

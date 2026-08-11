import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../../middleware/rbac.js';
import type { AuthenticatedRequest } from '../../middleware/auth.js';
import {
  createExtensionHandoff,
  resolveExtensionCurrentOpportunity,
} from '../../modules/extension/extension-handoff.service.js';

function param(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

/** Mounted under /v1/projects/:projectId/extension (already auth + project access) */
export const extensionProjectRouter = Router({ mergeParams: true });

/** Mounted under /v1/extension — handoff token auth only */
export const extensionPublicRouter = Router();

extensionProjectRouter.post('/handoff', requireRole('member'), async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaceId = param(req.params.projectId);
    const body = z.object({ packageId: z.string().uuid() }).parse(req.body);
    const handoff = await createExtensionHandoff({
      workspaceId,
      orgId: authReq.auth.orgId,
      packageId: body.packageId,
    });
    res.json({ data: handoff });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /v1/extension/opportunity/current
 * Authorization: Bearer <handoffToken>
 */
extensionPublicRouter.get('/opportunity/current', async (req, res, next) => {
  try {
    const header = req.headers.authorization ?? '';
    const token =
      (header.startsWith('Bearer ') ? header.slice(7).trim() : '') ||
      String(req.headers['x-backlink-agent-handoff'] ?? '').trim() ||
      String(req.headers['x-seo-os-handoff'] ?? '').trim() ||
      String(req.query.token ?? '').trim();
    if (!token) {
      res.status(401).json({
        title: 'Unauthorized',
        detail: 'Missing extension handoff token',
      });
      return;
    }
    const data = await resolveExtensionCurrentOpportunity(token);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

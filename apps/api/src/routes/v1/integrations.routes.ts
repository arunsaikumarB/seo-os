import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '@seo-os/shared';
import { INTEGRATION_PROVIDER_KEYS } from '@seo-os/integrations';
import { authMiddleware, type AuthenticatedRequest } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import {
  connectProvider,
  createWordpressDraft,
  disconnectProvider,
  getConnectionPermissions,
  getIntegrationsSummary,
  getSyncedMetrics,
  healthCheckConnection,
  listConnections,
  listProviderCatalog,
  listSyncHistory,
  listUsage,
  queueSync,
  refreshConnectionToken,
} from '../../modules/integrations/integrations.service.js';

function param(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

export const integrationsRouter = Router({ mergeParams: true });

integrationsRouter.get('/summary', authMiddleware, requireRole('viewer'), async (req, res, next) => {
  try {
    res.json({ data: await getIntegrationsSummary(param(req.params.projectId)) });
  } catch (err) {
    next(err);
  }
});

integrationsRouter.get('/catalog', authMiddleware, requireRole('viewer'), async (_req, res, next) => {
  try {
    res.json({ data: listProviderCatalog() });
  } catch (err) {
    next(err);
  }
});

integrationsRouter.get('/connections', authMiddleware, requireRole('viewer'), async (req, res, next) => {
  try {
    res.json({ data: await listConnections(param(req.params.projectId)) });
  } catch (err) {
    next(err);
  }
});

integrationsRouter.post('/connections', authMiddleware, requireRole('admin'), async (req, res, next) => {
  try {
    const body = z
      .object({
        providerKey: z.enum(INTEGRATION_PROVIDER_KEYS as unknown as [string, ...string[]]),
        displayName: z.string().optional(),
        credentials: z.record(z.unknown()).optional(),
        config: z.record(z.unknown()).optional(),
        scopes: z.array(z.string()).optional(),
      })
      .safeParse(req.body);
    if (!body.success) throw new AppError(400, 'VALIDATION_ERROR', 'Invalid connect payload');
    const { userId } = (req as AuthenticatedRequest).auth;
    const data = await connectProvider(param(req.params.projectId), userId, {
      providerKey: body.data.providerKey as (typeof INTEGRATION_PROVIDER_KEYS)[number],
      displayName: body.data.displayName,
      credentials: body.data.credentials as Record<string, unknown> | undefined,
      config: body.data.config as Record<string, unknown> | undefined,
      scopes: body.data.scopes,
    });
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
});

integrationsRouter.post(
  '/connections/:connectionId/disconnect',
  authMiddleware,
  requireRole('admin'),
  async (req, res, next) => {
    try {
      const { userId } = (req as AuthenticatedRequest).auth;
      const data = await disconnectProvider(
        param(req.params.projectId),
        param(req.params.connectionId),
        userId
      );
      res.json({ data });
    } catch (err) {
      next(err);
    }
  }
);

integrationsRouter.post(
  '/connections/:connectionId/health',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      res.json({
        data: await healthCheckConnection(
          param(req.params.projectId),
          param(req.params.connectionId)
        ),
      });
    } catch (err) {
      next(err);
    }
  }
);

integrationsRouter.post(
  '/connections/:connectionId/refresh',
  authMiddleware,
  requireRole('admin'),
  async (req, res, next) => {
    try {
      res.json({
        data: await refreshConnectionToken(
          param(req.params.projectId),
          param(req.params.connectionId)
        ),
      });
    } catch (err) {
      next(err);
    }
  }
);

integrationsRouter.post(
  '/connections/:connectionId/sync',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const body = z
        .object({ mode: z.enum(['full', 'incremental', 'manual', 'scheduled']).optional() })
        .safeParse(req.body ?? {});
      const data = await queueSync(
        param(req.params.projectId),
        param(req.params.connectionId),
        body.success ? body.data.mode ?? 'manual' : 'manual'
      );
      res.status(202).json({ data });
    } catch (err) {
      next(err);
    }
  }
);

integrationsRouter.get(
  '/connections/:connectionId/permissions',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      res.json({
        data: await getConnectionPermissions(
          param(req.params.projectId),
          param(req.params.connectionId)
        ),
      });
    } catch (err) {
      next(err);
    }
  }
);

integrationsRouter.get('/sync-jobs', authMiddleware, requireRole('viewer'), async (req, res, next) => {
  try {
    const connectionId =
      typeof req.query.connectionId === 'string' ? req.query.connectionId : undefined;
    res.json({ data: await listSyncHistory(param(req.params.projectId), connectionId) });
  } catch (err) {
    next(err);
  }
});

integrationsRouter.get('/usage', authMiddleware, requireRole('viewer'), async (req, res, next) => {
  try {
    res.json({ data: await listUsage(param(req.params.projectId)) });
  } catch (err) {
    next(err);
  }
});

integrationsRouter.get('/metrics', authMiddleware, requireRole('viewer'), async (req, res, next) => {
  try {
    res.json({ data: await getSyncedMetrics(param(req.params.projectId)) });
  } catch (err) {
    next(err);
  }
});

integrationsRouter.post(
  '/connections/:connectionId/wordpress/drafts',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const body = z
        .object({
          title: z.string().min(1),
          content: z.string().min(1),
          status: z.literal('draft').optional(),
        })
        .safeParse(req.body);
      if (!body.success) throw new AppError(400, 'VALIDATION_ERROR', 'Invalid draft');
      const data = await createWordpressDraft(
        param(req.params.projectId),
        param(req.params.connectionId),
        body.data
      );
      res.status(201).json({ data });
    } catch (err) {
      next(err);
    }
  }
);

integrationsRouter.get(
  '/oauth/:provider/start',
  authMiddleware,
  requireRole('admin'),
  async (req, res, next) => {
    try {
      const provider = param(req.params.provider);
      if (provider !== 'google' && provider !== 'microsoft') {
        throw new AppError(400, 'VALIDATION_ERROR', 'provider must be google or microsoft');
      }
      const { buildOAuthStartUrl } = await import('../../modules/integrations/oauth.service.js');
      const { userId, orgId } = (req as AuthenticatedRequest).auth;
      const result = buildOAuthStartUrl(provider, {
        workspaceId: param(req.params.projectId),
        userId,
        orgId,
      });
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

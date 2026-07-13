import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware, type AuthenticatedRequest } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import {
  buildProviderReport,
  connectProvider,
  disconnectProvider,
  enqueueProviderWorkers,
  getProviderHealthSnapshot,
  getProviderStatistics,
  listCapabilities,
  listProviderLogs,
  listProviderTypes,
  listProviders,
  setProviderEnabled,
  testProvider,
  triggerFailover,
  configureProvider,
} from '../../modules/providers/pif.service.js';

function param(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

export const providerFrameworkRouter = Router({ mergeParams: true });

providerFrameworkRouter.get(
  '/providers',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      const type = typeof req.query.type === 'string' ? req.query.type : undefined;
      res.json({ data: await listProviders(param(req.params.projectId), type) });
    } catch (err) {
      next(err);
    }
  }
);

providerFrameworkRouter.get(
  '/providers/types',
  authMiddleware,
  requireRole('viewer'),
  async (_req, res, next) => {
    try {
      res.json({ data: await listProviderTypes() });
    } catch (err) {
      next(err);
    }
  }
);

providerFrameworkRouter.get(
  '/providers/health',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      res.json({ data: await getProviderHealthSnapshot(param(req.params.projectId)) });
    } catch (err) {
      next(err);
    }
  }
);

providerFrameworkRouter.get(
  '/providers/statistics',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      res.json({ data: await getProviderStatistics(param(req.params.projectId)) });
    } catch (err) {
      next(err);
    }
  }
);

providerFrameworkRouter.get(
  '/providers/capabilities',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      res.json({ data: await listCapabilities(param(req.params.projectId)) });
    } catch (err) {
      next(err);
    }
  }
);

providerFrameworkRouter.get(
  '/providers/logs',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      res.json({ data: await listProviderLogs(param(req.params.projectId)) });
    } catch (err) {
      next(err);
    }
  }
);

providerFrameworkRouter.get(
  '/providers/reports',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      const format = String(req.query.format ?? 'json');
      const report = await buildProviderReport(param(req.params.projectId), format);
      if (report.filename) {
        res.setHeader('Content-Type', report.contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${report.filename}"`);
        res.send(report.body);
        return;
      }
      res.type('json').send(report.body);
    } catch (err) {
      next(err);
    }
  }
);

providerFrameworkRouter.post(
  '/providers/connect',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const body = z
        .object({
          providerKey: z.string().min(1),
          authMode: z.string().optional(),
          secret: z.string().optional(),
          endpoint: z.string().optional(),
          label: z.string().optional(),
        })
        .parse(req.body);
      const { userId } = (req as AuthenticatedRequest).auth;
      res.status(201).json({
        data: await connectProvider({
          workspaceId: param(req.params.projectId),
          ...body,
          userId,
        }),
      });
    } catch (err) {
      next(err);
    }
  }
);

providerFrameworkRouter.post(
  '/providers/disconnect',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const body = z.object({ providerKey: z.string().min(1) }).parse(req.body);
      const { userId } = (req as AuthenticatedRequest).auth;
      res.json({
        data: await disconnectProvider(param(req.params.projectId), body.providerKey, userId),
      });
    } catch (err) {
      next(err);
    }
  }
);

providerFrameworkRouter.post(
  '/providers/test',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const body = z.object({ providerKey: z.string().min(1) }).parse(req.body);
      const { userId } = (req as AuthenticatedRequest).auth;
      res.json({
        data: await testProvider(param(req.params.projectId), body.providerKey, userId),
      });
    } catch (err) {
      next(err);
    }
  }
);

providerFrameworkRouter.post(
  '/providers/enable',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const body = z.object({ providerKey: z.string().min(1) }).parse(req.body);
      const { userId } = (req as AuthenticatedRequest).auth;
      res.json({
        data: await setProviderEnabled(param(req.params.projectId), body.providerKey, true, userId),
      });
    } catch (err) {
      next(err);
    }
  }
);

providerFrameworkRouter.post(
  '/providers/disable',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const body = z.object({ providerKey: z.string().min(1) }).parse(req.body);
      const { userId } = (req as AuthenticatedRequest).auth;
      res.json({
        data: await setProviderEnabled(param(req.params.projectId), body.providerKey, false, userId),
      });
    } catch (err) {
      next(err);
    }
  }
);

providerFrameworkRouter.post(
  '/providers/failover',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const body = z
        .object({
          fromProviderKey: z.string().min(1),
          toProviderKey: z.string().optional(),
          reason: z.string().optional(),
        })
        .parse(req.body);
      const { userId } = (req as AuthenticatedRequest).auth;
      res.json({
        data: await triggerFailover({
          workspaceId: param(req.params.projectId),
          ...body,
          userId,
        }),
      });
    } catch (err) {
      next(err);
    }
  }
);

providerFrameworkRouter.post(
  '/providers/configure',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const body = z
        .object({
          providerKey: z.string().min(1),
          enabled: z.boolean().optional(),
          priority: z.number().int().optional(),
          endpoint: z.string().optional(),
          timeoutMs: z.number().int().optional(),
          retries: z.number().int().optional(),
          rateLimitRpm: z.number().int().optional(),
          fallbackProviderKey: z.string().optional(),
          settings: z.record(z.unknown()).optional(),
        })
        .parse(req.body);
      const { userId } = (req as AuthenticatedRequest).auth;
      res.json({
        data: await configureProvider({
          workspaceId: param(req.params.projectId),
          ...body,
          userId,
        }),
      });
    } catch (err) {
      next(err);
    }
  }
);

providerFrameworkRouter.post(
  '/providers/workers/refresh',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      res.json({ data: await enqueueProviderWorkers(param(req.params.projectId)) });
    } catch (err) {
      next(err);
    }
  }
);

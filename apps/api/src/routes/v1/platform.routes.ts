import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '@seo-os/shared';
import { authMiddleware, type AuthenticatedRequest } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import {
  listAuditLogs,
  listNotifications,
  listPlatformActivity,
  markAllNotificationsRead,
  markNotificationRead,
} from '../../modules/platform/event-bus.service.js';
import {
  advanceWorkforceJob,
  createWorkforceJob,
  getWorkforceJob,
  listWorkforceJobs,
} from '../../modules/platform/workforce-context.js';

function param(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

export const platformRouter = Router({ mergeParams: true });

platformRouter.get('/activity', authMiddleware, requireRole('viewer'), async (req, res, next) => {
  try {
    const workspaceId = param(req.params.projectId);
    const q = z
      .object({
        limit: z.coerce.number().int().min(1).max(100).optional(),
        cursor: z.string().optional(),
      })
      .safeParse(req.query);
    if (!q.success) throw new AppError(400, 'VALIDATION_ERROR', 'Invalid query');
    const items = await listPlatformActivity(workspaceId, {
      limit: q.data.limit,
      cursor: q.data.cursor,
    });
    res.json({ data: { items } });
  } catch (err) {
    next(err);
  }
});

platformRouter.get('/workforce', authMiddleware, requireRole('viewer'), async (req, res, next) => {
  try {
    const jobs = listWorkforceJobs(param(req.params.projectId));
    res.json({ data: { jobs } });
  } catch (err) {
    next(err);
  }
});

platformRouter.post(
  '/workforce',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const { orgId } = (req as AuthenticatedRequest).auth;
      const body = z
        .object({
          campaignId: z.string().uuid().optional(),
          agentChain: z.array(z.string()).optional(),
        })
        .safeParse(req.body);
      if (!body.success) throw new AppError(400, 'VALIDATION_ERROR', 'Invalid body');
      const job = createWorkforceJob({
        workspaceId: param(req.params.projectId),
        orgId,
        projectId: param(req.params.projectId),
        campaignId: body.data.campaignId,
        agentChain: body.data.agentChain,
      });
      res.status(201).json({ data: job });
    } catch (err) {
      next(err);
    }
  }
);

platformRouter.post(
  '/workforce/:jobId/advance',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const body = z
        .object({
          shared: z.record(z.unknown()).optional(),
          status: z
            .enum(['queued', 'running', 'waiting_approval', 'completed', 'failed'])
            .optional(),
          nextAgent: z.string().optional(),
        })
        .safeParse(req.body);
      if (!body.success) throw new AppError(400, 'VALIDATION_ERROR', 'Invalid body');
      const job = advanceWorkforceJob(param(req.params.jobId), body.data);
      if (!job) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Workforce job not found');
      res.json({ data: job });
    } catch (err) {
      next(err);
    }
  }
);

platformRouter.get(
  '/workforce/:jobId',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      const job = getWorkforceJob(param(req.params.jobId));
      if (!job) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Workforce job not found');
      res.json({ data: job });
    } catch (err) {
      next(err);
    }
  }
);

/** User-scoped notifications (not project-scoped) */
export const notificationsRouter = Router();

notificationsRouter.get('/', authMiddleware, async (req, res, next) => {
  try {
    const { userId } = (req as AuthenticatedRequest).auth;
    const q = z.object({ unreadOnly: z.coerce.boolean().optional() }).safeParse(req.query);
    const items = await listNotifications(userId, q.success ? (q.data.unreadOnly ?? false) : false);
    res.json({
      data: {
        items,
        unreadCount: items.filter((n: { read_at?: string | null }) => !n.read_at).length,
      },
    });
  } catch (err) {
    next(err);
  }
});

notificationsRouter.post('/:id/read', authMiddleware, async (req, res, next) => {
  try {
    const { userId } = (req as AuthenticatedRequest).auth;
    const item = await markNotificationRead(param(req.params.id), userId);
    res.json({ data: item });
  } catch (err) {
    next(err);
  }
});

notificationsRouter.post('/read-all', authMiddleware, async (req, res, next) => {
  try {
    const { userId } = (req as AuthenticatedRequest).auth;
    await markAllNotificationsRead(userId);
    res.json({ data: { ok: true } });
  } catch (err) {
    next(err);
  }
});

notificationsRouter.get('/prefs', authMiddleware, async (req, res, next) => {
  try {
    const { userId } = (req as AuthenticatedRequest).auth;
    const { getNotificationPrefs } = await import('../../modules/platform/stage-notify.service.js');
    res.json({ data: await getNotificationPrefs(userId) });
  } catch (err) {
    next(err);
  }
});

notificationsRouter.patch('/prefs', authMiddleware, async (req, res, next) => {
  try {
    const { userId } = (req as AuthenticatedRequest).auth;
    const body = z
      .object({
        inApp: z.boolean().optional(),
        desktop: z.boolean().optional(),
        emailLongRunning: z.boolean().optional(),
      })
      .parse(req.body ?? {});
    const { updateNotificationPrefs } = await import('../../modules/platform/stage-notify.service.js');
    res.json({ data: await updateNotificationPrefs(userId, body) });
  } catch (err) {
    next(err);
  }
});

export const auditRouter = Router();

auditRouter.get('/:orgId/audit', authMiddleware, requireRole('admin'), async (req, res, next) => {
  try {
    const q = z.object({ limit: z.coerce.number().int().min(1).max(200).optional() }).safeParse(req.query);
    const items = await listAuditLogs(param(req.params.orgId), q.success ? q.data.limit : 50);
    res.json({ data: { items } });
  } catch (err) {
    next(err);
  }
});

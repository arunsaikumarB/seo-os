import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '@seo-os/shared';
import { authMiddleware, type AuthenticatedRequest } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import {
  acceptBetaInvitation,
  createAnnouncement,
  createBetaInvitation,
  enableOrgBeta,
  getBetaDashboard,
  getBetaStatus,
  listAnnouncements,
  listFeedback,
  seedDefaultAnnouncement,
  submitFeedback,
  trackUsageEvent,
} from '../../modules/beta/beta.service.js';

function param(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

export const betaOrgRouter = Router({ mergeParams: true });

betaOrgRouter.use(authMiddleware);

betaOrgRouter.get('/status', requireRole('viewer'), async (req, res, next) => {
  try {
    res.json({ data: await getBetaStatus(param(req.params.orgId)) });
  } catch (err) {
    next(err);
  }
});

betaOrgRouter.post('/enable', requireRole('admin'), async (req, res, next) => {
  try {
    const { userId } = (req as AuthenticatedRequest).auth;
    const body = z.object({ cohort: z.string().optional() }).safeParse(req.body ?? {});
    const data = await enableOrgBeta(param(req.params.orgId), {
      cohort: body.success ? body.data.cohort : undefined,
      invitedBy: userId,
    });
    await seedDefaultAnnouncement().catch(() => undefined);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

betaOrgRouter.get('/dashboard', requireRole('viewer'), async (req, res, next) => {
  try {
    res.json({ data: await getBetaDashboard(param(req.params.orgId)) });
  } catch (err) {
    next(err);
  }
});

betaOrgRouter.get('/feedback', requireRole('viewer'), async (req, res, next) => {
  try {
    res.json({ data: await listFeedback(param(req.params.orgId)) });
  } catch (err) {
    next(err);
  }
});

betaOrgRouter.post('/feedback', requireRole('member'), async (req, res, next) => {
  try {
    const body = z
      .object({
        type: z.enum(['bug', 'feature', 'general']),
        title: z.string().min(3).max(200),
        body: z.string().min(5).max(8000),
        severity: z.enum(['critical', 'high', 'medium', 'low', 'info']).optional(),
        category: z.string().max(80).optional(),
        workspaceId: z.string().uuid().optional(),
        screenshotUrl: z.string().url().optional().or(z.literal('')),
        environment: z.record(z.unknown()).optional(),
      })
      .safeParse(req.body);
    if (!body.success) throw new AppError(400, 'VALIDATION_ERROR', 'Invalid feedback');
    const { userId } = (req as AuthenticatedRequest).auth;
    const data = await submitFeedback({
      orgId: param(req.params.orgId),
      userId,
      type: body.data.type,
      title: body.data.title,
      body: body.data.body,
      severity: body.data.severity,
      category: body.data.category,
      workspaceId: body.data.workspaceId,
      screenshotUrl: body.data.screenshotUrl || undefined,
      environment: {
        userAgent: req.get('user-agent'),
        ...(body.data.environment ?? {}),
      },
    });
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
});

betaOrgRouter.post('/events', requireRole('viewer'), async (req, res, next) => {
  try {
    const body = z
      .object({
        eventKey: z.string().min(1),
        featureKey: z.string().optional(),
        workspaceId: z.string().uuid().optional(),
        payload: z.record(z.unknown()).optional(),
      })
      .safeParse(req.body);
    if (!body.success) throw new AppError(400, 'VALIDATION_ERROR', 'Invalid event');
    const { userId } = (req as AuthenticatedRequest).auth;
    res.json({
      data: await trackUsageEvent({
        orgId: param(req.params.orgId),
        userId,
        eventKey: body.data.eventKey,
        featureKey: body.data.featureKey,
        workspaceId: body.data.workspaceId,
        payload: body.data.payload,
      }),
    });
  } catch (err) {
    next(err);
  }
});

betaOrgRouter.post('/invitations', requireRole('admin'), async (req, res, next) => {
  try {
    const body = z
      .object({
        email: z.string().email().optional(),
        notes: z.string().max(500).optional(),
        expiresInDays: z.number().int().min(1).max(90).optional(),
      })
      .safeParse(req.body ?? {});
    if (!body.success) throw new AppError(400, 'VALIDATION_ERROR', 'Invalid invitation');
    const { userId } = (req as AuthenticatedRequest).auth;
    const data = await createBetaInvitation({
      orgId: param(req.params.orgId),
      email: body.data.email,
      notes: body.data.notes,
      expiresInDays: body.data.expiresInDays,
      invitedBy: userId,
    });
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
});

betaOrgRouter.post('/invitations/accept', requireRole('admin'), async (req, res, next) => {
  try {
    const body = z.object({ code: z.string().min(4) }).safeParse(req.body);
    if (!body.success) throw new AppError(400, 'VALIDATION_ERROR', 'Code required');
    const { userId } = (req as AuthenticatedRequest).auth;
    const data = await acceptBetaInvitation(
      body.data.code,
      param(req.params.orgId),
      userId
    );
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

betaOrgRouter.post('/announcements', requireRole('admin'), async (req, res, next) => {
  try {
    const body = z
      .object({
        title: z.string().min(3),
        body: z.string().min(3),
        severity: z.enum(['info', 'success', 'warning', 'critical']).optional(),
        audience: z.enum(['beta', 'all', 'admins']).optional(),
        href: z.string().optional(),
      })
      .safeParse(req.body);
    if (!body.success) throw new AppError(400, 'VALIDATION_ERROR', 'Invalid announcement');
    const { userId } = (req as AuthenticatedRequest).auth;
    res.status(201).json({
      data: await createAnnouncement({ ...body.data, createdBy: userId }),
    });
  } catch (err) {
    next(err);
  }
});

/** Global announcements (authenticated) */
export const betaGlobalRouter = Router();
betaGlobalRouter.get('/announcements', authMiddleware, async (_req, res, next) => {
  try {
    res.json({ data: await listAnnouncements({ betaOnly: true }) });
  } catch (err) {
    next(err);
  }
});

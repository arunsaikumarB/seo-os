import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '@seo-os/shared';
import { authMiddleware, type AuthenticatedRequest } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import {
  exportTechnicalIssues,
  getAudit,
  getTechnicalAnalytics,
  getTechnicalSummary,
  listAudits,
  listIssues,
  listTechnicalAgents,
  listTechnicalModules,
  startTechnicalAudit,
  updateIssueStatus,
} from '../../modules/technical-seo/technical-seo.service.js';

function param(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

export const technicalSeoRouter = Router({ mergeParams: true });

technicalSeoRouter.get('/summary', authMiddleware, requireRole('viewer'), async (req, res, next) => {
  try {
    res.json({ data: await getTechnicalSummary(param(req.params.projectId)) });
  } catch (err) {
    next(err);
  }
});

technicalSeoRouter.get('/modules', authMiddleware, requireRole('viewer'), async (_req, res, next) => {
  try {
    res.json({ data: await listTechnicalModules() });
  } catch (err) {
    next(err);
  }
});

technicalSeoRouter.get('/agents', authMiddleware, requireRole('viewer'), async (_req, res, next) => {
  try {
    res.json({ data: await listTechnicalAgents() });
  } catch (err) {
    next(err);
  }
});

technicalSeoRouter.get('/analytics', authMiddleware, requireRole('viewer'), async (req, res, next) => {
  try {
    res.json({ data: await getTechnicalAnalytics(param(req.params.projectId)) });
  } catch (err) {
    next(err);
  }
});

technicalSeoRouter.get('/audits', authMiddleware, requireRole('viewer'), async (req, res, next) => {
  try {
    res.json({ data: await listAudits(param(req.params.projectId)) });
  } catch (err) {
    next(err);
  }
});

technicalSeoRouter.get('/audits/:auditId', authMiddleware, requireRole('viewer'), async (req, res, next) => {
  try {
    const data = await getAudit(param(req.params.auditId), param(req.params.projectId));
    if (!data) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Audit not found');
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

technicalSeoRouter.post('/audits', authMiddleware, requireRole('member'), async (req, res, next) => {
  try {
    const body = z
      .object({
        targetUrl: z.string().url(),
        mode: z.enum(['full', 'incremental', 'quick']).optional(),
      })
      .safeParse(req.body);
    if (!body.success) throw new AppError(400, 'VALIDATION_ERROR', 'Invalid audit request');
    const { userId } = (req as AuthenticatedRequest).auth;
    const data = await startTechnicalAudit(param(req.params.projectId), userId, body.data);
    res.status(202).json({ data });
  } catch (err) {
    next(err);
  }
});

technicalSeoRouter.get('/issues', authMiddleware, requireRole('viewer'), async (req, res, next) => {
  try {
    const q = z
      .object({
        auditId: z.string().uuid().optional(),
        severity: z.string().optional(),
        status: z.string().optional(),
      })
      .safeParse(req.query);
    res.json({
      data: await listIssues(param(req.params.projectId), q.success ? q.data : {}),
    });
  } catch (err) {
    next(err);
  }
});

technicalSeoRouter.patch(
  '/issues/:issueId',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const body = z
        .object({
          status: z.enum(['open', 'in_progress', 'fixed', 'ignored', 'reopened']),
        })
        .safeParse(req.body);
      if (!body.success) throw new AppError(400, 'VALIDATION_ERROR', 'Invalid status');
      const data = await updateIssueStatus(
        param(req.params.issueId),
        param(req.params.projectId),
        body.data.status
      );
      res.json({ data });
    } catch (err) {
      next(err);
    }
  }
);

technicalSeoRouter.get('/export', authMiddleware, requireRole('member'), async (req, res, next) => {
  try {
    const q = z
      .object({ format: z.enum(['csv', 'xlsx', 'json', 'pdf']).default('csv') })
      .safeParse(req.query);
    if (!q.success) throw new AppError(400, 'VALIDATION_ERROR', 'Invalid format');
    const file = await exportTechnicalIssues(param(req.params.projectId), q.data.format);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.send(file.body);
  } catch (err) {
    next(err);
  }
});

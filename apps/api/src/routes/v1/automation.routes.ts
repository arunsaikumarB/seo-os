import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '@seo-os/shared';
import { TRACKING_STATUSES } from '@seo-os/backlink-builder';
import { authMiddleware, type AuthenticatedRequest } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import {
  createImport,
  getAutomationRun,
  getAutomationSummary,
  getImportDetail,
  listImports,
  listSubmissions,
  listTracking,
  parseImportContent,
  runAutomationPipeline,
  runVerificationCheck,
  updateSubmissionStatus,
} from '../../modules/backlinks/automation.service.js';

function param(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

const importSchema = z.object({
  sourceType: z.enum(['csv', 'excel', 'txt', 'manual', 'url_list']),
  content: z.string().min(1),
  fileName: z.string().optional(),
});

const submissionSchema = z.object({
  status: z.enum(['prepared', 'submitted', 'waiting', 'accepted', 'rejected', 'published']),
  notes: z.string().optional(),
});

export const automationRouter = Router({ mergeParams: true });

automationRouter.get('/summary', authMiddleware, requireRole('viewer'), async (req, res, next) => {
  try {
    res.json({ data: await getAutomationSummary(param(req.params.projectId)) });
  } catch (err) {
    next(err);
  }
});

automationRouter.get('/imports', authMiddleware, requireRole('viewer'), async (req, res, next) => {
  try {
    res.json({ data: await listImports(param(req.params.projectId)) });
  } catch (err) {
    next(err);
  }
});

automationRouter.get(
  '/imports/:importId',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      const detail = await getImportDetail(param(req.params.importId), param(req.params.projectId));
      if (!detail) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Import not found');
      res.json({ data: detail });
    } catch (err) {
      next(err);
    }
  }
);

automationRouter.post('/import', authMiddleware, requireRole('member'), async (req, res, next) => {
  try {
    const body = importSchema.parse(req.body);
    const { userId } = (req as AuthenticatedRequest).auth;
    const urls = await parseImportContent(body.content, body.sourceType);
    const result = await createImport(param(req.params.projectId), body.sourceType, urls, {
      fileName: body.fileName,
      userId,
    });
    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
});

automationRouter.post(
  '/imports/:importId/run',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const { orgId, userId } = (req as AuthenticatedRequest).auth;
      const result = await runAutomationPipeline(
        param(req.params.projectId),
        param(req.params.importId),
        orgId,
        userId
      );
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

automationRouter.get(
  '/runs/:runId',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      const run = await getAutomationRun(param(req.params.runId), param(req.params.projectId));
      if (!run) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Run not found');
      res.json({ data: run });
    } catch (err) {
      next(err);
    }
  }
);

automationRouter.get('/tracking', authMiddleware, requireRole('viewer'), async (req, res, next) => {
  try {
    const status =
      typeof req.query.status === 'string' &&
      (TRACKING_STATUSES as readonly string[]).includes(req.query.status)
        ? (req.query.status as (typeof TRACKING_STATUSES)[number])
        : undefined;
    res.json({ data: await listTracking(param(req.params.projectId), status) });
  } catch (err) {
    next(err);
  }
});

automationRouter.get(
  '/submissions',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      res.json({ data: await listSubmissions(param(req.params.projectId)) });
    } catch (err) {
      next(err);
    }
  }
);

automationRouter.patch(
  '/submissions/:submissionId',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const body = submissionSchema.parse(req.body);
      const result = await updateSubmissionStatus(
        param(req.params.submissionId),
        param(req.params.projectId),
        body.status,
        body.notes
      );
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

automationRouter.post(
  '/verification/:backlinkId/check',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const result = await runVerificationCheck(
        param(req.params.projectId),
        param(req.params.backlinkId)
      );
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

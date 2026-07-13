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
  enqueueVerificationCheck,
  updateSubmissionStatus,
} from '../../modules/backlinks/automation.service.js';
import {
  discoverProjectKeywords,
  enqueueAutomationPipeline,
  listDiscoveryRuns,
  runDiscoverWebsites,
} from '../../modules/backlinks/discovery.service.js';
import { listKeywords } from '../../modules/intelligence/keyword.service.js';

function param(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

const importSchema = z.object({
  sourceType: z.enum(['csv', 'excel', 'txt', 'manual', 'url_list']),
  content: z.string().min(1),
  fileName: z.string().optional(),
});

const submissionSchema = z.object({
  status: z.enum([
    'prepared',
    'ready',
    'awaiting_approval',
    'submitted',
    'waiting',
    'pending_review',
    'accepted',
    'rejected',
    'failed',
    'published',
    'verified',
  ]),
  notes: z.string().optional(),
});

const discoverSchema = z.object({
  website: z.string().optional(),
  industry: z.string().optional(),
  country: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  targetDr: z.number().int().min(0).max(100).optional(),
  targetTraffic: z.number().int().min(0).optional(),
});

const keywordDiscoverSchema = z.object({
  primaryKeywords: z.array(z.string().min(1)).min(1),
  industry: z.string().optional(),
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
      const result = await enqueueAutomationPipeline(
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

automationRouter.post('/discover', authMiddleware, requireRole('member'), async (req, res, next) => {
  try {
    const body = discoverSchema.parse(req.body);
    const { orgId, userId } = (req as AuthenticatedRequest).auth;
    const result = await runDiscoverWebsites(param(req.params.projectId), body, {
      userId,
      orgId,
    });
    res.status(201).json({
      data: {
        ...result,
        disclaimer:
          'Authority, traffic, and success metrics are Estimated until a live SEO provider is connected.',
      },
    });
  } catch (err) {
    next(err);
  }
});

automationRouter.get(
  '/discover/runs',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      res.json({ data: await listDiscoveryRuns(param(req.params.projectId)) });
    } catch (err) {
      next(err);
    }
  }
);

automationRouter.get(
  '/keywords',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      const rows = await listKeywords(param(req.params.projectId));
      res.json({
        data: rows.map((k) => ({
          ...k,
          metricsSource: (k.metadata as { metrics_source?: string } | null)?.metrics_source ?? 'estimated',
          estimated: true,
        })),
      });
    } catch (err) {
      next(err);
    }
  }
);

automationRouter.post(
  '/keywords/discover',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const body = keywordDiscoverSchema.parse(req.body);
      const result = await discoverProjectKeywords(
        param(req.params.projectId),
        body.primaryKeywords,
        body.industry
      );
      res.status(201).json({ data: result });
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
      const rows = await listSubmissions(param(req.params.projectId));
      res.json({
        data: rows.map((s) => ({
          ...s,
          estimatedReviewHours: s.estimated_review_hours,
          estimatedApprovalHours: s.estimated_approval_hours,
          metricsLabels: {
            estimated_review_hours: 'Estimated',
            estimated_approval_hours: 'Estimated',
          },
        })),
      });
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
      const result = await enqueueVerificationCheck(
        param(req.params.projectId),
        param(req.params.backlinkId)
      );
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

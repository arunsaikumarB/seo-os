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
  listAutomationRunLogs,
  listImports,
  listSubmissions,
  listTracking,
  parseImportContent,
  enqueueVerificationCheck,
  updateSubmissionStatus,
} from '../../modules/backlinks/automation.service.js';
import { extractRichImportRows } from '@seo-os/backlink-builder';
import {
  discoverProjectKeywords,
  enqueueAutomationPipeline,
  listDiscoveryRuns,
  runDiscoverWebsites,
} from '../../modules/backlinks/discovery.service.js';
import { listKeywords } from '../../modules/intelligence/keyword.service.js';
import {
  getClassificationAnalytics,
  getClassificationQueues,
  recordClassificationCorrection,
} from '../../modules/backlinks/classification.service.js';
import { OPPORTUNITY_CLASSIFICATION_TYPES } from '@seo-os/backlink-builder';

function param(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

const importSchema = z.object({
  sourceType: z.enum(['csv', 'excel', 'txt', 'manual', 'url_list']),
  content: z.string().min(1),
  fileName: z.string().optional(),
  /** When true (default), enqueue classify/score/content/queue after import. */
  runPipeline: z.boolean().optional().default(true),
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

automationRouter.get(
  '/classification/analytics',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      res.json({ data: await getClassificationAnalytics(param(req.params.projectId)) });
    } catch (err) {
      next(err);
    }
  }
);

automationRouter.get(
  '/classification/queues',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      res.json({ data: await getClassificationQueues(param(req.params.projectId)) });
    } catch (err) {
      next(err);
    }
  }
);

automationRouter.get(
  '/classification/types',
  authMiddleware,
  requireRole('viewer'),
  async (_req, res, next) => {
    try {
      res.json({
        data: OPPORTUNITY_CLASSIFICATION_TYPES.map((t) => ({
          id: t.id,
          displayName: t.displayName,
          queue: t.queue,
          agent: t.agent,
          storageType: t.storageType,
        })),
      });
    } catch (err) {
      next(err);
    }
  }
);

/** Phase 2 AI Review board — additive; existing classification endpoints unchanged. */
automationRouter.get(
  '/ai-review',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      const { getAiReviewBoard } = await import(
        '../../modules/campaigns/ai-review.service.js'
      );
      res.json({ data: await getAiReviewBoard(param(req.params.projectId)) });
    } catch (err) {
      next(err);
    }
  }
);

automationRouter.post(
  '/ai-review/bulk',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const body = z
        .object({
          action: z.enum(['approve', 'reject', 'unsupported', 'outreach', 'retry_analysis']),
          itemIds: z.array(z.string().uuid()).min(1).max(500),
        })
        .parse(req.body);
      const { bulkAiReviewAction } = await import(
        '../../modules/campaigns/ai-review.service.js'
      );
      res.json({
        data: await bulkAiReviewAction(
          param(req.params.projectId),
          body.action,
          body.itemIds
        ),
      });
    } catch (err) {
      next(err);
    }
  }
);

automationRouter.post(
  '/ai-review/:opportunityId/classify',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const body = z.object({ classificationId: z.string().min(1) }).parse(req.body);
      const { setAiReviewClassification } = await import(
        '../../modules/campaigns/ai-review.service.js'
      );
      res.json({
        data: await setAiReviewClassification(
          param(req.params.projectId),
          param(req.params.opportunityId),
          body.classificationId
        ),
      });
    } catch (err) {
      next(err);
    }
  }
);

automationRouter.post(
  '/ai-review/backfill',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const { backfillAiReviewFields } = await import(
        '../../modules/campaigns/ai-review.service.js'
      );
      res.json({ data: await backfillAiReviewFields(param(req.params.projectId)) });
    } catch (err) {
      next(err);
    }
  }
);

/** Phase 3 — Content generation pipeline (additive endpoints). */
automationRouter.get(
  '/content-generation',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      const { getContentGenerationBoard } = await import(
        '../../modules/campaigns/content-generation.service.js'
      );
      res.json({ data: await getContentGenerationBoard(param(req.params.projectId)) });
    } catch (err) {
      next(err);
    }
  }
);

automationRouter.post(
  '/content-generation/generate',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const body = z
        .object({
          itemIds: z.array(z.string().uuid()).max(500).optional(),
        })
        .parse(req.body ?? {});
      const { enqueueContentGeneration } = await import(
        '../../modules/campaigns/content-generation.service.js'
      );
      res.json({
        data: await enqueueContentGeneration(param(req.params.projectId), {
          itemIds: body.itemIds,
          stage: 'all',
        }),
      });
    } catch (err) {
      next(err);
    }
  }
);

automationRouter.post(
  '/content-generation/bulk',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const body = z
        .object({
          action: z.enum([
            'generate_all',
            'generate_selected',
            'retry_failed',
            'retry_missing_images',
            'retry_missing_metadata',
            'retry_missing_videos',
            'approve_selected',
            'approve_all',
            'reject_selected',
            'delete_packages',
            'export_packages',
          ]),
          itemIds: z.array(z.string().uuid()).max(500).optional().default([]),
        })
        .parse(req.body);
      const { bulkContentGenerationAction } = await import(
        '../../modules/campaigns/content-generation.service.js'
      );
      res.json({
        data: await bulkContentGenerationAction(
          param(req.params.projectId),
          body.action,
          body.itemIds
        ),
      });
    } catch (err) {
      next(err);
    }
  }
);

automationRouter.patch(
  '/classification/opportunities/:opportunityId',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const body = z
        .object({
          toType: z.string().min(1),
          fromType: z.string().optional(),
          reason: z.string().optional(),
        })
        .parse(req.body);
      const { userId } = (req as AuthenticatedRequest).auth;
      res.json({
        data: await recordClassificationCorrection({
          workspaceId: param(req.params.projectId),
          opportunityId: param(req.params.opportunityId),
          fromType: body.fromType ?? 'unknown',
          toType: body.toType,
          reason: body.reason,
          userId,
        }),
      });
    } catch (err) {
      next(err);
    }
  }
);
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
    const { userId, orgId } = (req as AuthenticatedRequest).auth;
    const urls = await parseImportContent(body.content, body.sourceType);
    const richRows =
      body.sourceType === 'csv' || body.sourceType === 'excel' || body.sourceType === 'txt'
        ? extractRichImportRows(body.content)
        : [];
    const result = await createImport(param(req.params.projectId), body.sourceType, urls, {
      fileName: body.fileName,
      userId,
      richRows,
    });

    let pipeline: Awaited<ReturnType<typeof enqueueAutomationPipeline>> | null = null;
    if (body.runPipeline !== false && result.stats.valid > 0) {
      pipeline = await enqueueAutomationPipeline(
        param(req.params.projectId),
        result.importId,
        orgId,
        userId
      );
    }

    res.status(201).json({
      data: {
        ...result,
        pipeline,
        message:
          pipeline != null
            ? 'Import saved — automation pipeline started (classify, score, content, queue)'
            : 'Import saved',
      },
    });
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

automationRouter.get(
  '/runs/:runId/logs',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      const logs = await listAutomationRunLogs(
        param(req.params.projectId),
        param(req.params.runId)
      );
      res.json({ data: logs });
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

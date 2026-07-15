import { Router } from 'express';
import { z } from 'zod';
import { AppError, DEFAULT_FEATURE_FLAGS } from '@seo-os/shared';
import { QUEUE_STAGES } from '@seo-os/backlink-builder';
import { authMiddleware, type AuthenticatedRequest } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import {
  analyzeOpportunityForContent,
  approveSubmission,
  createBrowserPlan,
  createContentPack,
  createMediaBrief,
  detectAndSaveRequirements,
  discoverKeywordsV11,
  enqueueReverifyAccepted,
  generateTypeRecommendations,
  getBrowserPlan,
  getOpportunityHistory,
  getQueueBoard,
  getRequirements,
  getSubmissionPreview,
  getWorkforceStrip,
  listBacklinkChecks,
  listContentPacks,
  listMediaBriefs,
  listTypeRecommendations,
  reviewMediaBrief,
  setPrimaryKeywords,
  startBrowserAssist,
  transitionSubmissionStage,
  updateContentPack,
  updateSubmissionPreview,
} from '../../modules/backlinks/v11.service.js';

function param(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

export const v11Router = Router({ mergeParams: true });

v11Router.get(
  '/opportunities/:opportunityId/submission-requirements',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      res.json({
        data: await getRequirements(param(req.params.projectId), param(req.params.opportunityId)),
      });
    } catch (err) {
      next(err);
    }
  }
);

v11Router.post(
  '/opportunities/:opportunityId/submission-requirements/detect',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      res.status(201).json({
        data: await detectAndSaveRequirements(
          param(req.params.projectId),
          param(req.params.opportunityId)
        ),
      });
    } catch (err) {
      next(err);
    }
  }
);

v11Router.get(
  '/submissions/:submissionId/preview',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      const { orgId } = (req as AuthenticatedRequest).auth;
      res.json({
        data: await getSubmissionPreview(
          param(req.params.projectId),
          param(req.params.submissionId),
          orgId
        ),
      });
    } catch (err) {
      next(err);
    }
  }
);

v11Router.put(
  '/submissions/:submissionId/preview',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const body = z.object({ prefill: z.record(z.unknown()) }).parse(req.body);
      res.json({
        data: await updateSubmissionPreview(
          param(req.params.projectId),
          param(req.params.submissionId),
          body.prefill
        ),
      });
    } catch (err) {
      next(err);
    }
  }
);

v11Router.post(
  '/submissions/:submissionId/approve',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const { userId } = (req as AuthenticatedRequest).auth;
      res.json({
        data: await approveSubmission(
          param(req.params.projectId),
          param(req.params.submissionId),
          userId
        ),
      });
    } catch (err) {
      next(err);
    }
  }
);

v11Router.patch(
  '/submissions/:submissionId/stage',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const body = z
        .object({
          stage: z.enum(QUEUE_STAGES),
          note: z.string().optional(),
        })
        .parse(req.body);
      const { userId } = (req as AuthenticatedRequest).auth;
      res.json({
        data: await transitionSubmissionStage(
          param(req.params.projectId),
          param(req.params.submissionId),
          body.stage,
          { actorId: userId, note: body.note }
        ),
      });
    } catch (err) {
      next(err);
    }
  }
);

v11Router.get('/queue', authMiddleware, requireRole('viewer'), async (req, res, next) => {
  try {
    const view = req.query.view === 'timeline' ? 'timeline' : 'kanban';
    res.json({ data: await getQueueBoard(param(req.params.projectId), view) });
  } catch (err) {
    next(err);
  }
});

v11Router.get(
  '/queue/:opportunityId/history',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      res.json({
        data: await getOpportunityHistory(
          param(req.params.projectId),
          param(req.params.opportunityId)
        ),
      });
    } catch (err) {
      next(err);
    }
  }
);

v11Router.get('/content-packs', authMiddleware, requireRole('viewer'), async (req, res, next) => {
  try {
    res.json({ data: await listContentPacks(param(req.params.projectId)) });
  } catch (err) {
    next(err);
  }
});

v11Router.get(
  '/opportunities/:opportunityId/content-intelligence',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      const refreshLive = String(req.query.refresh ?? '') === '1';
      res.json({
        data: await analyzeOpportunityForContent(
          param(req.params.projectId),
          param(req.params.opportunityId),
          { refreshLive }
        ),
      });
    } catch (err) {
      next(err);
    }
  }
);

v11Router.post(
  '/opportunities/:opportunityId/content-pack',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      // type is ignored — AI auto-detects backlink type from the destination site
      z.object({ type: z.string().optional() }).parse(req.body ?? {});
      const { orgId } = (req as AuthenticatedRequest).auth;
      res.status(201).json({
        data: await createContentPack(
          param(req.params.projectId),
          param(req.params.opportunityId),
          '',
          orgId
        ),
      });
    } catch (err) {
      next(err);
    }
  }
);

v11Router.put(
  '/content-packs/:packId',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const body = z
        .object({ pack: z.record(z.unknown()), status: z.string().optional() })
        .parse(req.body);
      res.json({
        data: await updateContentPack(
          param(req.params.projectId),
          param(req.params.packId),
          body.pack,
          body.status
        ),
      });
    } catch (err) {
      next(err);
    }
  }
);

v11Router.get('/media-briefs', authMiddleware, requireRole('viewer'), async (req, res, next) => {
  try {
    const kind =
      req.query.kind === 'image' || req.query.kind === 'video' ? req.query.kind : undefined;
    res.json({ data: await listMediaBriefs(param(req.params.projectId), kind) });
  } catch (err) {
    next(err);
  }
});

v11Router.post(
  '/opportunities/:opportunityId/media-briefs',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const body = z.object({ kind: z.enum(['image', 'video']) }).parse(req.body);
      const { orgId } = (req as AuthenticatedRequest).auth;
      res.status(201).json({
        data: await createMediaBrief(
          param(req.params.projectId),
          param(req.params.opportunityId),
          body.kind,
          orgId
        ),
      });
    } catch (err) {
      next(err);
    }
  }
);

v11Router.patch(
  '/media-briefs/:briefId/review',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const body = z.object({ reviewStatus: z.enum(['approved', 'rejected']) }).parse(req.body);
      res.json({
        data: await reviewMediaBrief(
          param(req.params.projectId),
          param(req.params.briefId),
          body.reviewStatus
        ),
      });
    } catch (err) {
      next(err);
    }
  }
);

v11Router.post('/keywords/primary', authMiddleware, requireRole('member'), async (req, res, next) => {
  try {
    const body = z.object({ keywords: z.array(z.string()).min(1) }).parse(req.body);
    res.status(201).json({
      data: await setPrimaryKeywords(param(req.params.projectId), body.keywords),
    });
  } catch (err) {
    next(err);
  }
});

v11Router.post(
  '/keywords/discover',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const body = z
        .object({
          primaryKeywords: z.array(z.string()).min(1),
          industry: z.string().optional(),
        })
        .parse(req.body);
      res.status(201).json({
        data: await discoverKeywordsV11(
          param(req.params.projectId),
          body.primaryKeywords,
          body.industry
        ),
      });
    } catch (err) {
      next(err);
    }
  }
);

v11Router.get(
  '/recommendations/types',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      res.json({ data: await listTypeRecommendations(param(req.params.projectId)) });
    } catch (err) {
      next(err);
    }
  }
);

v11Router.post(
  '/recommendations/types/generate',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const { orgId } = (req as AuthenticatedRequest).auth;
      res.status(201).json({
        data: await generateTypeRecommendations(param(req.params.projectId), orgId),
      });
    } catch (err) {
      next(err);
    }
  }
);

v11Router.get(
  '/backlinks/:backlinkId/checks',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      res.json({
        data: await listBacklinkChecks(param(req.params.projectId), param(req.params.backlinkId)),
      });
    } catch (err) {
      next(err);
    }
  }
);

v11Router.post(
  '/verification/reverify',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      res.json({ data: await enqueueReverifyAccepted(param(req.params.projectId)) });
    } catch (err) {
      next(err);
    }
  }
);

v11Router.get('/workforce', authMiddleware, requireRole('viewer'), async (req, res, next) => {
  try {
    res.json({ data: await getWorkforceStrip(param(req.params.projectId)) });
  } catch (err) {
    next(err);
  }
});

/** Browser plans live under intelligence alias too; also mounted here for BB UX */
v11Router.post('/browser/plans', authMiddleware, requireRole('member'), async (req, res, next) => {
  try {
    const body = z.object({ opportunityId: z.string().uuid() }).parse(req.body);
    const { orgId } = (req as AuthenticatedRequest).auth;
    res.status(201).json({
      data: await createBrowserPlan(param(req.params.projectId), body.opportunityId, orgId),
    });
  } catch (err) {
    next(err);
  }
});

v11Router.get(
  '/browser/plans/:planId',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      const plan = await getBrowserPlan(param(req.params.projectId), param(req.params.planId));
      if (!plan) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Plan not found');
      res.json({ data: plan });
    } catch (err) {
      next(err);
    }
  }
);

v11Router.post(
  '/browser/plans/:planId/assist',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      res.json({
        data: await startBrowserAssist(
          param(req.params.projectId),
          param(req.params.planId),
          DEFAULT_FEATURE_FLAGS.v11_browser_assist_fill
        ),
      });
    } catch (err) {
      next(err);
    }
  }
);

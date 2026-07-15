import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '@seo-os/shared';
import { authMiddleware, type AuthenticatedRequest } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import {
  attachOpportunitiesToCampaign,
  createCampaign,
  getCampaign,
  getCampaignSummary,
  getCampaignTimeline,
  listCampaigns,
  listCampaignTypes,
  listTemplates,
  refreshCampaignProgress,
  updateCampaignStatus,
} from '../../modules/campaigns/campaign.service.js';
import {
  bulkReviewOpportunities,
  enrichOpportunityRecommendations,
  getOpportunityRecommendations,
  listOpportunityQueue,
  reviewOpportunity,
  updateOpportunityPriority,
} from '../../modules/campaigns/opportunity-queue.service.js';
import {
  createContentDraft,
  createEmailDraft,
  listApprovals,
  listDrafts,
  resolveApproval,
  submitContentDraftForApproval,
  submitEmailDraftForApproval,
} from '../../modules/campaigns/approval.service.js';
import { generateCampaignPlan } from '../../modules/campaigns/planner.service.js';
import { CAMPAIGN_STATUSES, CAMPAIGN_TYPES } from '@seo-os/campaign-engine';

function param(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

const createCampaignSchema = z.object({
  name: z.string().min(1).max(200),
  campaignType: z.enum(CAMPAIGN_TYPES),
  templateId: z.string().uuid().optional(),
  goals: z
    .array(z.object({ id: z.string(), label: z.string(), target: z.number().optional() }))
    .optional(),
  plan: z.record(z.unknown()).optional(),
});

const statusSchema = z.object({
  status: z.enum(CAMPAIGN_STATUSES),
});

const planSchema = z.object({
  campaignType: z.enum(CAMPAIGN_TYPES),
  goals: z.array(z.string()).min(1),
});

const reviewSchema = z.object({
  action: z.enum(['approve', 'reject']),
  notes: z.string().optional(),
});

const bulkReviewSchema = z.object({
  opportunityIds: z.array(z.string().uuid()).min(1),
  action: z.enum(['approve', 'reject']),
});

const prioritySchema = z.object({
  priority: z.number().int().min(0).max(100),
});

const attachSchema = z.object({
  opportunityIds: z.array(z.string().uuid()).min(1),
});

const emailDraftSchema = z.object({
  subject: z.string().min(1),
  body: z.string().min(1),
  campaignId: z.string().uuid().optional(),
});

const contentDraftSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  campaignId: z.string().uuid().optional(),
});

export const campaignsRouter = Router({ mergeParams: true });

// Static paths first (before :campaignId)
campaignsRouter.get('/types', authMiddleware, requireRole('viewer'), async (_req, res, next) => {
  try {
    const types = await listCampaignTypes();
    res.json({ data: types });
  } catch (err) {
    next(err);
  }
});

campaignsRouter.get('/templates', authMiddleware, requireRole('viewer'), async (req, res, next) => {
  try {
    const campaignType = typeof req.query.type === 'string' ? req.query.type : undefined;
    const templates = await listTemplates(param(req.params.projectId), campaignType);
    res.json({ data: templates });
  } catch (err) {
    next(err);
  }
});

campaignsRouter.get('/summary', authMiddleware, requireRole('viewer'), async (req, res, next) => {
  try {
    const summary = await getCampaignSummary(param(req.params.projectId));
    res.json({ data: summary });
  } catch (err) {
    next(err);
  }
});

campaignsRouter.get(
  '/queue/opportunities',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      const queueStatus =
        typeof req.query.queueStatus === 'string' ? req.query.queueStatus : undefined;
      const campaignType =
        typeof req.query.campaignType === 'string' ? req.query.campaignType : undefined;
      const queue = await listOpportunityQueue(param(req.params.projectId), {
        queueStatus,
        campaignType,
      });
      res.json({ data: queue });
    } catch (err) {
      next(err);
    }
  }
);

campaignsRouter.get(
  '/queue/recommendations',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      const campaignType =
        typeof req.query.campaignType === 'string' ? req.query.campaignType : undefined;
      const recs = await getOpportunityRecommendations(
        param(req.params.projectId),
        campaignType as (typeof CAMPAIGN_TYPES)[number] | undefined
      );
      res.json({ data: recs });
    } catch (err) {
      next(err);
    }
  }
);

campaignsRouter.post(
  '/queue/enrich',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      await enrichOpportunityRecommendations(param(req.params.projectId));
      res.json({ data: { enriched: true } });
    } catch (err) {
      next(err);
    }
  }
);

campaignsRouter.post(
  '/queue/bulk-review',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const { userId, orgId } = (req as AuthenticatedRequest).auth;
      const { opportunityIds, action } = bulkReviewSchema.parse(req.body);
      const outcome = await bulkReviewOpportunities(
        param(req.params.projectId),
        userId,
        opportunityIds,
        action,
        orgId
      );
      res.json({ data: outcome });
    } catch (err) {
      next(err);
    }
  }
);

campaignsRouter.patch(
  '/queue/opportunities/:opportunityId',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const { userId, orgId } = (req as AuthenticatedRequest).auth;
      const { action, notes } = reviewSchema.parse(req.body);
      const opp = await reviewOpportunity(
        param(req.params.opportunityId),
        param(req.params.projectId),
        userId,
        action,
        notes,
        orgId
      );
      res.json({ data: opp });
    } catch (err) {
      next(err);
    }
  }
);

campaignsRouter.patch(
  '/queue/opportunities/:opportunityId/priority',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const { priority } = prioritySchema.parse(req.body);
      const opp = await updateOpportunityPriority(
        param(req.params.opportunityId),
        param(req.params.projectId),
        priority
      );
      res.json({ data: opp });
    } catch (err) {
      next(err);
    }
  }
);

campaignsRouter.get('/approvals', authMiddleware, requireRole('viewer'), async (req, res, next) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const approvals = await listApprovals(param(req.params.projectId), status);
    res.json({ data: approvals });
  } catch (err) {
    next(err);
  }
});

campaignsRouter.patch(
  '/approvals/:approvalId',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const { userId } = (req as AuthenticatedRequest).auth;
      const { action, notes } = reviewSchema.parse(req.body);
      const approval = await resolveApproval(
        param(req.params.approvalId),
        param(req.params.projectId),
        userId,
        action,
        notes
      );
      res.json({ data: approval });
    } catch (err) {
      next(err);
    }
  }
);

campaignsRouter.get('/drafts', authMiddleware, requireRole('viewer'), async (req, res, next) => {
  try {
    const drafts = await listDrafts(param(req.params.projectId));
    res.json({ data: drafts });
  } catch (err) {
    next(err);
  }
});

campaignsRouter.post(
  '/drafts/email',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const { userId } = (req as AuthenticatedRequest).auth;
      const body = emailDraftSchema.parse(req.body);
      const draft = await createEmailDraft(param(req.params.projectId), userId, body);
      res.status(201).json({ data: draft });
    } catch (err) {
      next(err);
    }
  }
);

campaignsRouter.post(
  '/drafts/email/:draftId/submit',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const { userId } = (req as AuthenticatedRequest).auth;
      const approval = await submitEmailDraftForApproval(
        param(req.params.draftId),
        param(req.params.projectId),
        userId
      );
      res.json({ data: approval });
    } catch (err) {
      next(err);
    }
  }
);

campaignsRouter.post(
  '/drafts/content',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const { userId } = (req as AuthenticatedRequest).auth;
      const body = contentDraftSchema.parse(req.body);
      const draft = await createContentDraft(param(req.params.projectId), userId, body);
      res.status(201).json({ data: draft });
    } catch (err) {
      next(err);
    }
  }
);

campaignsRouter.post(
  '/drafts/content/:draftId/submit',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const { userId } = (req as AuthenticatedRequest).auth;
      const approval = await submitContentDraftForApproval(
        param(req.params.draftId),
        param(req.params.projectId),
        userId
      );
      res.json({ data: approval });
    } catch (err) {
      next(err);
    }
  }
);

campaignsRouter.get('/', authMiddleware, requireRole('viewer'), async (req, res, next) => {
  try {
    const campaigns = await listCampaigns(param(req.params.projectId));
    res.json({ data: campaigns });
  } catch (err) {
    next(err);
  }
});

campaignsRouter.post('/', authMiddleware, requireRole('member'), async (req, res, next) => {
  try {
    const { userId } = (req as AuthenticatedRequest).auth;
    const body = createCampaignSchema.parse(req.body);
    const campaign = await createCampaign(param(req.params.projectId), userId, body);
    res.status(201).json({ data: campaign });
  } catch (err) {
    next(err);
  }
});

campaignsRouter.post('/plan', authMiddleware, requireRole('member'), async (req, res, next) => {
  try {
    const { orgId } = (req as AuthenticatedRequest).auth;
    const body = planSchema.parse(req.body);
    const plan = await generateCampaignPlan(param(req.params.projectId), orgId, body);
    res.json({ data: plan });
  } catch (err) {
    next(err);
  }
});

// Parameterized campaign routes last
campaignsRouter.get(
  '/:campaignId',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      const campaign = await getCampaign(param(req.params.campaignId), param(req.params.projectId));
      if (!campaign) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Campaign not found');
      res.json({ data: campaign });
    } catch (err) {
      next(err);
    }
  }
);

campaignsRouter.get(
  '/:campaignId/timeline',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      const timeline = await getCampaignTimeline(
        param(req.params.campaignId),
        param(req.params.projectId)
      );
      res.json({ data: timeline });
    } catch (err) {
      next(err);
    }
  }
);

campaignsRouter.patch(
  '/:campaignId/status',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const { userId } = (req as AuthenticatedRequest).auth;
      const { status } = statusSchema.parse(req.body);
      const campaign = await updateCampaignStatus(
        param(req.params.campaignId),
        param(req.params.projectId),
        userId,
        status
      );
      await refreshCampaignProgress(param(req.params.campaignId), param(req.params.projectId));
      res.json({ data: campaign });
    } catch (err) {
      next(err);
    }
  }
);

campaignsRouter.post(
  '/:campaignId/opportunities',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const { opportunityIds } = attachSchema.parse(req.body);
      await attachOpportunitiesToCampaign(
        param(req.params.campaignId),
        param(req.params.projectId),
        opportunityIds
      );
      const progress = await refreshCampaignProgress(
        param(req.params.campaignId),
        param(req.params.projectId)
      );
      res.json({ data: { attached: opportunityIds.length, progress } });
    } catch (err) {
      next(err);
    }
  }
);

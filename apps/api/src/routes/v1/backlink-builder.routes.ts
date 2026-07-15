import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '@seo-os/shared';
import { BACKLINK_CATEGORIES, PIPELINE_STAGES } from '@seo-os/backlink-builder';
import { authMiddleware, type AuthenticatedRequest } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import {
  addOpportunityToCampaign,
  bulkOpportunityAction,
  enrichOpportunityScoring,
  exploreOpportunities,
  generateAiDraft,
  getAiSuggestions,
  getBacklinkDashboard,
  getCampaignAssociations,
  getLinkAudit,
  getOpportunityDetail,
  listBacklinkTypes,
  listLostBacklinks,
  listOpportunitiesByPipeline,
  listPendingBacklinks,
  listRelationships,
  listWonBacklinks,
  moveOpportunityStage,
  parsePagination,
  verifyBacklink,
} from '../../modules/backlinks/backlink-builder.service.js';
import { automationRouter } from './automation.routes.js';
import { v11Router } from './v11.routes.js';

function param(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

const filtersSchema = z.object({
  category: z.enum(BACKLINK_CATEGORIES).optional(),
  type: z.string().optional(),
  minScore: z.coerce.number().optional(),
  maxSpam: z.coerce.number().optional(),
  queueStatus: z.string().optional(),
  pipelineStage: z.string().optional(),
  verificationStatus: z.string().optional(),
  campaignId: z.string().uuid().optional(),
  search: z.string().optional(),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).optional(),
  limit: z.coerce.number().optional(),
  cursor: z.string().optional(),
});

const addToCampaignSchema = z.object({ campaignId: z.string().uuid() });
const verifySchema = z.object({
  status: z.enum(['verified', 'lost', 'unreachable']),
  notes: z.string().optional(),
});
const moveSchema = z.object({ stage: z.enum(PIPELINE_STAGES) });
const bulkSchema = z.object({
  opportunityIds: z.array(z.string().uuid()).min(1),
  action: z.enum(['approve', 'reject', 'move']),
  stage: z.enum(PIPELINE_STAGES).optional(),
});
const draftSchema = z.object({
  draftType: z.enum([
    'email',
    'guest_post',
    'press_release',
    'outreach_strategy',
    'website_summary',
  ]),
});

export const backlinkBuilderRouter = Router({ mergeParams: true });

backlinkBuilderRouter.get(
  '/summary',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      res.json({ data: await getBacklinkDashboard(param(req.params.projectId)) });
    } catch (err) {
      next(err);
    }
  }
);

backlinkBuilderRouter.get(
  '/types',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      const category = typeof req.query.category === 'string' ? req.query.category : undefined;
      res.json({
        data: await listBacklinkTypes(category as (typeof BACKLINK_CATEGORIES)[number] | undefined),
      });
    } catch (err) {
      next(err);
    }
  }
);

backlinkBuilderRouter.get(
  '/opportunities',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      const { orgId } = (req as AuthenticatedRequest).auth;
      const filters = {
        ...filtersSchema.parse(req.query),
        ...parsePagination(req.query as Record<string, unknown>),
      };
      const result = await exploreOpportunities(param(req.params.projectId), filters, orgId);
      res.json({ data: result.items, pagination: result.pagination });
    } catch (err) {
      next(err);
    }
  }
);

backlinkBuilderRouter.get(
  '/opportunities/:opportunityId',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      const { orgId } = (req as AuthenticatedRequest).auth;
      const opp = await getOpportunityDetail(
        param(req.params.opportunityId),
        param(req.params.projectId),
        orgId
      );
      if (!opp) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Opportunity not found');
      res.json({ data: opp });
    } catch (err) {
      next(err);
    }
  }
);

backlinkBuilderRouter.patch(
  '/opportunities/:opportunityId/stage',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const { stage } = moveSchema.parse(req.body);
      const { userId } = (req as AuthenticatedRequest).auth;
      const result = await moveOpportunityStage(
        param(req.params.opportunityId),
        param(req.params.projectId),
        stage,
        userId
      );
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

backlinkBuilderRouter.post(
  '/opportunities/bulk',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const body = bulkSchema.parse(req.body);
      const { userId, orgId } = (req as AuthenticatedRequest).auth;
      const result = await bulkOpportunityAction(
        param(req.params.projectId),
        body.opportunityIds,
        body.action,
        { stage: body.stage, actorId: userId, orgId }
      );
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

backlinkBuilderRouter.post(
  '/opportunities/enrich',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const { orgId } = (req as AuthenticatedRequest).auth;
      await enrichOpportunityScoring(param(req.params.projectId), orgId);
      res.json({ data: { enriched: true } });
    } catch (err) {
      next(err);
    }
  }
);

backlinkBuilderRouter.post(
  '/opportunities/:opportunityId/add-to-campaign',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const { campaignId } = addToCampaignSchema.parse(req.body);
      res.json({
        data: await addOpportunityToCampaign(
          param(req.params.opportunityId),
          campaignId,
          param(req.params.projectId)
        ),
      });
    } catch (err) {
      next(err);
    }
  }
);

backlinkBuilderRouter.post(
  '/opportunities/:opportunityId/generate',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const { draftType } = draftSchema.parse(req.body);
      const { orgId } = (req as AuthenticatedRequest).auth;
      res.json({
        data: await generateAiDraft(
          param(req.params.opportunityId),
          param(req.params.projectId),
          draftType,
          orgId
        ),
      });
    } catch (err) {
      next(err);
    }
  }
);

backlinkBuilderRouter.get(
  '/ai/suggestions',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      const { orgId } = (req as AuthenticatedRequest).auth;
      res.json({ data: await getAiSuggestions(param(req.params.projectId), orgId) });
    } catch (err) {
      next(err);
    }
  }
);

backlinkBuilderRouter.get(
  '/pipeline',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      const { orgId } = (req as AuthenticatedRequest).auth;
      res.json({ data: await listOpportunitiesByPipeline(param(req.params.projectId), orgId) });
    } catch (err) {
      next(err);
    }
  }
);

backlinkBuilderRouter.get(
  '/relationships',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      res.json({ data: await listRelationships(param(req.params.projectId)) });
    } catch (err) {
      next(err);
    }
  }
);

backlinkBuilderRouter.get(
  '/campaigns/associations',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      res.json({ data: await getCampaignAssociations(param(req.params.projectId)) });
    } catch (err) {
      next(err);
    }
  }
);

backlinkBuilderRouter.get('/won', authMiddleware, requireRole('viewer'), async (req, res, next) => {
  try {
    res.json({ data: await listWonBacklinks(param(req.params.projectId)) });
  } catch (err) {
    next(err);
  }
});

backlinkBuilderRouter.get(
  '/lost',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      res.json({ data: await listLostBacklinks(param(req.params.projectId)) });
    } catch (err) {
      next(err);
    }
  }
);

backlinkBuilderRouter.get(
  '/pending',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      res.json({ data: await listPendingBacklinks(param(req.params.projectId)) });
    } catch (err) {
      next(err);
    }
  }
);

backlinkBuilderRouter.get(
  '/audit',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      res.json({ data: await getLinkAudit(param(req.params.projectId)) });
    } catch (err) {
      next(err);
    }
  }
);

backlinkBuilderRouter.patch(
  '/backlinks/:backlinkId/verify',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const { status, notes } = verifySchema.parse(req.body);
      res.json({
        data: await verifyBacklink(
          param(req.params.backlinkId),
          param(req.params.projectId),
          status,
          notes
        ),
      });
    } catch (err) {
      next(err);
    }
  }
);

backlinkBuilderRouter.use('/automation', automationRouter);
backlinkBuilderRouter.use(v11Router);

// Alias: POST /backlink-builder/discover (plan V1.0)
backlinkBuilderRouter.post(
  '/discover',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const { runDiscoverWebsites } = await import(
        '../../modules/backlinks/discovery.service.js'
      );
      const body = z
        .object({
          website: z.string().optional(),
          industry: z.string().optional(),
          country: z.string().optional(),
          keywords: z.array(z.string()).optional(),
          targetDr: z.number().int().min(0).max(100).optional(),
          targetTraffic: z.number().int().min(0).optional(),
        })
        .parse(req.body);
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
  }
);

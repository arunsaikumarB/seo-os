import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '@seo-os/shared';
import { BACKLINK_CATEGORIES } from '@seo-os/backlink-builder';
import {
  authMiddleware,
  type AuthenticatedRequest,
} from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import {
  addOpportunityToCampaign,
  enrichOpportunityScoring,
  exploreOpportunities,
  getAiSuggestions,
  getBacklinkDashboard,
  getLinkAudit,
  getOpportunityDetail,
  listBacklinkTypes,
  listLostBacklinks,
  listPendingBacklinks,
  listWonBacklinks,
  verifyBacklink,
} from '../../modules/backlinks/backlink-builder.service.js';
import { listProspectsByStatus } from '../../modules/intelligence/prospect.service.js';

function param(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

const filtersSchema = z.object({
  category: z.enum(BACKLINK_CATEGORIES).optional(),
  type: z.string().optional(),
  minScore: z.coerce.number().optional(),
  queueStatus: z.string().optional(),
  verificationStatus: z.string().optional(),
  search: z.string().optional(),
});

const addToCampaignSchema = z.object({
  campaignId: z.string().uuid(),
});

const verifySchema = z.object({
  status: z.enum(['verified', 'lost', 'unreachable']),
  notes: z.string().optional(),
});

export const backlinkBuilderRouter = Router({ mergeParams: true });

backlinkBuilderRouter.get('/summary', authMiddleware, requireRole('viewer'), async (req, res, next) => {
  try {
    const summary = await getBacklinkDashboard(param(req.params.projectId));
    res.json({ data: summary });
  } catch (err) {
    next(err);
  }
});

backlinkBuilderRouter.get('/types', authMiddleware, requireRole('viewer'), async (req, res, next) => {
  try {
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const types = await listBacklinkTypes(category as (typeof BACKLINK_CATEGORIES)[number] | undefined);
    res.json({ data: types });
  } catch (err) {
    next(err);
  }
});

backlinkBuilderRouter.get('/opportunities', authMiddleware, requireRole('viewer'), async (req, res, next) => {
  try {
    const filters = filtersSchema.parse(req.query);
    const opps = await exploreOpportunities(param(req.params.projectId), filters);
    res.json({ data: opps });
  } catch (err) {
    next(err);
  }
});

backlinkBuilderRouter.get('/opportunities/:opportunityId', authMiddleware, requireRole('viewer'), async (req, res, next) => {
  try {
    const opp = await getOpportunityDetail(
      param(req.params.opportunityId),
      param(req.params.projectId)
    );
    if (!opp) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Opportunity not found');
    res.json({ data: opp });
  } catch (err) {
    next(err);
  }
});

backlinkBuilderRouter.post('/opportunities/enrich', authMiddleware, requireRole('member'), async (req, res, next) => {
  try {
    await enrichOpportunityScoring(param(req.params.projectId));
    res.json({ data: { enriched: true } });
  } catch (err) {
    next(err);
  }
});

backlinkBuilderRouter.post(
  '/opportunities/:opportunityId/add-to-campaign',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const { campaignId } = addToCampaignSchema.parse(req.body);
      const result = await addOpportunityToCampaign(
        param(req.params.opportunityId),
        campaignId,
        param(req.params.projectId)
      );
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

backlinkBuilderRouter.get('/ai/suggestions', authMiddleware, requireRole('viewer'), async (req, res, next) => {
  try {
    const { orgId } = (req as AuthenticatedRequest).auth;
    const suggestions = await getAiSuggestions(param(req.params.projectId), orgId);
    res.json({ data: suggestions });
  } catch (err) {
    next(err);
  }
});

backlinkBuilderRouter.get('/pipeline', authMiddleware, requireRole('viewer'), async (req, res, next) => {
  try {
    const pipeline = await listProspectsByStatus(param(req.params.projectId));
    res.json({ data: pipeline });
  } catch (err) {
    next(err);
  }
});

backlinkBuilderRouter.get('/won', authMiddleware, requireRole('viewer'), async (req, res, next) => {
  try {
    const won = await listWonBacklinks(param(req.params.projectId));
    res.json({ data: won });
  } catch (err) {
    next(err);
  }
});

backlinkBuilderRouter.get('/lost', authMiddleware, requireRole('viewer'), async (req, res, next) => {
  try {
    const lost = await listLostBacklinks(param(req.params.projectId));
    res.json({ data: lost });
  } catch (err) {
    next(err);
  }
});

backlinkBuilderRouter.get('/pending', authMiddleware, requireRole('viewer'), async (req, res, next) => {
  try {
    const pending = await listPendingBacklinks(param(req.params.projectId));
    res.json({ data: pending });
  } catch (err) {
    next(err);
  }
});

backlinkBuilderRouter.get('/audit', authMiddleware, requireRole('viewer'), async (req, res, next) => {
  try {
    const audit = await getLinkAudit(param(req.params.projectId));
    res.json({ data: audit });
  } catch (err) {
    next(err);
  }
});

backlinkBuilderRouter.patch('/backlinks/:backlinkId/verify', authMiddleware, requireRole('member'), async (req, res, next) => {
  try {
    const { status, notes } = verifySchema.parse(req.body);
    const result = await verifyBacklink(
      param(req.params.backlinkId),
      param(req.params.projectId),
      status,
      notes
    );
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

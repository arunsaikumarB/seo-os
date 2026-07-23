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

/** Campaign State Manager — shared selectors (additive; does not change existing shapes). */
backlinkBuilderRouter.get(
  '/campaign-state',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      const {
        getCampaignCounts,
        listCampaignItems,
      } = await import('../../modules/campaigns/campaign-state.service.js');
      const workspaceId = param(req.params.projectId);
      const includeDeleted = req.query.includeDeleted === '1';
      const [counts, items] = await Promise.all([
        getCampaignCounts(workspaceId),
        listCampaignItems(workspaceId, { includeDeleted }),
      ]);
      res.json({
        data: {
          counts,
          items: items.map((i) => ({
            id: i.id,
            website: i.websiteUrl ?? i.domain,
            currentStatus: i.currentStatus,
            currentStep: i.currentStep,
            classification: i.classification,
            approval: i.approval,
            packageStatus: i.packageStatus,
            imageStatus: i.imageStatus,
            metadataStatus: i.metadataStatus,
            videoMetadataStatus: i.videoMetadataStatus,
            submissionStatus: i.submissionStatus,
            verificationStatus: i.verificationStatus,
            lastError: i.lastError,
            updatedAt: i.updatedAt,
          })),
          metricsSource: 'campaign_state',
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/** Phase 6.3.1 — Manual submissions board (backfill gates + active-cohort counts) */
backlinkBuilderRouter.get(
  '/manual-submissions',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      const { getManualSubmissionsBoard } = await import(
        '../../modules/browser-execution/manual-lane-backfill.service.js'
      );
      const { getAssistedLaneSummary } = await import(
        '../../modules/browser-execution/assisted-manual.service.js'
      );
      const workspaceId = param(req.params.projectId);
      const board = await getManualSubmissionsBoard(workspaceId);
      const assisted = await getAssistedLaneSummary(workspaceId).catch(() => null);
      res.json({
        data: {
          ...board,
          assisted,
          counts: {
            ...board.counts,
            assisted: assisted?.assisted ?? 0,
            assistedReady: assisted?.ready ?? 0,
            assistedCheckFields: assisted?.checkFields ?? 0,
            assistedNeedsPerson: assisted?.needsPerson ?? 0,
            manualOffline: assisted?.manual ?? board.counts.manual,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/** Phase 7 — Assisted Manual worklist (pilot ≤10) */
backlinkBuilderRouter.get(
  '/assisted-manual',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      const { listAssistedPackages } = await import(
        '../../modules/browser-execution/assisted-manual.service.js'
      );
      res.json({ data: await listAssistedPackages(param(req.params.projectId)) });
    } catch (err) {
      next(err);
    }
  }
);

backlinkBuilderRouter.post(
  '/assisted-manual/prepare',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const body = z
        .object({
          opportunityIds: z.array(z.string().uuid()).max(500).optional(),
          entryUrlOverrides: z.record(z.string().url()).optional(),
        })
        .parse(req.body ?? {});
      const { prepareAssistedPackages } = await import(
        '../../modules/browser-execution/assisted-manual.service.js'
      );
      res.json({
        data: await prepareAssistedPackages(param(req.params.projectId), body),
      });
    } catch (err) {
      next(err);
    }
  }
);

backlinkBuilderRouter.get(
  '/assisted-manual/metrics',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      const { getAssistedPilotMetrics } = await import(
        '../../modules/browser-execution/assisted-manual.service.js'
      );
      res.json({ data: await getAssistedPilotMetrics(param(req.params.projectId)) });
    } catch (err) {
      next(err);
    }
  }
);

backlinkBuilderRouter.get(
  '/assisted-manual/:packageId',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      const { getAssistedPackage } = await import(
        '../../modules/browser-execution/assisted-manual.service.js'
      );
      res.json({
        data: await getAssistedPackage(
          param(req.params.projectId),
          param(req.params.packageId)
        ),
      });
    } catch (err) {
      next(err);
    }
  }
);

backlinkBuilderRouter.patch(
  '/assisted-manual/:packageId',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const body = z
        .object({
          status: z.enum(['not_started', 'in_progress', 'done', 'failed']).optional(),
          minutesSpent: z.number().min(0).max(240).optional(),
          rejectedAtSubmit: z.boolean().optional(),
        })
        .parse(req.body ?? {});
      const { updateAssistedPackageStatus } = await import(
        '../../modules/browser-execution/assisted-manual.service.js'
      );
      res.json({
        data: await updateAssistedPackageStatus(
          param(req.params.projectId),
          param(req.params.packageId),
          body
        ),
      });
    } catch (err) {
      next(err);
    }
  }
);

backlinkBuilderRouter.post(
  '/assisted-manual/:packageId/correct',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const body = z
        .object({
          selector: z.string().min(1).optional(),
          role: z
            .enum([
              'title',
              'short_desc',
              'long_desc',
              'url',
              'email',
              'phone',
              'name',
              'business_name',
              'category',
              'address',
              'attachment',
              'terms',
              'other',
            ])
            .optional(),
          markPackageGood: z.boolean().optional(),
        })
        .refine((b) => b.markPackageGood || b.selector, {
          message: 'selector required unless markPackageGood',
        })
        .parse(req.body ?? {});
      const { correctAssistedField } = await import(
        '../../modules/browser-execution/assisted-manual.service.js'
      );
      res.json({
        data: await correctAssistedField(
          param(req.params.projectId),
          param(req.params.packageId),
          {
            selector: body.selector ?? '',
            role: body.role,
            markPackageGood: body.markPackageGood,
          }
        ),
      });
    } catch (err) {
      next(err);
    }
  }
);

/** Dev-only Campaign Health audit — all items including Deleted. */
backlinkBuilderRouter.get(
  '/campaign-health',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      const {
        getCampaignCounts,
        listCampaignItems,
      } = await import('../../modules/campaigns/campaign-state.service.js');
      const { getContentGenerationBoard } = await import(
        '../../modules/campaigns/content-generation.service.js'
      );
      const workspaceId = param(req.params.projectId);
      const items = await listCampaignItems(workspaceId, { includeDeleted: true });
      const counts = await getCampaignCounts(workspaceId);
      const { sweepOrphanAssets } = await import(
        '../../modules/campaigns/content-generation.service.js'
      );
      const orphanSweep = await sweepOrphanAssets(workspaceId).catch(() => ({
        deleted: 0,
        remaining: -1,
        byTable: {} as Record<string, number>,
      }));
      const gen = await getContentGenerationBoard(workspaceId);
      const { getExecutionAudit } = await import(
        '../../modules/browser-execution/bee-reconcile.service.js'
      );
      const executionAudit = await getExecutionAudit(workspaceId);
      const { getTruthAudit } = await import(
        '../../modules/browser-execution/bee-evidence.service.js'
      );
      const truthAudit = await getTruthAudit(workspaceId);
      const { getSiteProfileAudit } = await import(
        '../../modules/browser-execution/site-intelligence.service.js'
      );
      let siteIntelligenceAudit = null;
      try {
        siteIntelligenceAudit = await getSiteProfileAudit(workspaceId);
      } catch {
        siteIntelligenceAudit = { total: 0, error: 'unavailable' };
      }
      res.json({
        data: {
          totals: counts,
          generationAudit: gen.generationAudit,
          orphans: gen.orphans,
          orphanSweep,
          generationProgress: gen.progress,
          executionAudit,
          truthAudit,
          siteIntelligenceAudit,
          handoffAudit: await (async () => {
            try {
              const { getHandoffAudit, reconcileGenerationHandoff } = await import(
                '../../modules/campaigns/generation-handoff.service.js'
              );
              await reconcileGenerationHandoff(workspaceId);
              return await getHandoffAudit(workspaceId);
            } catch (err) {
              return {
                ok: false,
                error: err instanceof Error ? err.message : String(err),
                generatedPackages: 0,
                submissionReady: 0,
                blocked: 0,
                violations: [],
              };
            }
          })(),
          executionDiagnostics: await (async () => {
            try {
              const { ensureExecutionJobsForReady } = await import(
                '../../modules/browser-execution/execution-pipeline.service.js'
              );
              const ensured = await ensureExecutionJobsForReady({
                workspaceId,
                // Phase 6: health poll must NOT start browsers — only ensure jobs exist (idempotent).
                startImmediately: false,
              });
              return ensured.diagnostics;
            } catch (err) {
              try {
                const { getExecutionDiagnostics } = await import(
                  '../../modules/browser-execution/execution-pipeline.service.js'
                );
                const base = await getExecutionDiagnostics(workspaceId);
                return {
                  ...base,
                  pipelineBroken: true,
                  rootCause: err instanceof Error ? err.message : String(err),
                  error: err instanceof Error ? err.message : String(err),
                };
              } catch {
                return {
                  readyItems: 0,
                  executionJobsCreated: 0,
                  jobsQueued: 0,
                  jobsRunning: 0,
                  jobsWaitingHuman: 0,
                  jobsFailed: 0,
                  jobsCompleted: 0,
                  jobsSkipped: 0,
                  missingExecutionJobs: 0,
                  pipelineBroken: true,
                  rootCause: err instanceof Error ? err.message : String(err),
                  items: [],
                  error: err instanceof Error ? err.message : String(err),
                };
              }
            }
          })(),
          items: items.map((i) => ({
            website: i.websiteUrl ?? i.domain ?? i.id,
            imported: true,
            analyzed: ['Analyzed', 'Classified', 'Approved', 'Package Generated', 'Ready', 'Submitting', 'Waiting Human', 'Retrying', 'Submitted', 'Verified', 'Completed', 'Failed', 'Ignored'].includes(i.currentStatus),
            approved: ['Approved', 'Package Generated', 'Ready', 'Submitting', 'Waiting Human', 'Retrying', 'Submitted', 'Verified', 'Completed'].includes(i.currentStatus),
            package: i.packageStatus,
            images: i.imageStatus,
            metadata: i.metadataStatus,
            videoMeta: i.videoMetadataStatus,
            schema: i.schemaStatus,
            generationStatus: i.generationStatus,
            qualityScore: i.qualityScore,
            retryCount: i.retryCount,
            packageApprovedBy: i.packageApprovedBy,
            submission: i.submissionStatus,
            verification: i.verificationStatus,
            currentStatus: i.currentStatus,
            confidence: i.confidenceScore,
            tier: i.reviewTier,
            reviewDecision: i.reviewDecision,
            approvedBy: i.approvedBy,
            lastError: i.lastError,
            updatedAt: i.updatedAt,
          })),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

backlinkBuilderRouter.post(
  '/campaign-state/backfill',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const { backfillCampaignState } = await import(
        '../../modules/campaigns/campaign-state.service.js'
      );
      const result = await backfillCampaignState(param(req.params.projectId));
      res.json({ data: result });
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

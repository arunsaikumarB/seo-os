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

/** Phase 13 — Guided workflow stepper (Create→Reports) from CSM — sole progress selector. */
backlinkBuilderRouter.get(
  '/workflow-progress',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      const { getWorkflowProgressForWorkspace } = await import(
        '../../modules/campaigns/workflow-progress.service.js'
      );
      const result = await getWorkflowProgressForWorkspace(param(req.params.projectId));
      res.json({
        data: {
          ...result.progress,
          input: result.input,
          metricsSource: 'campaign_state',
        },
      });
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

/** Bulk Link Probe — rank imports into Ready / Check / Blocked / Dead / No form */
backlinkBuilderRouter.get(
  '/link-probe/stats',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      const { getLinkProbeStats } = await import(
        '../../modules/backlinks/link-probe.service.js'
      );
      res.json({ data: await getLinkProbeStats(param(req.params.projectId)) });
    } catch (err) {
      next(err);
    }
  }
);

backlinkBuilderRouter.get(
  '/link-probe/queue',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      const { listLinkProbeQueue } = await import(
        '../../modules/backlinks/link-probe.service.js'
      );
      const band = typeof req.query.band === 'string' ? req.query.band : 'all';
      const limit = req.query.limit != null ? Number(req.query.limit) : 100;
      res.json({
        data: await listLinkProbeQueue({
          workspaceId: param(req.params.projectId),
          band: band as
            | 'ready'
            | 'check'
            | 'blocked'
            | 'dead'
            | 'no_form'
            | 'unprobed'
            | 'all',
          limit,
        }),
      });
    } catch (err) {
      next(err);
    }
  }
);

backlinkBuilderRouter.post(
  '/link-probe/run',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const body = z
        .object({
          opportunityIds: z.array(z.string().uuid()).max(250).optional(),
          limit: z.number().int().min(1).max(250).optional(),
          force: z.boolean().optional(),
          sync: z.boolean().optional(),
        })
        .safeParse(req.body ?? {});
      if (!body.success) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Invalid link probe request');
      }
      const workspaceId = param(req.params.projectId);
      const { auth } = req as AuthenticatedRequest;

      // Small sync runs for immediate feedback; otherwise enqueue
      if (body.data.sync || (body.data.limit && body.data.limit <= 15)) {
        const { runLinkProbeBatch } = await import(
          '../../modules/backlinks/link-probe.service.js'
        );
        const result = await runLinkProbeBatch({
          workspaceId,
          opportunityIds: body.data.opportunityIds,
          limit: body.data.limit ?? 15,
          force: body.data.force,
        });
        res.json({ data: { mode: 'sync', ...result } });
        return;
      }

      const { enqueueLinkProbe } = await import(
        '../../modules/backlinks/link-probe.service.js'
      );
      const queued = await enqueueLinkProbe({
        workspaceId,
        orgId: auth.orgId,
        userId: auth.userId,
        opportunityIds: body.data.opportunityIds,
        limit: body.data.limit ?? 80,
        force: body.data.force,
      });
      res.status(202).json({
        data: {
          mode: 'async',
          ...queued,
          message: queued.queued
            ? 'Link probe queued — refresh Ranked Queue in a minute'
            : 'Workers unavailable — try sync: true with a small limit',
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
          status: z.enum(['not_started', 'in_progress', 'done', 'failed', 'skipped']).optional(),
          minutesSpent: z.number().min(0).max(240).optional(),
          rejectedAtSubmit: z.boolean().optional(),
          userVerified: z.boolean().optional(),
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
  '/assisted-manual/:packageId/reread',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const { rereadAssistedPackage } = await import(
        '../../modules/browser-execution/assisted-manual.service.js'
      );
      res.json({
        data: await rereadAssistedPackage(
          param(req.params.projectId),
          param(req.params.packageId)
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

backlinkBuilderRouter.post(
  '/assisted-manual/:packageId/clear-corrections',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const { clearAssistedCorrections } = await import(
        '../../modules/browser-execution/assisted-manual.service.js'
      );
      res.json({
        data: await clearAssistedCorrections(
          param(req.params.projectId),
          param(req.params.packageId)
        ),
      });
    } catch (err) {
      next(err);
    }
  }
);

backlinkBuilderRouter.post(
  '/assisted-manual/:packageId/report-bad',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const body = z
        .object({ note: z.string().max(2000).optional() })
        .parse(req.body ?? {});
      const { userId } = (req as AuthenticatedRequest).auth;
      const { reportBadAssistedPackage } = await import(
        '../../modules/browser-execution/assisted-manual.service.js'
      );
      res.json({
        data: await reportBadAssistedPackage(
          param(req.params.projectId),
          param(req.params.packageId),
          { note: body.note, reportedBy: userId }
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
      const { startPerfSpan } = await import('../../lib/perf-trace.js');
      const span = startPerfSpan('campaign_health');
      const {
        listCampaignItems,
      } = await import('../../modules/campaigns/campaign-state.service.js');
      const { computeCampaignCounts } = await import('@seo-os/backlink-builder');
      const { getContentGenerationBoard } = await import(
        '../../modules/campaigns/content-generation.service.js'
      );
      const workspaceId = param(req.params.projectId);
      const forceReconcile = req.query.reconcile === '1';

      // P1 — short in-memory response cache (dedupe overlapping 5s polls)
      const cacheKey = `ch:${workspaceId}`;
      const cached = campaignHealthCache.get(cacheKey);
      if (cached && Date.now() - cached.at < 2_500 && !forceReconcile) {
        span.end(true, { cache: 'hit' });
        res.json({ data: cached.data });
        return;
      }

      const items = await listCampaignItems(workspaceId, { includeDeleted: true });
      const counts = computeCampaignCounts(items);
      const activeItems = items.filter((i) => i.currentStatus !== 'Deleted');

      const [
        gen,
        executionAudit,
        truthAudit,
        siteIntelligenceAudit,
        handoffAudit,
        executionDiagnostics,
      ] = await Promise.all([
        getContentGenerationBoard(workspaceId, { preloadedItems: activeItems }),
        (async () => {
          const { getExecutionAudit } = await import(
            '../../modules/browser-execution/bee-reconcile.service.js'
          );
          return getExecutionAudit(workspaceId);
        })(),
        (async () => {
          const { getTruthAudit } = await import(
            '../../modules/browser-execution/bee-evidence.service.js'
          );
          return getTruthAudit(workspaceId);
        })(),
        (async () => {
          try {
            const { getSiteProfileAudit } = await import(
              '../../modules/browser-execution/site-intelligence.service.js'
            );
            return await getSiteProfileAudit(workspaceId);
          } catch {
            return { total: 0, error: 'unavailable' };
          }
        })(),
        (async () => {
          try {
            const { getHandoffAudit } = await import(
              '../../modules/campaigns/generation-handoff.service.js'
            );
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
        (async () => {
          try {
            const { getExecutionDiagnostics } = await import(
              '../../modules/browser-execution/execution-pipeline.service.js'
            );
            return await getExecutionDiagnostics(workspaceId);
          } catch (err) {
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
        })(),
      ]);

      // Writes moved off the poll path — enqueue background reconcile (or run when ?reconcile=1)
      const { enqueueJob, QUEUES } = await import('../../jobs/boss.js');
      const { runCampaignHealthReconcile } = await import(
        '../../modules/campaigns/campaign-health-reconcile.service.js'
      );
      if (forceReconcile) {
        await runCampaignHealthReconcile(workspaceId);
      } else {
        void enqueueJob(
          QUEUES.LOW,
          'campaign_health_reconcile',
          { type: 'campaign_health_reconcile', workspaceId },
          { singletonKey: `ch-reconcile-${workspaceId}`, startAfter: 2 }
        ).catch(() => undefined);
      }

      const payload = {
        totals: counts,
        generationAudit: gen.generationAudit,
        orphans: gen.orphans,
        orphanSweep: { deleted: 0, remaining: -1, byTable: {} as Record<string, number>, deferred: true },
        generationProgress: gen.progress,
        executionAudit,
        truthAudit,
        siteIntelligenceAudit,
        handoffAudit,
        executionDiagnostics,
        items: items.map((i) => ({
          website: i.websiteUrl ?? i.domain ?? i.id,
          imported: true,
          analyzed: [
            'Analyzed',
            'Classified',
            'Approved',
            'Package Generated',
            'Ready',
            'Submitting',
            'Waiting Human',
            'Retrying',
            'Submitted',
            'Verified',
            'Completed',
            'Failed',
            'Ignored',
          ].includes(i.currentStatus),
          approved: [
            'Approved',
            'Package Generated',
            'Ready',
            'Submitting',
            'Waiting Human',
            'Retrying',
            'Submitted',
            'Verified',
            'Completed',
          ].includes(i.currentStatus),
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
      };

      campaignHealthCache.set(cacheKey, { at: Date.now(), data: payload });
      if (campaignHealthCache.size > 40) {
        const oldest = [...campaignHealthCache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
        if (oldest) campaignHealthCache.delete(oldest[0]);
      }

      span.end(true, { cache: 'miss', items: items.length });
      res.json({ data: payload });
    } catch (err) {
      next(err);
    }
  }
);

const campaignHealthCache = new Map<string, { at: number; data: unknown }>();

/** P1 — thin SSE progress channel (polling fallback remains). */
backlinkBuilderRouter.get(
  '/events',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      const workspaceId = param(req.params.projectId);
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();

      const send = (event: string, data: unknown) => {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      send('connected', { workspaceId, at: new Date().toISOString() });

      const tick = async () => {
        try {
          const { getCampaignCounts } = await import(
            '../../modules/campaigns/campaign-state.service.js'
          );
          const counts = await getCampaignCounts(workspaceId);
          send('campaign', {
            at: new Date().toISOString(),
            ready: counts.ready ?? 0,
            submitting: counts.submitting ?? 0,
            waiting: counts.waiting ?? 0,
            submitted: counts.submitted ?? 0,
            failed: counts.failed ?? 0,
            total: counts.total ?? 0,
          });
        } catch (err) {
          send('error', { message: err instanceof Error ? err.message : String(err) });
        }
      };

      await tick();
      const iv = setInterval(() => {
        void tick();
      }, 4_000);

      req.on('close', () => {
        clearInterval(iv);
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

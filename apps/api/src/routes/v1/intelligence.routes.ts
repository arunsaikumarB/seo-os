import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '@seo-os/shared';
import { PIPELINE_STATUSES } from '@seo-os/seo-intelligence';
import { authMiddleware, type AuthenticatedRequest } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import {
  getIntelligenceSummary,
  runFullDiscovery,
} from '../../modules/intelligence/intelligence.service.js';
import {
  getScan,
  getScanPages,
  listScans,
  startWebsiteScan,
} from '../../modules/intelligence/website-scan.service.js';
import {
  discoverCompetitors,
  listCompetitorSuggestions,
  listCompetitors,
  validateCompetitor,
} from '../../modules/intelligence/competitor.service.js';
import {
  discoverKeywords,
  listKeywordClusters,
  listKeywords,
} from '../../modules/intelligence/keyword.service.js';
import { listOpportunities } from '../../modules/intelligence/opportunity.service.js';
import {
  createProspectFromOpportunity,
  listProspectsByStatus,
  updateProspectStatus,
} from '../../modules/intelligence/prospect.service.js';
import { listResearchEvents } from '../../modules/intelligence/research.service.js';
import {
  executeBrowserIntelligenceScan,
  getBrowserIntelligenceSummary,
  getWebsiteProfile,
  listBrowserScans,
  listScanDiscoveries,
  listWebsiteProfiles,
  startBrowserIntelligenceScan,
} from '../../modules/intelligence/browser-intelligence.service.js';
import { getProjectById } from '../../modules/projects/project.service.js';

function param(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

export const intelligenceRouter = Router({ mergeParams: true });

intelligenceRouter.get(
  '/summary',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      const summary = await getIntelligenceSummary(param(req.params.projectId));
      res.json({ data: summary });
    } catch (err) {
      next(err);
    }
  }
);

intelligenceRouter.post(
  '/discover',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const { userId, orgId } = (req as AuthenticatedRequest).auth;
      const result = await runFullDiscovery(param(req.params.projectId), orgId, userId);
      res.status(202).json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

intelligenceRouter.get(
  '/research/events',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      const events = await listResearchEvents(param(req.params.projectId));
      res.json({ data: events });
    } catch (err) {
      next(err);
    }
  }
);

// Website scanner
intelligenceRouter.get(
  '/website/scans',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      const scans = await listScans(param(req.params.projectId));
      res.json({ data: scans });
    } catch (err) {
      next(err);
    }
  }
);

intelligenceRouter.post(
  '/website/scans',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const { userId, orgId } = (req as AuthenticatedRequest).auth;
      const project = await getProjectById(param(req.params.projectId), orgId);
      if (!project) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Project not found');
      const targetUrl =
        (req.body as { url?: string }).url ?? project.url ?? `https://${project.domain}`;
      const scan = await startWebsiteScan(param(req.params.projectId), userId, targetUrl);
      res.status(201).json({ data: scan });
    } catch (err) {
      next(err);
    }
  }
);

intelligenceRouter.get(
  '/website/scans/:scanId',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      const scan = await getScan(param(req.params.scanId), param(req.params.projectId));
      if (!scan) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Scan not found');
      const [pages, discoveries] = await Promise.all([
        getScanPages(param(req.params.scanId), param(req.params.projectId)),
        listScanDiscoveries(param(req.params.scanId), param(req.params.projectId)),
      ]);
      res.json({ data: { scan, pages, discoveries } });
    } catch (err) {
      next(err);
    }
  }
);

// Browser Intelligence Engine (Epic 3)
intelligenceRouter.get(
  '/browser/summary',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      res.json({ data: await getBrowserIntelligenceSummary(param(req.params.projectId)) });
    } catch (err) {
      next(err);
    }
  }
);

intelligenceRouter.get(
  '/browser/scans',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      res.json({ data: await listBrowserScans(param(req.params.projectId)) });
    } catch (err) {
      next(err);
    }
  }
);

intelligenceRouter.post(
  '/browser/scans',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const { userId, orgId } = (req as AuthenticatedRequest).auth;
      const project = await getProjectById(param(req.params.projectId), orgId);
      if (!project) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Project not found');
      const targetUrl =
        (req.body as { url?: string }).url ?? project.url ?? `https://${project.domain}`;
      const scan = await startBrowserIntelligenceScan(
        param(req.params.projectId),
        userId,
        targetUrl
      );
      const { getEnv } = await import('../../config/env.js');
      const { enqueueJob, QUEUES } = await import('../../jobs/boss.js');
      if (getEnv().ENABLE_WORKERS) {
        await enqueueJob(
          QUEUES.CRAWL,
          'browser.intelligence.scan',
          { scanId: scan.id, workspaceId: param(req.params.projectId), orgId },
          { singletonKey: scan.id }
        );
      } else {
        await executeBrowserIntelligenceScan(scan.id, param(req.params.projectId), orgId);
      }
      res.status(201).json({ data: scan });
    } catch (err) {
      next(err);
    }
  }
);

intelligenceRouter.get(
  '/browser/profiles',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      res.json({ data: await listWebsiteProfiles(param(req.params.projectId)) });
    } catch (err) {
      next(err);
    }
  }
);

intelligenceRouter.get(
  '/browser/profiles/:profileId',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      const profile = await getWebsiteProfile(
        param(req.params.profileId),
        param(req.params.projectId)
      );
      if (!profile) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Profile not found');
      res.json({ data: profile });
    } catch (err) {
      next(err);
    }
  }
);

intelligenceRouter.get(
  '/browser/scans/:scanId/discoveries',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      res.json({
        data: await listScanDiscoveries(param(req.params.scanId), param(req.params.projectId)),
      });
    } catch (err) {
      next(err);
    }
  }
);

// Competitors
intelligenceRouter.get(
  '/competitors',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      const [validated, suggestions] = await Promise.all([
        listCompetitors(param(req.params.projectId)),
        listCompetitorSuggestions(param(req.params.projectId)),
      ]);
      res.json({ data: { validated, suggestions } });
    } catch (err) {
      next(err);
    }
  }
);

intelligenceRouter.post(
  '/competitors/discover',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const { orgId } = (req as AuthenticatedRequest).auth;
      const project = await getProjectById(param(req.params.projectId), orgId);
      if (!project) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Project not found');
      const result = await discoverCompetitors(param(req.params.projectId), {
        domain: project.domain,
        industry: project.industry ?? undefined,
      });
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

intelligenceRouter.post(
  '/competitors/suggestions/:suggestionId/:action',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const action = param(req.params.action);
      if (action !== 'validate' && action !== 'reject') {
        throw new AppError(400, 'VALIDATION_ERROR', 'Action must be validate or reject');
      }
      const { userId } = (req as AuthenticatedRequest).auth;
      const result = await validateCompetitor(
        param(req.params.suggestionId),
        param(req.params.projectId),
        userId,
        action
      );
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

// Keywords
intelligenceRouter.get(
  '/keywords',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      const [keywords, clusters] = await Promise.all([
        listKeywords(param(req.params.projectId)),
        listKeywordClusters(param(req.params.projectId)),
      ]);
      res.json({ data: { keywords, clusters } });
    } catch (err) {
      next(err);
    }
  }
);

intelligenceRouter.post(
  '/keywords/discover',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const { orgId } = (req as AuthenticatedRequest).auth;
      const project = await getProjectById(param(req.params.projectId), orgId);
      if (!project) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Project not found');
      const result = await discoverKeywords(param(req.params.projectId), {
        domain: project.domain,
        industry: project.industry ?? undefined,
      });
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

// Opportunities
intelligenceRouter.get(
  '/opportunities',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      const opportunities = await listOpportunities(param(req.params.projectId));
      res.json({ data: opportunities });
    } catch (err) {
      next(err);
    }
  }
);

// Prospects pipeline
intelligenceRouter.get(
  '/prospects/pipeline',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      const pipeline = await listProspectsByStatus(param(req.params.projectId));
      res.json({ data: pipeline });
    } catch (err) {
      next(err);
    }
  }
);

intelligenceRouter.post(
  '/prospects/from-opportunity/:opportunityId',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const prospect = await createProspectFromOpportunity(
        param(req.params.projectId),
        param(req.params.opportunityId)
      );
      res.status(201).json({ data: prospect });
    } catch (err) {
      next(err);
    }
  }
);

const statusSchema = z.object({
  status: z.enum(PIPELINE_STATUSES),
});

intelligenceRouter.patch(
  '/prospects/:prospectId/status',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const parsed = statusSchema.safeParse(req.body);
      if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR', 'Invalid status');
      const prospect = await updateProspectStatus(
        param(req.params.prospectId),
        param(req.params.projectId),
        parsed.data.status
      );
      res.json({ data: prospect });
    } catch (err) {
      next(err);
    }
  }
);

// V1.1 Browser Assistant plans (also under backlink-builder)
intelligenceRouter.post(
  '/browser/plans',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const { createBrowserPlan } = await import('../../modules/backlinks/v11.service.js');
      const body = z.object({ opportunityId: z.string().uuid() }).parse(req.body);
      const { orgId } = (req as AuthenticatedRequest).auth;
      res.status(201).json({
        data: await createBrowserPlan(param(req.params.projectId), body.opportunityId, orgId),
      });
    } catch (err) {
      next(err);
    }
  }
);

intelligenceRouter.get(
  '/browser/plans/:planId',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      const { getBrowserPlan } = await import('../../modules/backlinks/v11.service.js');
      const plan = await getBrowserPlan(param(req.params.projectId), param(req.params.planId));
      if (!plan) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Plan not found');
      res.json({ data: plan });
    } catch (err) {
      next(err);
    }
  }
);

intelligenceRouter.post(
  '/browser/plans/:planId/assist',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const { startBrowserAssist } = await import('../../modules/backlinks/v11.service.js');
      const { DEFAULT_FEATURE_FLAGS } = await import('@seo-os/shared');
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

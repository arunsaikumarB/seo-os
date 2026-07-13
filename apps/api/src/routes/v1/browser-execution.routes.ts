import { Router } from 'express';
import { z } from 'zod';
import { AppError, DEFAULT_FEATURE_FLAGS } from '@seo-os/shared';
import { authMiddleware, type AuthenticatedRequest } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import {
  approveJob,
  cancelJob,
  createExecution,
  getJob,
  getOrCreatePolicy,
  getStatistics,
  listHistory,
  listJobs,
  listLogs,
  listSessions,
  pauseJob,
  replayJob,
  restartJob,
  resumeJob,
  retryJob,
  startJob,
  updateJobSteps,
  updatePolicy,
} from '../../modules/browser-execution/bee.service.js';
import { getSupabaseAdmin } from '../../lib/supabase.js';

function param(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

function requireBee() {
  if (!DEFAULT_FEATURE_FLAGS.bee_enabled) {
    throw new AppError(403, 'AUTH_FORBIDDEN', 'Browser Execution Engine is disabled');
  }
}

export const browserExecutionRouter = Router({ mergeParams: true });

browserExecutionRouter.post(
  '/browser/executions',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      requireBee();
      const body = z
        .object({
          opportunityId: z.string().uuid(),
          mode: z.enum(['prepare', 'preview', 'manual', 'automatic_eligible']).optional(),
          htmlSnippet: z.string().optional(),
          mappingOverrides: z.record(z.unknown()).optional(),
        })
        .parse(req.body);
      const { userId } = (req as AuthenticatedRequest).auth;
      const data = await createExecution({
        workspaceId: param(req.params.projectId),
        opportunityId: body.opportunityId,
        mode: body.mode,
        userId,
        htmlSnippet: body.htmlSnippet,
        mappingOverrides: body.mappingOverrides,
      });
      res.status(201).json({ data });
    } catch (err) {
      next(err);
    }
  }
);

browserExecutionRouter.post(
  '/browser/preview',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      requireBee();
      const body = z.object({ opportunityId: z.string().uuid() }).parse(req.body);
      const { userId } = (req as AuthenticatedRequest).auth;
      const data = await createExecution({
        workspaceId: param(req.params.projectId),
        opportunityId: body.opportunityId,
        mode: 'preview',
        userId,
      });
      res.status(201).json({ data });
    } catch (err) {
      next(err);
    }
  }
);

browserExecutionRouter.post(
  '/browser/start',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      requireBee();
      const body = z.object({ jobId: z.string().uuid() }).parse(req.body);
      const { userId } = (req as AuthenticatedRequest).auth;
      res.json({
        data: await startJob(param(req.params.projectId), body.jobId, userId),
      });
    } catch (err) {
      next(err);
    }
  }
);

browserExecutionRouter.post(
  '/browser/pause',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      requireBee();
      const body = z.object({ jobId: z.string().uuid() }).parse(req.body);
      res.json({ data: await pauseJob(param(req.params.projectId), body.jobId) });
    } catch (err) {
      next(err);
    }
  }
);

browserExecutionRouter.post(
  '/browser/resume',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      requireBee();
      const body = z.object({ jobId: z.string().uuid() }).parse(req.body);
      res.json({ data: await resumeJob(param(req.params.projectId), body.jobId) });
    } catch (err) {
      next(err);
    }
  }
);

browserExecutionRouter.post(
  '/browser/retry',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      requireBee();
      const body = z.object({ jobId: z.string().uuid() }).parse(req.body);
      res.json({ data: await retryJob(param(req.params.projectId), body.jobId) });
    } catch (err) {
      next(err);
    }
  }
);

browserExecutionRouter.post(
  '/browser/restart',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      requireBee();
      const body = z.object({ jobId: z.string().uuid() }).parse(req.body);
      const { userId } = (req as AuthenticatedRequest).auth;
      res.json({
        data: await restartJob(param(req.params.projectId), body.jobId, userId),
      });
    } catch (err) {
      next(err);
    }
  }
);

browserExecutionRouter.post(
  '/browser/cancel',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      requireBee();
      const body = z.object({ jobId: z.string().uuid() }).parse(req.body);
      res.json({ data: await cancelJob(param(req.params.projectId), body.jobId) });
    } catch (err) {
      next(err);
    }
  }
);

browserExecutionRouter.post(
  '/browser/approve',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      requireBee();
      const body = z.object({ jobId: z.string().uuid() }).parse(req.body);
      const { userId } = (req as AuthenticatedRequest).auth;
      res.json({
        data: await approveJob(param(req.params.projectId), body.jobId, userId),
      });
    } catch (err) {
      next(err);
    }
  }
);

browserExecutionRouter.post(
  '/browser/replay',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      requireBee();
      const body = z.object({ jobId: z.string().uuid() }).parse(req.body);
      const { userId } = (req as AuthenticatedRequest).auth;
      res.status(201).json({
        data: await replayJob(param(req.params.projectId), body.jobId, userId),
      });
    } catch (err) {
      next(err);
    }
  }
);

browserExecutionRouter.get(
  '/browser/jobs',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      requireBee();
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      res.json({ data: await listJobs(param(req.params.projectId), status) });
    } catch (err) {
      next(err);
    }
  }
);

browserExecutionRouter.get(
  '/browser/jobs/:jobId',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      requireBee();
      const data = await getJob(param(req.params.projectId), param(req.params.jobId));
      if (!data) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Job not found');
      res.json({ data });
    } catch (err) {
      next(err);
    }
  }
);

browserExecutionRouter.patch(
  '/browser/jobs/:jobId/steps',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      requireBee();
      const body = z
        .object({
          steps: z.array(
            z.object({
              stepIndex: z.number().int().nonnegative(),
              detail: z.record(z.unknown()).optional(),
              action: z.string().optional(),
            })
          ),
        })
        .parse(req.body);
      res.json({
        data: await updateJobSteps(
          param(req.params.projectId),
          param(req.params.jobId),
          body.steps
        ),
      });
    } catch (err) {
      next(err);
    }
  }
);

browserExecutionRouter.get(
  '/browser/history',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      requireBee();
      res.json({ data: await listHistory(param(req.params.projectId)) });
    } catch (err) {
      next(err);
    }
  }
);

browserExecutionRouter.get(
  '/browser/logs',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      requireBee();
      const jobId = String(req.query.jobId ?? '');
      if (!jobId) throw new AppError(400, 'VALIDATION_ERROR', 'jobId required');
      res.json({ data: await listLogs(param(req.params.projectId), jobId) });
    } catch (err) {
      next(err);
    }
  }
);

browserExecutionRouter.get(
  '/browser/sessions',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      requireBee();
      res.json({ data: await listSessions(param(req.params.projectId)) });
    } catch (err) {
      next(err);
    }
  }
);

browserExecutionRouter.get(
  '/browser/statistics',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      requireBee();
      res.json({ data: await getStatistics(param(req.params.projectId)) });
    } catch (err) {
      next(err);
    }
  }
);

browserExecutionRouter.get(
  '/browser/policies',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      requireBee();
      res.json({ data: await getOrCreatePolicy(param(req.params.projectId)) });
    } catch (err) {
      next(err);
    }
  }
);

browserExecutionRouter.put(
  '/browser/policies',
  authMiddleware,
  requireRole('manager'),
  async (req, res, next) => {
    try {
      requireBee();
      const body = z.record(z.unknown()).parse(req.body);
      res.json({ data: await updatePolicy(param(req.params.projectId), body) });
    } catch (err) {
      next(err);
    }
  }
);

browserExecutionRouter.get(
  '/browser/reports',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      requireBee();
      const format = String(req.query.format ?? 'json');
      const stats = await getStatistics(param(req.params.projectId));
      const jobs = await listJobs(param(req.params.projectId));
      const history = await listHistory(param(req.params.projectId));
      const payload = {
        generatedAt: new Date().toISOString(),
        metricsSource: 'live',
        statistics: stats,
        jobs: jobs.map((j) => ({
          id: j.id,
          status: j.status,
          domain: j.site_domain,
          mode: j.mode,
          createdAt: j.created_at,
          finishedAt: j.finished_at,
        })),
        history,
      };
      if (format === 'csv') {
        const lines = [
          'id,status,domain,mode,createdAt',
          ...payload.jobs.map(
            (j) => `${j.id},${j.status},${j.domain},${j.mode},${j.createdAt}`
          ),
        ];
        res.setHeader('Content-Type', 'text/csv');
        res.send(lines.join('\n'));
        return;
      }
      res.json({ data: payload });
    } catch (err) {
      next(err);
    }
  }
);

browserExecutionRouter.get(
  '/browser/profiles',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      requireBee();
      const { data } = await getSupabaseAdmin()
        .from('execution_profiles')
        .select('*')
        .eq('workspace_id', param(req.params.projectId))
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
        .limit(100);
      res.json({ data: data ?? [] });
    } catch (err) {
      next(err);
    }
  }
);

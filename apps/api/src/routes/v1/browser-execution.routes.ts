import { Router } from 'express';
import { z } from 'zod';
import { AppError, DEFAULT_FEATURE_FLAGS } from '@seo-os/shared';
import { authMiddleware, type AuthenticatedRequest } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import {
  approveJob,
  cancelJob,
  createExecution,
  getExecutionReport,
  getJob,
  getOrCreatePolicy,
  getStatistics,
  listExecutionReadyOpportunities,
  listHistory,
  listJobs,
  listLogs,
  listSessions,
  pauseJob,
  replayJob,
  restartJob,
  resumeJob,
  retryJob,
  startExecutionsForOpportunities,
  startJob,
  updateJobSteps,
  updatePolicy,
} from '../../modules/browser-execution/bee.service.js';
import {
  bulkRetryJobs,
  getBeeWorkerHealth,
  getFailedJobDetails,
  getQueueMonitor,
  getWorkspaceExecutionReport,
  getWorkspaceExecutionReportExcel,
  validateExecutionReadiness,
} from '../../modules/browser-execution/bee-diagnostics.service.js';
import {
  getBrowserRuntimeStatus,
  installChromium,
  repairBrowserRuntime,
  resumeWaitingInfrastructureJobs,
  runBrowserDiagnostics,
  verifyBrowserRuntime,
} from '../../modules/browser-execution/browser-runtime-manager.service.js';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import {
  captureInterventionView,
  checkInterventionCleared,
  dispatchInterventionInput,
  getIntervention,
  getInterventionFrame,
  listInterventions,
} from '../../modules/browser-execution/bee-intervention.service.js';

function param(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

function requireBee() {
  if (!DEFAULT_FEATURE_FLAGS.bee_enabled) {
    throw new AppError(403, 'AUTH_FORBIDDEN', 'Browser Execution Engine is disabled');
  }
}

export const browserExecutionRouter = Router({ mergeParams: true });

browserExecutionRouter.get(
  '/browser/opportunities',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      requireBee();
      res.json({
        data: await listExecutionReadyOpportunities(param(req.params.projectId)),
      });
    } catch (err) {
      next(err);
    }
  }
);

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
          startImmediately: z.boolean().optional(),
        })
        .parse(req.body);
      const { userId } = (req as AuthenticatedRequest).auth;
      const workspaceId = param(req.params.projectId);
      const job = await createExecution({
        workspaceId,
        opportunityId: body.opportunityId,
        mode: body.mode,
        userId,
        htmlSnippet: body.htmlSnippet,
        mappingOverrides: body.mappingOverrides,
      });
      const data =
        body.startImmediately === false
          ? job
          : ((await startJob(workspaceId, String(job.id), userId)) ?? job);
      res.status(201).json({ data });
    } catch (err) {
      next(err);
    }
  }
);

browserExecutionRouter.post(
  '/browser/executions/bulk',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      requireBee();
      const body = z
        .object({
          opportunityIds: z.array(z.string().uuid()).min(1).max(50),
          mode: z.enum(['prepare', 'preview', 'manual', 'automatic_eligible']).optional(),
          startImmediately: z.boolean().optional(),
        })
        .parse(req.body);
      const { userId } = (req as AuthenticatedRequest).auth;
      const data = await startExecutionsForOpportunities({
        workspaceId: param(req.params.projectId),
        opportunityIds: body.opportunityIds,
        userId,
        mode: body.mode,
        startImmediately: body.startImmediately,
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
      const body = z
        .object({ jobId: z.string().uuid(), force: z.boolean().optional() })
        .parse(req.body);
      res.json({
        data: await retryJob(param(req.params.projectId), body.jobId, {
          force: body.force !== false,
          delaySeconds: 0,
        }),
      });
    } catch (err) {
      next(err);
    }
  }
);

browserExecutionRouter.post(
  '/browser/retry/bulk',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      requireBee();
      const body = z
        .object({
          mode: z.enum(['all_failed', 'selected', 'by_reason', 'temporary_only']),
          jobIds: z.array(z.string().uuid()).optional(),
          reasonCode: z.string().optional(),
        })
        .parse(req.body);
      res.json({ data: await bulkRetryJobs(param(req.params.projectId), body) });
    } catch (err) {
      next(err);
    }
  }
);

browserExecutionRouter.get(
  '/browser/health',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      requireBee();
      res.json({ data: await getBeeWorkerHealth(param(req.params.projectId)) });
    } catch (err) {
      next(err);
    }
  }
);

browserExecutionRouter.get(
  '/browser/queue-monitor',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      requireBee();
      res.json({ data: await getQueueMonitor(param(req.params.projectId)) });
    } catch (err) {
      next(err);
    }
  }
);

browserExecutionRouter.get(
  '/browser/interventions',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      requireBee();
      res.json({ data: await listInterventions(param(req.params.projectId)) });
    } catch (err) {
      next(err);
    }
  }
);

browserExecutionRouter.get(
  '/browser/jobs/:jobId/intervention',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      requireBee();
      const data = await getIntervention(param(req.params.projectId), param(req.params.jobId));
      if (!data) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Job not found');
      res.json({ data });
    } catch (err) {
      next(err);
    }
  }
);

browserExecutionRouter.post(
  '/browser/jobs/:jobId/intervention/capture',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      requireBee();
      const data = await captureInterventionView(
        param(req.params.projectId),
        param(req.params.jobId)
      );
      if (!data) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Job not found');
      res.json({ data });
    } catch (err) {
      next(err);
    }
  }
);

browserExecutionRouter.post(
  '/browser/jobs/:jobId/intervention/check',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      requireBee();
      const data = await checkInterventionCleared(
        param(req.params.projectId),
        param(req.params.jobId)
      );
      res.json({ data });
    } catch (err) {
      next(err);
    }
  }
);

browserExecutionRouter.post(
  '/browser/jobs/:jobId/intervention/frame',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      requireBee();
      const data = await getInterventionFrame(
        param(req.params.projectId),
        param(req.params.jobId)
      );
      if (!data) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Job not found');
      res.json({ data });
    } catch (err) {
      next(err);
    }
  }
);

browserExecutionRouter.post(
  '/browser/jobs/:jobId/intervention/input',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      requireBee();
      const body = z
        .object({
          type: z.enum([
            'click',
            'dblclick',
            'mousemove',
            'mousedown',
            'mouseup',
            'scroll',
            'keydown',
            'keyup',
            'type',
          ]),
          x: z.number().finite().optional(),
          y: z.number().finite().optional(),
          button: z.enum(['left', 'right', 'middle']).optional(),
          deltaX: z.number().finite().optional(),
          deltaY: z.number().finite().optional(),
          key: z.string().max(40).optional(),
          text: z.string().max(500).optional(),
          modifiers: z
            .array(z.enum(['Alt', 'Control', 'Meta', 'Shift']))
            .max(4)
            .optional(),
        })
        .parse(req.body);
      const data = await dispatchInterventionInput(
        param(req.params.projectId),
        param(req.params.jobId),
        body
      );
      res.json({ data });
    } catch (err) {
      next(err);
    }
  }
);

browserExecutionRouter.get(
  '/browser/readiness',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      requireBee();
      const opportunityId =
        typeof req.query.opportunityId === 'string' ? req.query.opportunityId : undefined;
      res.json({
        data: await validateExecutionReadiness(param(req.params.projectId), opportunityId),
      });
    } catch (err) {
      next(err);
    }
  }
);

browserExecutionRouter.get(
  '/browser/jobs/:jobId/details',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      requireBee();
      const details = await getFailedJobDetails(
        param(req.params.projectId),
        param(req.params.jobId)
      );
      if (!details) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Job not found');
      res.json({ data: details });
    } catch (err) {
      next(err);
    }
  }
);

browserExecutionRouter.get(
  '/browser/workspace-report',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      requireBee();
      const format = String(req.query.format ?? 'json');
      const workspaceId = param(req.params.projectId);
      if (format === 'csv') {
        const out = await getWorkspaceExecutionReport(workspaceId, 'csv');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${out.filename}"`);
        res.send(out.body);
        return;
      }
      if (format === 'excel' || format === 'xls' || format === 'xlsx') {
        const out = await getWorkspaceExecutionReportExcel(workspaceId);
        res.setHeader('Content-Type', out.mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="${out.filename}"`);
        res.send(out.body);
        return;
      }
      if (format === 'pdf') {
        const { report } = await getWorkspaceExecutionReport(workspaceId, 'json');
        const { PDFDocument, StandardFonts } = await import('pdf-lib');
        const doc = await PDFDocument.create();
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const page = doc.addPage([612, 792]);
        let y = 750;
        for (const line of [
          'SEO OS — Browser Execution Report',
          `Generated: ${report.generatedAt}`,
          `Total: ${report.totalJobs} · Completed: ${report.completed} · Failed: ${report.failed}`,
          `Waiting User: ${report.waitingUser} · CAPTCHA: ${report.captcha} · Login: ${report.loginRequired}`,
          `Success: ${report.successRate ?? '—'}% · Avg runtime: ${report.averageRuntimeMs ?? '—'}ms`,
          'Top failure reasons:',
          ...report.topFailureReasons.map((r) => `  ${r.label}: ${r.count}`),
        ]) {
          page.drawText(String(line).slice(0, 95), { x: 40, y, size: 10, font });
          y -= 14;
          if (y < 40) break;
        }
        const bytes = await doc.save();
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="bee-report.pdf"');
        res.send(Buffer.from(bytes));
        return;
      }
      res.json({ data: await getWorkspaceExecutionReport(workspaceId, 'json') });
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
      const body = z
        .object({
          jobId: z.string().uuid(),
          reason: z.string().max(200).optional(),
        })
        .parse(req.body);
      res.json({
        data: await cancelJob(param(req.params.projectId), body.jobId, body.reason),
      });
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
      const jobId = req.query.jobId ? String(req.query.jobId) : undefined;
      if (jobId) {
        const report = await getExecutionReport(param(req.params.projectId), jobId);
        if (!report) {
          res.status(404).json({ error: 'Job not found' });
          return;
        }
        res.json({ data: report });
        return;
      }
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
          pauseReason: j.pause_reason,
          resumeReason: j.resume_reason,
          watchDurationMs: j.watch_duration_ms,
          autoResumed: j.auto_resumed,
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

browserExecutionRouter.get(
  '/browser/runtime',
  authMiddleware,
  requireRole('viewer'),
  async (_req, res, next) => {
    try {
      requireBee();
      res.json({ data: await getBrowserRuntimeStatus() });
    } catch (err) {
      next(err);
    }
  }
);

browserExecutionRouter.post(
  '/browser/runtime/verify',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      requireBee();
      const body = z
        .object({ autoInstall: z.boolean().optional() })
        .optional()
        .parse(req.body ?? {});
      res.json({
        data: await verifyBrowserRuntime({
          autoInstall: body?.autoInstall !== false,
          probeLaunch: true,
        }),
      });
    } catch (err) {
      next(err);
    }
  }
);

browserExecutionRouter.post(
  '/browser/runtime/install',
  authMiddleware,
  requireRole('admin'),
  async (_req, res, next) => {
    try {
      requireBee();
      const ok = await installChromium();
      const status = await verifyBrowserRuntime({ autoInstall: false, probeLaunch: true });
      let resumed = 0;
      if (status.health === 'healthy') {
        resumed = await resumeWaitingInfrastructureJobs().catch(() => 0);
      }
      res.json({
        data: {
          installed: ok,
          status,
          resumedJobs: resumed,
          workerRestart: ok ? 'signaled' : 'skipped',
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

browserExecutionRouter.post(
  '/browser/runtime/repair',
  authMiddleware,
  requireRole('admin'),
  async (_req, res, next) => {
    try {
      requireBee();
      const status = await repairBrowserRuntime();
      let resumed = 0;
      if (status.health === 'healthy') {
        resumed = await resumeWaitingInfrastructureJobs().catch(() => 0);
      }
      res.json({ data: { status, resumedJobs: resumed } });
    } catch (err) {
      next(err);
    }
  }
);

browserExecutionRouter.post(
  '/browser/runtime/diagnostics',
  authMiddleware,
  requireRole('member'),
  async (_req, res, next) => {
    try {
      requireBee();
      res.json({ data: await runBrowserDiagnostics() });
    } catch (err) {
      next(err);
    }
  }
);

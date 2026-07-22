import { Router } from 'express';
import { z } from 'zod';
import { REPORT_EXPORT_FORMATS, REPORT_SCHEDULES, REPORT_TYPES } from '@seo-os/reports-engine';
import { AppError } from '@seo-os/shared';
import { authMiddleware, type AuthenticatedRequest } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import {
  createReport,
  emailReportRun,
  enqueueReportGeneration,
  exportReportRun,
  getReportsSummary,
  getRun,
  listBrands,
  listReportTypes,
  listReports,
  listRuns,
  processDueScheduledReports,
  shareReportInternally,
  updateReport,
  upsertBrand,
} from '../../modules/reports/reports.service.js';

function param(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

export const reportsRouter = Router({ mergeParams: true });

reportsRouter.get('/summary', authMiddleware, requireRole('viewer'), async (req, res, next) => {
  try {
    res.json({ data: await getReportsSummary(param(req.params.projectId)) });
  } catch (err) {
    next(err);
  }
});

reportsRouter.get(
  '/backlink-ops.xlsx',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      const { exportBacklinkOpsWorkbook } = await import('../../modules/reports/reports.service.js');
      const format =
        req.query.format === 'csv' || req.query.format === 'pdf' ? req.query.format : 'xlsx';
      const file = await exportBacklinkOpsWorkbook(param(req.params.projectId), format);
      res.setHeader('Content-Type', file.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
      res.send(file.body);
    } catch (err) {
      next(err);
    }
  }
);

/** Phase 6.3 — Manual submissions download (Excel / CSV / PDF) */
reportsRouter.get(
  '/manual-links.xlsx',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      const { exportManualLinksWorkbook } = await import('../../modules/reports/reports.service.js');
      const format =
        req.query.format === 'csv' || req.query.format === 'pdf' ? req.query.format : 'xlsx';
      const file = await exportManualLinksWorkbook(param(req.params.projectId), format);
      res.setHeader('Content-Type', file.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
      res.send(file.body);
    } catch (err) {
      next(err);
    }
  }
);

reportsRouter.get(
  '/backlink-ops.csv',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      const { exportBacklinkOpsWorkbook } = await import('../../modules/reports/reports.service.js');
      const file = await exportBacklinkOpsWorkbook(param(req.params.projectId), 'csv');
      res.setHeader('Content-Type', file.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
      res.send(file.body);
    } catch (err) {
      next(err);
    }
  }
);

reportsRouter.get(
  '/backlink-ops.pdf',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      const { exportBacklinkOpsWorkbook } = await import('../../modules/reports/reports.service.js');
      const file = await exportBacklinkOpsWorkbook(param(req.params.projectId), 'pdf');
      res.setHeader('Content-Type', file.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
      res.send(file.body);
    } catch (err) {
      next(err);
    }
  }
);

reportsRouter.get('/types', authMiddleware, requireRole('viewer'), async (_req, res, next) => {
  try {
    res.json({ data: await listReportTypes() });
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/brands', authMiddleware, requireRole('viewer'), async (req, res, next) => {
  try {
    res.json({ data: await listBrands(param(req.params.projectId)) });
  } catch (err) {
    next(err);
  }
});

reportsRouter.post('/brands', authMiddleware, requireRole('member'), async (req, res, next) => {
  try {
    const body = z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().min(1).optional(),
        logoUrl: z.string().url().optional().nullable(),
        primaryColor: z.string().optional(),
        secondaryColor: z.string().optional(),
        footerText: z.string().optional().nullable(),
        coverTitle: z.string().optional().nullable(),
        agencyName: z.string().optional().nullable(),
        agencyEmail: z.string().email().optional().nullable(),
        agencyWebsite: z.string().optional().nullable(),
        isDefault: z.boolean().optional(),
      })
      .safeParse(req.body);
    if (!body.success) throw new AppError(400, 'VALIDATION_ERROR', 'Invalid brand');
    const data = await upsertBrand(param(req.params.projectId), body.data);
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/', authMiddleware, requireRole('viewer'), async (req, res, next) => {
  try {
    res.json({ data: await listReports(param(req.params.projectId)) });
  } catch (err) {
    next(err);
  }
});

reportsRouter.post('/', authMiddleware, requireRole('member'), async (req, res, next) => {
  try {
    const body = z
      .object({
        reportType: z.enum(REPORT_TYPES),
        title: z.string().optional(),
        description: z.string().optional(),
        brandId: z.string().uuid().optional(),
        schedule: z.enum(REPORT_SCHEDULES).optional(),
      })
      .safeParse(req.body);
    if (!body.success) throw new AppError(400, 'VALIDATION_ERROR', 'Invalid report');
    const { userId } = (req as AuthenticatedRequest).auth;
    const data = await createReport(param(req.params.projectId), userId, body.data);
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
});

reportsRouter.patch('/:reportId', authMiddleware, requireRole('member'), async (req, res, next) => {
  try {
    const body = z
      .object({
        title: z.string().optional(),
        description: z.string().optional(),
        brandId: z.string().uuid().nullable().optional(),
        schedule: z.enum(REPORT_SCHEDULES).optional(),
        status: z.string().optional(),
      })
      .safeParse(req.body);
    if (!body.success) throw new AppError(400, 'VALIDATION_ERROR', 'Invalid patch');
    const data = await updateReport(
      param(req.params.reportId),
      param(req.params.projectId),
      body.data
    );
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

reportsRouter.post(
  '/:reportId/generate',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const data = await enqueueReportGeneration(
        param(req.params.reportId),
        param(req.params.projectId)
      );
      res.status(202).json({ data });
    } catch (err) {
      next(err);
    }
  }
);

reportsRouter.get('/runs', authMiddleware, requireRole('viewer'), async (req, res, next) => {
  try {
    const reportId =
      typeof req.query.reportId === 'string' ? req.query.reportId : undefined;
    res.json({ data: await listRuns(param(req.params.projectId), reportId) });
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/runs/:runId', authMiddleware, requireRole('viewer'), async (req, res, next) => {
  try {
    const data = await getRun(param(req.params.runId), param(req.params.projectId));
    if (!data) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Run not found');
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

reportsRouter.get(
  '/runs/:runId/export',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const q = z
        .object({ format: z.enum(REPORT_EXPORT_FORMATS).default('pdf') })
        .safeParse(req.query);
      if (!q.success) throw new AppError(400, 'VALIDATION_ERROR', 'Invalid format');
      const file = await exportReportRun(
        param(req.params.runId),
        param(req.params.projectId),
        q.data.format
      );
      res.setHeader('Content-Type', file.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
      res.send(file.body);
    } catch (err) {
      next(err);
    }
  }
);

reportsRouter.post(
  '/runs/:runId/email',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const body = z.object({ recipient: z.string().email() }).safeParse(req.body);
      if (!body.success) throw new AppError(400, 'VALIDATION_ERROR', 'Invalid recipient');
      const data = await emailReportRun(
        param(req.params.runId),
        param(req.params.projectId),
        body.data.recipient
      );
      res.json({ data });
    } catch (err) {
      next(err);
    }
  }
);

reportsRouter.post(
  '/runs/:runId/share',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const data = await shareReportInternally(
        param(req.params.runId),
        param(req.params.projectId)
      );
      res.json({ data });
    } catch (err) {
      next(err);
    }
  }
);

reportsRouter.post(
  '/process-due',
  authMiddleware,
  requireRole('manager'),
  async (req, res, next) => {
    try {
      const data = await processDueScheduledReports(param(req.params.projectId));
      res.json({ data: { started: data.length, runs: data } });
    } catch (err) {
      next(err);
    }
  }
);

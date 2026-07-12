import { Router } from 'express';
import { z } from 'zod';
import { ANALYTICS_DASHBOARD_KEYS } from '@seo-os/analytics-engine';
import { AppError } from '@seo-os/shared';
import { authMiddleware, type AuthenticatedRequest } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import {
  exportAnalytics,
  getAnalyticsDashboard,
  getAnalyticsOverview,
  getMissionControlAnalytics,
  listCachedInsights,
} from '../../modules/analytics/analytics.service.js';

function param(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

export const analyticsRouter = Router({ mergeParams: true });

analyticsRouter.get('/overview', authMiddleware, requireRole('viewer'), async (req, res, next) => {
  try {
    const data = await getAnalyticsOverview(param(req.params.projectId));
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

analyticsRouter.get(
  '/mission-control',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      const data = await getMissionControlAnalytics(param(req.params.projectId));
      res.json({ data });
    } catch (err) {
      next(err);
    }
  }
);

analyticsRouter.get('/insights', authMiddleware, requireRole('viewer'), async (req, res, next) => {
  try {
    const overview = await getAnalyticsOverview(param(req.params.projectId));
    const cached = await listCachedInsights(param(req.params.projectId), 20);
    res.json({ data: { live: overview.insights, cached } });
  } catch (err) {
    next(err);
  }
});

analyticsRouter.get(
  '/dashboards/:key',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      const key = param(req.params.key);
      if (!(ANALYTICS_DASHBOARD_KEYS as readonly string[]).includes(key)) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Invalid dashboard key');
      }
      const data = await getAnalyticsDashboard(
        param(req.params.projectId),
        key as (typeof ANALYTICS_DASHBOARD_KEYS)[number]
      );
      res.json({ data });
    } catch (err) {
      next(err);
    }
  }
);

analyticsRouter.get('/export', authMiddleware, requireRole('member'), async (req, res, next) => {
  try {
    const q = z
      .object({
        dashboard: z.enum(ANALYTICS_DASHBOARD_KEYS),
        format: z.enum(['csv', 'xlsx', 'json']).default('json'),
      })
      .safeParse(req.query);
    if (!q.success) throw new AppError(400, 'VALIDATION_ERROR', 'Invalid export query');
    const { userId } = (req as AuthenticatedRequest).auth;
    const file = await exportAnalytics(
      param(req.params.projectId),
      q.data.dashboard,
      q.data.format,
      userId
    );
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.send(file.body);
  } catch (err) {
    next(err);
  }
});

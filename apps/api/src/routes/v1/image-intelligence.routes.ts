import { Router } from 'express';
import { z } from 'zod';
import { AppError, DEFAULT_FEATURE_FLAGS } from '@seo-os/shared';
import { IMAGE_TYPES } from '@seo-os/backlink-builder';
import { authMiddleware, type AuthenticatedRequest } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import {
  enqueueImageGenerate,
  enqueueImageTransform,
  getImageStatistics,
  getOrCreateStyleProfile,
  listImageJobs,
  listImageProviders,
  listImages,
  prepareImageSubmission,
  replayImage,
  reviewImageAsset,
} from '../../modules/image-intelligence/iie.service.js';
import { getSupabaseAdmin } from '../../lib/supabase.js';

function param(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

function requireFlag() {
  if (!DEFAULT_FEATURE_FLAGS.v13_image_generation) {
    throw new AppError(
      403,
      'AUTH_FORBIDDEN',
      'Image Intelligence is off — enable v13_image_generation after configuring IMAGE_FLUX_URL or IMAGE_SDXL_URL'
    );
  }
}

export const imageIntelligenceRouter = Router({ mergeParams: true });

imageIntelligenceRouter.post(
  '/images/generate',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      requireFlag();
      const body = z
        .object({
          opportunityId: z.string().uuid().optional(),
          campaignId: z.string().uuid().optional(),
          imageType: z.string().default('blog_hero'),
          count: z.number().int().min(1).max(6).optional(),
          width: z.number().int().optional(),
          height: z.number().int().optional(),
          providerKey: z.string().optional(),
          customPrompt: z.string().optional(),
        })
        .parse(req.body);
      const { userId } = (req as AuthenticatedRequest).auth;
      res.status(201).json({
        data: await enqueueImageGenerate({
          workspaceId: param(req.params.projectId),
          ...body,
          userId,
        }),
      });
    } catch (err) {
      next(err);
    }
  }
);

imageIntelligenceRouter.post(
  '/images/regenerate',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      requireFlag();
      const body = z.object({ assetId: z.string().uuid() }).parse(req.body);
      const { userId } = (req as AuthenticatedRequest).auth;
      res.json({
        data: await enqueueImageTransform({
          workspaceId: param(req.params.projectId),
          assetId: body.assetId,
          jobType: 'regenerate',
          userId,
        }),
      });
    } catch (err) {
      next(err);
    }
  }
);

imageIntelligenceRouter.post(
  '/images/variation',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      requireFlag();
      const body = z.object({ assetId: z.string().uuid() }).parse(req.body);
      const { userId } = (req as AuthenticatedRequest).auth;
      res.json({
        data: await enqueueImageTransform({
          workspaceId: param(req.params.projectId),
          assetId: body.assetId,
          jobType: 'variation',
          userId,
        }),
      });
    } catch (err) {
      next(err);
    }
  }
);

imageIntelligenceRouter.post(
  '/images/upscale',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      requireFlag();
      const body = z.object({ assetId: z.string().uuid() }).parse(req.body);
      const { userId } = (req as AuthenticatedRequest).auth;
      res.json({
        data: await enqueueImageTransform({
          workspaceId: param(req.params.projectId),
          assetId: body.assetId,
          jobType: 'upscale',
          userId,
        }),
      });
    } catch (err) {
      next(err);
    }
  }
);

imageIntelligenceRouter.post(
  '/images/remove-background',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      requireFlag();
      const body = z.object({ assetId: z.string().uuid() }).parse(req.body);
      const { userId } = (req as AuthenticatedRequest).auth;
      res.json({
        data: await enqueueImageTransform({
          workspaceId: param(req.params.projectId),
          assetId: body.assetId,
          jobType: 'remove_background',
          userId,
        }),
      });
    } catch (err) {
      next(err);
    }
  }
);

imageIntelligenceRouter.post(
  '/images/prepare-submission',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      requireFlag();
      const body = z
        .object({ assetId: z.string().uuid(), siteKey: z.string().optional() })
        .parse(req.body);
      const { userId } = (req as AuthenticatedRequest).auth;
      res.status(201).json({
        data: await prepareImageSubmission({
          workspaceId: param(req.params.projectId),
          assetId: body.assetId,
          siteKey: body.siteKey,
          userId,
        }),
      });
    } catch (err) {
      next(err);
    }
  }
);

imageIntelligenceRouter.post(
  '/images/replay',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      requireFlag();
      const body = z.object({ assetId: z.string().uuid() }).parse(req.body);
      const { userId } = (req as AuthenticatedRequest).auth;
      res.status(201).json({
        data: await replayImage(param(req.params.projectId), body.assetId, userId),
      });
    } catch (err) {
      next(err);
    }
  }
);

imageIntelligenceRouter.patch(
  '/images/:assetId/review',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      requireFlag();
      const body = z
        .object({ status: z.enum(['approved', 'rejected']), reason: z.string().optional() })
        .parse(req.body);
      res.json({
        data: await reviewImageAsset(
          param(req.params.projectId),
          param(req.params.assetId),
          body.status,
          body.reason
        ),
      });
    } catch (err) {
      next(err);
    }
  }
);

imageIntelligenceRouter.get(
  '/images',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      res.json({
        data: await listImages(param(req.params.projectId), status),
        meta: { imageTypes: IMAGE_TYPES, generationEnabled: DEFAULT_FEATURE_FLAGS.v13_image_generation },
      });
    } catch (err) {
      next(err);
    }
  }
);

imageIntelligenceRouter.get(
  '/images/jobs',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      res.json({ data: await listImageJobs(param(req.params.projectId)) });
    } catch (err) {
      next(err);
    }
  }
);

imageIntelligenceRouter.get(
  '/images/providers',
  authMiddleware,
  requireRole('viewer'),
  async (_req, res, next) => {
    try {
      res.json({ data: await listImageProviders() });
    } catch (err) {
      next(err);
    }
  }
);

imageIntelligenceRouter.get(
  '/images/statistics',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      res.json({ data: await getImageStatistics(param(req.params.projectId)) });
    } catch (err) {
      next(err);
    }
  }
);

imageIntelligenceRouter.get(
  '/images/style-profile',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      res.json({ data: await getOrCreateStyleProfile(param(req.params.projectId)) });
    } catch (err) {
      next(err);
    }
  }
);

imageIntelligenceRouter.get(
  '/images/sites',
  authMiddleware,
  requireRole('viewer'),
  async (_req, res, next) => {
    try {
      const { data } = await getSupabaseAdmin()
        .from('image_submission_requirements')
        .select('*')
        .eq('is_active', true)
        .is('deleted_at', null)
        .limit(50);
      res.json({ data: data ?? [] });
    } catch (err) {
      next(err);
    }
  }
);

imageIntelligenceRouter.get(
  '/images/reports',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      const format = String(req.query.format ?? 'json');
      const stats = await getImageStatistics(param(req.params.projectId));
      const images = await listImages(param(req.params.projectId));
      const payload = {
        title: 'Image Intelligence Report',
        generatedAt: new Date().toISOString(),
        statistics: stats,
        images: images.map((i) => ({
          id: i.id,
          type: i.image_type,
          status: i.status,
          provider: i.provider_key,
          createdAt: i.created_at,
        })),
      };
      if (format === 'csv' || format === 'xlsx') {
        const header = 'id,type,status,provider,createdAt';
        const rows = payload.images.map(
          (i) => `${i.id},${i.type},${i.status},${i.provider},${i.createdAt}`
        );
        res.setHeader(
          'Content-Type',
          format === 'xlsx'
            ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            : 'text/csv'
        );
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="image-intelligence.${format === 'xlsx' ? 'csv' : 'csv'}"`
        );
        res.send([header, ...rows].join('\n'));
        return;
      }
      if (format === 'pdf') {
        const { PDFDocument, StandardFonts } = await import('pdf-lib');
        const doc = await PDFDocument.create();
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const page = doc.addPage([612, 792]);
        let y = 750;
        const lines = [
          'SEO OS — Image Intelligence Report',
          `Generated: ${payload.generatedAt}`,
          `Generated: ${stats.generated} · Approved: ${stats.approved} · Submitted: ${stats.submitted}`,
          `Verified: ${stats.verified} · Rejected: ${stats.rejected}`,
          `Best provider: ${stats.bestProvider} · Best style: ${stats.bestStyle}`,
          '',
          ...payload.images.slice(0, 40).map(
            (i) => `${i.type} · ${i.status} · ${i.provider}`
          ),
        ];
        for (const line of lines) {
          page.drawText(line.slice(0, 90), { x: 40, y, size: 10, font });
          y -= 14;
          if (y < 40) break;
        }
        const bytes = await doc.save();
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="image-intelligence.pdf"');
        res.send(Buffer.from(bytes));
        return;
      }
      res.json({ data: payload });
    } catch (err) {
      next(err);
    }
  }
);

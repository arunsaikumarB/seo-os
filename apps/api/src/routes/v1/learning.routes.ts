import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '@seo-os/shared';
import { authMiddleware, type AuthenticatedRequest } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import {
  deleteFieldMapping,
  getDomainKnowledge,
  listDomainKnowledge,
  replaceDomainMappings,
  upsertFieldMapping,
} from '../../modules/learning/domain-knowledge.service.js';

function param(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

const mappingBodySchema = z.object({
  domain: z.string().min(1),
  websiteField: z.string().min(1),
  mappedTo: z.string().min(1),
  confidence: z.number().min(0).max(1).optional(),
  verifiedBy: z.string().max(64).optional(),
});

const replaceBodySchema = z.object({
  fieldMappings: z.array(
    z.object({
      websiteField: z.string().min(1),
      mappedTo: z.string().min(1),
      confidence: z.number().min(0).max(1).optional(),
    })
  ),
});

/**
 * Shared Companion learning — mounted at /v1/learning
 * Auth + X-Org-Id required.
 */
export const learningRouter = Router();

learningRouter.use(authMiddleware);

learningRouter.get('/domains', requireRole('viewer'), async (req, res, next) => {
  try {
    const { orgId } = (req as AuthenticatedRequest).auth;
    const rows = await listDomainKnowledge(orgId);
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

learningRouter.get('/domain/:domain', requireRole('viewer'), async (req, res, next) => {
  try {
    const { orgId } = (req as AuthenticatedRequest).auth;
    const domain = decodeURIComponent(param(req.params.domain));
    const knowledge = await getDomainKnowledge(orgId, domain);
    res.json({
      data: {
        domain: knowledge.domain,
        fieldMappings: knowledge.fieldMappings,
        categories: knowledge.categories,
        verified: knowledge.verified,
        wizardSteps: knowledge.wizardSteps,
        successCount: knowledge.successCount,
        lastVerified: knowledge.lastVerified,
        updatedAt: knowledge.updatedAt,
        fieldCount: knowledge.fieldCount,
      },
    });
  } catch (err) {
    next(err);
  }
});

learningRouter.post('/field-mapping', requireRole('member'), async (req, res, next) => {
  try {
    const parsed = mappingBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid field mapping payload');
    }
    const { orgId } = (req as AuthenticatedRequest).auth;
    const knowledge = await upsertFieldMapping({
      orgId,
      domain: parsed.data.domain,
      websiteField: parsed.data.websiteField,
      mappedTo: parsed.data.mappedTo,
      confidence: parsed.data.confidence,
      verifiedBy: parsed.data.verifiedBy ?? 'user',
    });
    res.status(201).json({ data: knowledge });
  } catch (err) {
    next(err);
  }
});

learningRouter.put('/domain/:domain', requireRole('member'), async (req, res, next) => {
  try {
    const parsed = replaceBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid replace payload');
    }
    const { orgId } = (req as AuthenticatedRequest).auth;
    const domain = decodeURIComponent(param(req.params.domain));
    const knowledge = await replaceDomainMappings({
      orgId,
      domain,
      fieldMappings: parsed.data.fieldMappings,
    });
    res.json({ data: knowledge });
  } catch (err) {
    next(err);
  }
});

learningRouter.delete(
  '/domain/:domain/field/:websiteField',
  requireRole('member'),
  async (req, res, next) => {
    try {
      const { orgId } = (req as AuthenticatedRequest).auth;
      const domain = decodeURIComponent(param(req.params.domain));
      const websiteField = decodeURIComponent(param(req.params.websiteField));
      const knowledge = await deleteFieldMapping({ orgId, domain, websiteField });
      res.json({ data: knowledge });
    } catch (err) {
      next(err);
    }
  }
);

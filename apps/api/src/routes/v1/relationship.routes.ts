import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '@seo-os/shared';
import { authMiddleware } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import {
  discoverFromBrowserProfiles,
  enrichFromWebsiteProfile,
  getOrganization,
  getRecommendedContacts,
  getRelationshipSummary,
  listContacts,
  listOrganizations,
  listTimeline,
} from '../../modules/relationships/relationship-intelligence.service.js';

function param(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

const enrichSchema = z.object({ profileId: z.string().uuid() });

export const relationshipRouter = Router({ mergeParams: true });

relationshipRouter.get(
  '/summary',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      res.json({ data: await getRelationshipSummary(param(req.params.projectId)) });
    } catch (err) {
      next(err);
    }
  }
);

relationshipRouter.get(
  '/organizations',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      res.json({ data: await listOrganizations(param(req.params.projectId)) });
    } catch (err) {
      next(err);
    }
  }
);

relationshipRouter.get(
  '/organizations/:orgId',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      const org = await getOrganization(param(req.params.orgId), param(req.params.projectId));
      if (!org) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Organization not found');
      res.json({ data: org });
    } catch (err) {
      next(err);
    }
  }
);

relationshipRouter.get(
  '/contacts',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      const recommended = req.query.recommended === 'true';
      res.json({ data: await listContacts(param(req.params.projectId), recommended) });
    } catch (err) {
      next(err);
    }
  }
);

relationshipRouter.get(
  '/contacts/recommended',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      const type = typeof req.query.campaignType === 'string' ? req.query.campaignType : undefined;
      res.json({ data: await getRecommendedContacts(param(req.params.projectId), type) });
    } catch (err) {
      next(err);
    }
  }
);

relationshipRouter.get(
  '/timeline',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      res.json({ data: await listTimeline(param(req.params.projectId)) });
    } catch (err) {
      next(err);
    }
  }
);

relationshipRouter.post(
  '/discover',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      res.json({ data: await discoverFromBrowserProfiles(param(req.params.projectId)) });
    } catch (err) {
      next(err);
    }
  }
);

relationshipRouter.post(
  '/enrich',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const { profileId } = enrichSchema.parse(req.body);
      res.json({ data: await enrichFromWebsiteProfile(param(req.params.projectId), profileId) });
    } catch (err) {
      next(err);
    }
  }
);

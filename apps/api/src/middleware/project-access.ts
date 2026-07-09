import type { RequestHandler } from 'express';
import { AppError } from '@seo-os/shared';
import type { AuthenticatedRequest } from './auth.js';
import { getProjectById } from '../modules/projects/project.service.js';

function param(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

/** Verifies projectId belongs to the authenticated organization (X-Org-Id). */
export const requireProjectAccess: RequestHandler = async (req, _res, next) => {
  try {
    const projectId = param(req.params.projectId);
    if (!projectId) {
      next(new AppError(400, 'VALIDATION_ERROR', 'Project ID required'));
      return;
    }
    const { orgId } = (req as AuthenticatedRequest).auth;
    const project = await getProjectById(projectId, orgId);
    if (!project) {
      next(new AppError(404, 'RESOURCE_NOT_FOUND', 'Project not found'));
      return;
    }
    next();
  } catch (err) {
    next(err);
  }
};

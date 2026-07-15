import type { RequestHandler } from 'express';
import { AppError } from '@seo-os/shared';
import type { AuthenticatedRequest } from './auth.js';
import { getProjectById } from '../modules/projects/project.service.js';

function param(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

function isLifecycleMutation(method: string, originalUrl: string): boolean {
  if (/\/(archive|restore|reset|impact|duplicate)(\?|$|\/)/.test(originalUrl)) return true;
  if (method === 'DELETE' && /\/projects\/[^/?#]+\/?(\?|#|$)/.test(originalUrl)) return true;
  return false;
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

    (req as AuthenticatedRequest & { project?: typeof project }).project = project;

    // Archived projects are read-only except lifecycle endpoints
    const mutating = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    if (
      project.status === 'archived' &&
      mutating &&
      !isLifecycleMutation(req.method, req.originalUrl)
    ) {
      next(
        new AppError(
          403,
          'AUTH_FORBIDDEN',
          'This project is archived and read-only. Restore it to make changes.'
        )
      );
      return;
    }

    next();
  } catch (err) {
    next(err);
  }
};

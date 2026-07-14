import { Router } from 'express';
import { z } from 'zod';
import {
  createOrganizationSchema,
  createProjectSchema,
  updateOrganizationSchema,
  updateProfileSchema,
  updateProjectSchema,
} from '@seo-os/shared';
import { AGENT_TYPES } from '@seo-os/agent-contracts';
import { AppError } from '@seo-os/shared';
import {
  authMiddleware,
  jwtOnlyMiddleware,
  type AuthenticatedRequest,
} from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { requireProjectAccess } from '../../middleware/project-access.js';
import { createOrganization, getOrganization } from '../../modules/organizations/org.service.js';
import {
  getProfile,
  listOrgMembers,
  updateOrganization,
  updateProfile,
} from '../../modules/organizations/member.service.js';
import {
  archiveProject,
  createProject,
  getProjectById,
  listProjectsByOrg,
  updateProject,
} from '../../modules/projects/project.service.js';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import {
  createAgentRun,
  getAgentRun,
  getAIHealth,
  getAIEvents,
  listAgentRuns,
  listAgents,
} from '../../modules/ai/agent.service.js';
import {
  getFeatureFlags,
  getProviderStatus,
  getQueueStatus,
  getMissionControlSummary,
} from '../../modules/ai/infra.service.js';
import { knowledgeRouter } from './knowledge.routes.js';
import { chatRouter } from './chat.routes.js';
import { intelligenceRouter } from './intelligence.routes.js';
import { campaignsRouter } from './campaigns.routes.js';
import { backlinkBuilderRouter } from './backlink-builder.routes.js';
import { browserExecutionRouter } from './browser-execution.routes.js';
import { imageIntelligenceRouter } from './image-intelligence.routes.js';
import { providerFrameworkRouter } from './provider-framework.routes.js';
import { relationshipRouter } from './relationship.routes.js';
import { outreachRouter } from './outreach.routes.js';
import { workflowsRouter } from './workflows.routes.js';
import {
  auditRouter,
  notificationsRouter,
  platformRouter,
} from './platform.routes.js';
import { analyticsRouter } from './analytics.routes.js';
import { reportsRouter } from './reports.routes.js';
import { technicalSeoRouter } from './technical-seo.routes.js';
import { integrationsRouter } from './integrations.routes.js';
import { betaOrgRouter, betaGlobalRouter } from './beta.routes.js';
import { getExecutiveSummary } from '../../modules/executive/executive.service.js';
import { logger } from '../../lib/logger.js';

function param(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

export const v1Router = Router();

const projectScopeRouter = Router({ mergeParams: true });
projectScopeRouter.use(authMiddleware);
projectScopeRouter.use(requireProjectAccess);

v1Router.get('/version', (_req, res) => {
  res.json({ data: { version: '1.2.6-qualify-pipeline', api: 'v1' } });
});

v1Router.use('/notifications', notificationsRouter);
v1Router.use('/organizations', auditRouter);
v1Router.use('/beta', betaGlobalRouter);

v1Router.get('/me', jwtOnlyMiddleware, async (req, res, next) => {
  try {
    const { userId } = (req as AuthenticatedRequest).auth;
    const profile = await getProfile(userId);

    const { data: memberships } = await getSupabaseAdmin()
      .from('org_members')
      .select('role, org_id, organizations(id, name, slug, industry, plan)')
      .eq('user_id', userId)
      .eq('status', 'active');

    res.json({
      data: {
        user: profile,
        organizations: memberships ?? [],
      },
    });
  } catch (err) {
    next(err);
  }
});

v1Router.patch('/me', jwtOnlyMiddleware, async (req, res, next) => {
  try {
    const parsed = updateProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'Invalid profile',
        parsed.error.flatten().fieldErrors as never
      );
    }
    const { userId } = (req as AuthenticatedRequest).auth;
    const profile = await updateProfile(userId, parsed.data);
    res.json({ data: profile });
  } catch (err) {
    next(err);
  }
});

v1Router.post('/organizations', jwtOnlyMiddleware, async (req, res, next) => {
  try {
    const parsed = createOrganizationSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'Invalid organization',
        parsed.error.flatten().fieldErrors as never
      );
    }
    const { userId } = (req as AuthenticatedRequest).auth;
    const org = await createOrganization(userId, parsed.data);
    res.status(201).json({ data: org });
  } catch (err) {
    next(err);
  }
});

v1Router.get('/organizations/:orgId', authMiddleware, async (req, res, next) => {
  try {
    const org = await getOrganization(param(req.params.orgId));
    if (!org) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Organization not found');
    res.json({ data: org });
  } catch (err) {
    next(err);
  }
});

v1Router.use('/organizations/:orgId/beta', betaOrgRouter);

v1Router.patch(
  '/organizations/:orgId',
  authMiddleware,
  requireRole('admin'),
  async (req, res, next) => {
    try {
      const parsed = updateOrganizationSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          'Invalid organization',
          parsed.error.flatten().fieldErrors as never
        );
      }
      const org = await updateOrganization(param(req.params.orgId), parsed.data);
      res.json({ data: org });
    } catch (err) {
      next(err);
    }
  }
);

v1Router.get(
  '/organizations/:orgId/members',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      const members = await listOrgMembers(param(req.params.orgId));
      res.json({ data: members });
    } catch (err) {
      next(err);
    }
  }
);

v1Router.get(
  '/organizations/:orgId/projects',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      const projects = await listProjectsByOrg(param(req.params.orgId));
      res.json({
        data: projects,
        pagination: { nextCursor: null, prevCursor: null, limit: 50, hasMore: false },
      });
    } catch (err) {
      next(err);
    }
  }
);

v1Router.post(
  '/organizations/:orgId/projects',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const routeOrgId = param(req.params.orgId);
      const { userId, orgId } = (req as AuthenticatedRequest).auth;

      logger.info(
        {
          routeOrgId,
          orgId,
          userId,
          body: req.body,
          action: 'create_project_request',
        },
        'Incoming create project request'
      );

      if (routeOrgId !== orgId) {
        throw new AppError(403, 'TENANT_MISMATCH', 'Organization id mismatch');
      }

      const parsed = createProjectSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          'Invalid project',
          parsed.error.flatten().fieldErrors as never
        );
      }

      const project = await createProject(routeOrgId, userId, parsed.data);
      res.status(201).json({ data: project });
    } catch (err) {
      next(err);
    }
  }
);

v1Router.get(
  '/executive/summary',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      const { orgId, userId } = (req as AuthenticatedRequest).auth;
      const summary = await getExecutiveSummary(orgId, userId);
      res.json({ data: summary });
    } catch (err) {
      next(err);
    }
  }
);

projectScopeRouter.get('/', requireRole('viewer'), async (req, res, next) => {
  try {
    const { orgId } = (req as AuthenticatedRequest).auth;
    const project = await getProjectById(param(req.params.projectId), orgId);
    if (!project) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Project not found');
    res.json({ data: project });
  } catch (err) {
    next(err);
  }
});

projectScopeRouter.patch('/', requireRole('member'), async (req, res, next) => {
  try {
    const parsed = updateProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'Invalid project',
        parsed.error.flatten().fieldErrors as never
      );
    }
    const { orgId } = (req as AuthenticatedRequest).auth;
    const project = await updateProject(param(req.params.projectId), orgId, parsed.data);
    res.json({ data: project });
  } catch (err) {
    next(err);
  }
});

projectScopeRouter.post('/archive', requireRole('manager'), async (req, res, next) => {
  try {
    const { orgId } = (req as AuthenticatedRequest).auth;
    const project = await archiveProject(param(req.params.projectId), orgId);
    res.json({ data: project });
  } catch (err) {
    next(err);
  }
});

v1Router.get('/providers/status', jwtOnlyMiddleware, async (_req, res, next) => {
  try {
    const data = await getProviderStatus();
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

v1Router.get('/feature-flags', jwtOnlyMiddleware, (_req, res) => {
  res.json({ data: getFeatureFlags() });
});

v1Router.get('/ai/agents', jwtOnlyMiddleware, async (_req, res, next) => {
  try {
    const agents = await listAgents();
    res.json({ data: agents });
  } catch (err) {
    next(err);
  }
});

v1Router.get('/ai/providers/health', jwtOnlyMiddleware, async (_req, res, next) => {
  try {
    const data = await getProviderStatus();
    res.json({ data: data.health });
  } catch (err) {
    next(err);
  }
});

const runAgentSchema = z.object({
  input: z.record(z.unknown()).optional(),
  async: z.boolean().optional(),
  useAI: z.boolean().optional(),
});

projectScopeRouter.post(
  '/ai/agents/:agentType/run',
  requireRole('member'),
  async (req, res, next) => {
    try {
      const agentType = param(req.params.agentType);
      if (!AGENT_TYPES.includes(agentType as (typeof AGENT_TYPES)[number])) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Invalid agent type');
      }
      const parsed = runAgentSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Invalid run request');
      }
      const { userId } = (req as AuthenticatedRequest).auth;
      const result = await createAgentRun({
        workspaceId: param(req.params.projectId),
        agentType: agentType as (typeof AGENT_TYPES)[number],
        input: parsed.data.input,
        userId,
        async: parsed.data.async,
        useAI: parsed.data.useAI,
      });
      res.status(202).json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

projectScopeRouter.get('/ai/runs', requireRole('viewer'), async (req, res, next) => {
  try {
    const runs = await listAgentRuns(param(req.params.projectId));
    res.json({ data: runs });
  } catch (err) {
    next(err);
  }
});

projectScopeRouter.get('/ai/runs/:runId', requireRole('viewer'), async (req, res, next) => {
  try {
    const run = await getAgentRun(param(req.params.runId), param(req.params.projectId));
    if (!run) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Agent run not found');
    res.json({ data: run });
  } catch (err) {
    next(err);
  }
});

projectScopeRouter.get('/ai/health', requireRole('viewer'), async (req, res, next) => {
  try {
    const health = await getAIHealth(param(req.params.projectId));
    res.json({ data: health });
  } catch (err) {
    next(err);
  }
});

projectScopeRouter.get('/ai/events', requireRole('viewer'), async (req, res, next) => {
  try {
    const events = await getAIEvents(param(req.params.projectId));
    res.json({ data: events });
  } catch (err) {
    next(err);
  }
});

projectScopeRouter.get('/ai/queue', requireRole('viewer'), async (_req, res, next) => {
  try {
    const queue = await getQueueStatus();
    res.json({ data: queue });
  } catch (err) {
    next(err);
  }
});

projectScopeRouter.get(
  '/mission-control/summary',
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      const summary = await getMissionControlSummary(param(req.params.projectId));
      res.json({ data: summary });
    } catch (err) {
      next(err);
    }
  }
);

projectScopeRouter.use('/knowledge', knowledgeRouter);
projectScopeRouter.use('/chat', chatRouter);
projectScopeRouter.use('/intelligence', intelligenceRouter);
projectScopeRouter.use('/campaigns', campaignsRouter);
projectScopeRouter.use('/backlink-builder', backlinkBuilderRouter);
projectScopeRouter.use(browserExecutionRouter);
projectScopeRouter.use(imageIntelligenceRouter);
projectScopeRouter.use(providerFrameworkRouter);
projectScopeRouter.use('/relationships', relationshipRouter);
projectScopeRouter.use('/outreach', outreachRouter);
projectScopeRouter.use('/workflows', workflowsRouter);
projectScopeRouter.use('/platform', platformRouter);
projectScopeRouter.use('/analytics', analyticsRouter);
projectScopeRouter.use('/reports', reportsRouter);
projectScopeRouter.use('/technical-seo', technicalSeoRouter);
projectScopeRouter.use('/integrations', integrationsRouter);

v1Router.get('/integrations/oauth/:provider/callback', async (req, res, next) => {
  try {
    const provider = param(req.params.provider);
    if (provider !== 'google' && provider !== 'microsoft') {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid provider');
    }
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    if (!code || !state) throw new AppError(400, 'VALIDATION_ERROR', 'Missing code/state');
    const { handleOAuthCallback } = await import('../../modules/integrations/oauth.service.js');
    const result = await handleOAuthCallback(provider, code, state);
    const webOrigin = process.env.CORS_ORIGIN?.split(',')[0] ?? 'http://localhost:5173';
    res.redirect(
      `${webOrigin}/projects/${result.connection.workspace_id}/integrations/hub?oauth=${provider}&status=connected`
    );
  } catch (err) {
    next(err);
  }
});

v1Router.use('/projects/:projectId', projectScopeRouter);

import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '@seo-os/shared';
import {
  WORKFLOW_ACTION_TYPES,
  WORKFLOW_NODE_TYPES,
  WORKFLOW_TRIGGER_TYPES,
  type WorkflowDefinition,
} from '@seo-os/workflow-engine';
import { authMiddleware, type AuthenticatedRequest } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import {
  createWorkflow,
  decideWorkflowApproval,
  getBuiltInTemplates,
  getRun,
  getWorkflow,
  getWorkflowSummary,
  listPendingWorkflowApprovals,
  listRuns,
  listWorkflows,
  startWorkflowRun,
  updateWorkflow,
} from '../../modules/workflows/workflow.service.js';

function param(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

const nodeSchema = z.object({
  id: z.string(),
  type: z.enum(WORKFLOW_NODE_TYPES),
  data: z.object({
    label: z.string(),
    description: z.string().optional(),
    triggerType: z.enum(WORKFLOW_TRIGGER_TYPES).optional(),
    condition: z
      .object({
        field: z.string(),
        operator: z.enum(['gt', 'gte', 'lt', 'lte', 'eq', 'neq', 'contains', 'exists']),
        value: z.union([z.string(), z.number(), z.boolean()]).optional(),
      })
      .optional(),
    delayMinutes: z.number().optional(),
    action: z.enum(WORKFLOW_ACTION_TYPES).optional(),
    actionConfig: z.record(z.unknown()).optional(),
    requiresApproval: z.boolean().optional(),
    branch: z.string().optional(),
  }),
  position: z.object({ x: z.number(), y: z.number() }),
});

const definitionSchema = z.object({
  nodes: z.array(nodeSchema),
  edges: z.array(
    z.object({
      id: z.string(),
      source: z.string(),
      target: z.string(),
      label: z.string().optional(),
    })
  ),
}) satisfies z.ZodType<WorkflowDefinition>;

export const workflowsRouter = Router({ mergeParams: true });

workflowsRouter.get('/summary', authMiddleware, requireRole('viewer'), async (req, res, next) => {
  try {
    res.json({ data: await getWorkflowSummary(param(req.params.projectId)) });
  } catch (err) {
    next(err);
  }
});

workflowsRouter.get('/templates', authMiddleware, requireRole('viewer'), async (_req, res, next) => {
  try {
    res.json({ data: getBuiltInTemplates() });
  } catch (err) {
    next(err);
  }
});

workflowsRouter.get('/', authMiddleware, requireRole('viewer'), async (req, res, next) => {
  try {
    res.json({ data: await listWorkflows(param(req.params.projectId)) });
  } catch (err) {
    next(err);
  }
});

workflowsRouter.post('/', authMiddleware, requireRole('member'), async (req, res, next) => {
  try {
    const body = z
      .object({
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        triggerType: z.enum(WORKFLOW_TRIGGER_TYPES).optional(),
        templateKey: z.string().optional(),
        definition: definitionSchema.optional(),
      })
      .parse(req.body ?? {});
    res.status(201).json({
      data: await createWorkflow(param(req.params.projectId), body),
    });
  } catch (err) {
    next(err);
  }
});

workflowsRouter.get(
  '/runs',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      const workflowId =
        typeof req.query.workflowId === 'string' ? req.query.workflowId : undefined;
      res.json({ data: await listRuns(param(req.params.projectId), workflowId) });
    } catch (err) {
      next(err);
    }
  }
);

workflowsRouter.get(
  '/runs/:runId',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      const run = await getRun(param(req.params.runId), param(req.params.projectId));
      if (!run) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Workflow run not found');
      res.json({ data: run });
    } catch (err) {
      next(err);
    }
  }
);

workflowsRouter.get(
  '/approvals',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      res.json({ data: await listPendingWorkflowApprovals(param(req.params.projectId)) });
    } catch (err) {
      next(err);
    }
  }
);

workflowsRouter.post(
  '/approvals/:approvalId/decide',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const { decision } = z
        .object({ decision: z.enum(['approved', 'rejected']) })
        .parse(req.body ?? {});
      const authReq = req as AuthenticatedRequest;
      res.json({
        data: await decideWorkflowApproval(
          param(req.params.approvalId),
          param(req.params.projectId),
          decision,
          authReq.auth?.userId
        ),
      });
    } catch (err) {
      next(err);
    }
  }
);

workflowsRouter.get(
  '/:workflowId',
  authMiddleware,
  requireRole('viewer'),
  async (req, res, next) => {
    try {
      const workflow = await getWorkflow(param(req.params.workflowId), param(req.params.projectId));
      if (!workflow) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Workflow not found');
      res.json({ data: workflow });
    } catch (err) {
      next(err);
    }
  }
);

workflowsRouter.patch(
  '/:workflowId',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const body = z
        .object({
          name: z.string().min(1).optional(),
          description: z.string().optional(),
          status: z.enum(['draft', 'active', 'paused', 'archived']).optional(),
          triggerType: z.enum(WORKFLOW_TRIGGER_TYPES).optional(),
          triggerConfig: z.record(z.unknown()).optional(),
          definition: definitionSchema.optional(),
          requireApprovalForExternal: z.boolean().optional(),
        })
        .parse(req.body ?? {});
      res.json({
        data: await updateWorkflow(
          param(req.params.workflowId),
          param(req.params.projectId),
          body
        ),
      });
    } catch (err) {
      next(err);
    }
  }
);

workflowsRouter.post(
  '/:workflowId/run',
  authMiddleware,
  requireRole('member'),
  async (req, res, next) => {
    try {
      const body = z
        .object({
          triggerEvent: z.record(z.unknown()).optional(),
        })
        .parse(req.body ?? {});
      res.status(201).json({
        data: await startWorkflowRun(
          param(req.params.workflowId),
          param(req.params.projectId),
          body.triggerEvent ?? { source: 'manual' }
        ),
      });
    } catch (err) {
      next(err);
    }
  }
);

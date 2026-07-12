import {
  createBlankWorkflowDefinition,
  executeNode,
  getStartNodeId,
  getWorkflowTemplate,
  listWorkflowTemplates,
  peekNode,
  resolveNextNodeId,
  validateDefinition,
  WORKFLOW_ORCHESTRATOR_AGENT,
  type WorkflowDefinition,
  type WorkflowTriggerType,
} from '@seo-os/workflow-engine';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { enqueueJob, QUEUES } from '../../jobs/boss.js';
import { logger } from '../../lib/logger.js';

type WorkflowRow = {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  status: string;
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  definition: WorkflowDefinition;
  template_key: string | null;
  require_approval_for_external: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

function asDefinition(raw: unknown): WorkflowDefinition {
  if (raw && typeof raw === 'object' && Array.isArray((raw as WorkflowDefinition).nodes)) {
    return raw as WorkflowDefinition;
  }
  return createBlankWorkflowDefinition();
}

export async function getWorkflowSummary(workspaceId: string) {
  const [workflows, runs, approvals] = await Promise.all([
    getSupabaseAdmin().from('workflows').select('id, status').eq('workspace_id', workspaceId),
    getSupabaseAdmin()
      .from('workflow_runs')
      .select('id, status, created_at, completed_at')
      .eq('workspace_id', workspaceId),
    getSupabaseAdmin()
      .from('workflow_approvals')
      .select('id, status')
      .eq('workspace_id', workspaceId)
      .eq('status', 'pending'),
  ]);

  const runRows = runs.data ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const completedToday = runRows.filter(
    (r) => r.status === 'completed' && String(r.completed_at ?? r.created_at).startsWith(today)
  ).length;
  const running = runRows.filter((r) => r.status === 'running' || r.status === 'waiting_delay')
    .length;
  const queued = runRows.filter((r) => r.status === 'queued').length;
  const failed = runRows.filter((r) => r.status === 'failed').length;
  const waitingApproval = runRows.filter((r) => r.status === 'waiting_approval').length;
  const terminal = runRows.filter((r) => r.status === 'completed' || r.status === 'failed');
  const successRate =
    terminal.length === 0
      ? 100
      : Math.round((terminal.filter((r) => r.status === 'completed').length / terminal.length) * 100);

  const health =
    failed > running + queued ? 'degraded' : waitingApproval > 5 ? 'attention' : 'healthy';

  return {
    runningWorkflows: running,
    queuedJobs: queued,
    completedToday,
    failedJobs: failed,
    pendingApprovals: (approvals.data ?? []).length + waitingApproval,
    workflowHealth: health,
    automationSuccessRate: successRate,
    activeDefinitions: (workflows.data ?? []).filter((w) => w.status === 'active').length,
    agent: WORKFLOW_ORCHESTRATOR_AGENT.displayName,
    disclaimer: 'Workflows orchestrate existing modules; external actions require approval.',
  };
}

export function getBuiltInTemplates() {
  return listWorkflowTemplates();
}

export async function listWorkflows(workspaceId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from('workflows')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...row,
    definition: asDefinition(row.definition),
  }));
}

export async function getWorkflow(workflowId: string, workspaceId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from('workflows')
    .select('*')
    .eq('id', workflowId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { ...data, definition: asDefinition(data.definition) } as WorkflowRow;
}

export async function createWorkflow(
  workspaceId: string,
  input: {
    name?: string;
    description?: string;
    triggerType?: WorkflowTriggerType;
    templateKey?: string;
    definition?: WorkflowDefinition;
  }
) {
  const template = input.templateKey ? getWorkflowTemplate(input.templateKey) : undefined;
  const definition =
    input.definition ?? template?.definition ?? createBlankWorkflowDefinition();
  const errors = validateDefinition(definition);
  if (errors.length) {
    logger.warn({ errors }, 'Creating workflow with validation warnings');
  }

  const { data, error } = await getSupabaseAdmin()
    .from('workflows')
    .insert({
      workspace_id: workspaceId,
      name: input.name || template?.name || 'Untitled workflow',
      description: input.description ?? template?.description ?? null,
      trigger_type: input.triggerType ?? template?.triggerType ?? 'manual',
      definition,
      template_key: input.templateKey ?? null,
      status: 'draft',
      require_approval_for_external: true,
    })
    .select('*')
    .single();
  if (error) throw error;
  return { ...data, definition: asDefinition(data.definition) };
}

export async function updateWorkflow(
  workflowId: string,
  workspaceId: string,
  patch: {
    name?: string;
    description?: string;
    status?: string;
    triggerType?: string;
    triggerConfig?: Record<string, unknown>;
    definition?: WorkflowDefinition;
    requireApprovalForExternal?: boolean;
  }
) {
  if (patch.definition) {
    const errors = validateDefinition(patch.definition);
    if (errors.length) {
      const err = new Error(errors.join('; '));
      (err as Error & { status: number }).status = 400;
      throw err;
    }
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.triggerType !== undefined) update.trigger_type = patch.triggerType;
  if (patch.triggerConfig !== undefined) update.trigger_config = patch.triggerConfig;
  if (patch.definition !== undefined) update.definition = patch.definition;
  if (patch.requireApprovalForExternal !== undefined) {
    update.require_approval_for_external = patch.requireApprovalForExternal;
  }

  const { data, error } = await getSupabaseAdmin()
    .from('workflows')
    .update(update)
    .eq('id', workflowId)
    .eq('workspace_id', workspaceId)
    .select('*')
    .single();
  if (error) throw error;
  return { ...data, definition: asDefinition(data.definition) };
}

export async function listRuns(workspaceId: string, workflowId?: string) {
  let q = getSupabaseAdmin()
    .from('workflow_runs')
    .select('*, workflows(id, name, template_key)')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (workflowId) q = q.eq('workflow_id', workflowId);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function getRun(runId: string, workspaceId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from('workflow_runs')
    .select('*, workflows(id, name, definition, require_approval_for_external)')
    .eq('id', runId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const { data: steps } = await getSupabaseAdmin()
    .from('workflow_run_steps')
    .select('*')
    .eq('run_id', runId)
    .order('created_at', { ascending: true });

  const { data: approvals } = await getSupabaseAdmin()
    .from('workflow_approvals')
    .select('*')
    .eq('run_id', runId)
    .order('created_at', { ascending: true });

  return { ...data, steps: steps ?? [], approvals: approvals ?? [] };
}

export async function startWorkflowRun(
  workflowId: string,
  workspaceId: string,
  triggerEvent: Record<string, unknown> = {}
) {
  const workflow = await getWorkflow(workflowId, workspaceId);
  if (!workflow) throw Object.assign(new Error('Workflow not found'), { status: 404 });
  if (workflow.status !== 'active' && workflow.status !== 'draft') {
    throw Object.assign(new Error('Workflow is not runnable'), { status: 400 });
  }

  const startNodeId = getStartNodeId(workflow.definition);
  if (!startNodeId) throw Object.assign(new Error('Workflow has no trigger'), { status: 400 });

  const { data: run, error } = await getSupabaseAdmin()
    .from('workflow_runs')
    .insert({
      workspace_id: workspaceId,
      workflow_id: workflowId,
      status: 'queued',
      trigger_event: triggerEvent,
      current_node_id: startNodeId,
      context: { ...triggerEvent },
      started_at: new Date().toISOString(),
    })
    .select('*')
    .single();
  if (error) throw error;

  const jobId = await enqueueJob(QUEUES.LOW, 'workflow.advance', {
    type: 'workflow_advance',
    runId: run.id,
    workspaceId,
  });
  if (!jobId) {
    return (await advanceWorkflowRun(run.id, workspaceId)) ?? run;
  }
  return run;
}

export async function triggerMatchingWorkflows(
  workspaceId: string,
  triggerType: WorkflowTriggerType,
  payload: Record<string, unknown>
) {
  const { data } = await getSupabaseAdmin()
    .from('workflows')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('status', 'active')
    .eq('trigger_type', triggerType);

  const started = [];
  for (const row of data ?? []) {
    started.push(await startWorkflowRun(row.id, workspaceId, { triggerType, ...payload }));
  }
  return started;
}

async function insertStep(
  runId: string,
  workspaceId: string,
  nodeId: string,
  nodeType: string,
  nodeLabel: string,
  status: string,
  input: Record<string, unknown>,
  output: Record<string, unknown> = {},
  error?: string
) {
  const now = new Date().toISOString();
  const { data } = await getSupabaseAdmin()
    .from('workflow_run_steps')
    .insert({
      run_id: runId,
      workspace_id: workspaceId,
      node_id: nodeId,
      node_type: nodeType,
      node_label: nodeLabel,
      status,
      input,
      output,
      error: error ?? null,
      started_at: now,
      completed_at: status === 'running' || status === 'waiting_approval' ? null : now,
    })
    .select('*')
    .single();
  return data;
}

export async function advanceWorkflowRun(runId: string, workspaceId: string) {
  const run = await getRun(runId, workspaceId);
  if (!run) throw new Error('Run not found');
  if (['completed', 'failed', 'cancelled', 'waiting_approval'].includes(run.status)) {
    return run;
  }

  const workflowMeta = run.workflows as {
    definition?: WorkflowDefinition;
    require_approval_for_external?: boolean;
  } | null;
  const definition = asDefinition(workflowMeta?.definition);
  const requireApproval = workflowMeta?.require_approval_for_external ?? true;

  let currentNodeId = run.current_node_id as string | null;
  let context = (run.context ?? {}) as Record<string, unknown>;
  let guard = 0;

  await getSupabaseAdmin()
    .from('workflow_runs')
    .update({ status: 'running', updated_at: new Date().toISOString() })
    .eq('id', runId);

  while (currentNodeId && guard < 50) {
    guard += 1;
    const node = peekNode(definition, currentNodeId);
    if (!node) {
      await getSupabaseAdmin()
        .from('workflow_runs')
        .update({
          status: 'failed',
          error: `Missing node ${currentNodeId}`,
          completed_at: new Date().toISOString(),
        })
        .eq('id', runId);
      break;
    }

    const result = executeNode(node, context, { requireApprovalForExternal: requireApproval });

    if (result.status === 'waiting_approval') {
      const step = await insertStep(
        runId,
        workspaceId,
        node.id,
        node.type,
        node.data.label,
        'waiting_approval',
        context,
        result.output
      );
      await getSupabaseAdmin().from('workflow_approvals').insert({
        workspace_id: workspaceId,
        run_id: runId,
        step_id: step?.id ?? null,
        node_id: node.id,
        status: 'pending',
        summary: result.summary,
        payload: result.output,
      });
      await getSupabaseAdmin()
        .from('workflow_runs')
        .update({
          status: 'waiting_approval',
          current_node_id: node.id,
          context,
          updated_at: new Date().toISOString(),
        })
        .eq('id', runId);
      return getRun(runId, workspaceId);
    }

    if (result.status === 'waiting_delay') {
      await insertStep(
        runId,
        workspaceId,
        node.id,
        node.type,
        node.data.label,
        'completed',
        context,
        result.output
      );
      const nextId = resolveNextNodeId(definition, node.id, 'default');
      await getSupabaseAdmin()
        .from('workflow_runs')
        .update({
          status: 'waiting_delay',
          current_node_id: nextId,
          context: { ...context, lastDelayMinutes: result.delayMinutes },
          updated_at: new Date().toISOString(),
        })
        .eq('id', runId);
      await enqueueJob(
        QUEUES.LOW,
        'workflow.advance',
        { type: 'workflow_advance', runId, workspaceId },
        { startAfter: result.delayMinutes * 60 }
      );
      return getRun(runId, workspaceId);
    }

    if (result.status === 'failed') {
      await insertStep(
        runId,
        workspaceId,
        node.id,
        node.type,
        node.data.label,
        'failed',
        context,
        {},
        result.error
      );
      await getSupabaseAdmin()
        .from('workflow_runs')
        .update({
          status: 'failed',
          error: result.error,
          current_node_id: node.id,
          completed_at: new Date().toISOString(),
        })
        .eq('id', runId);
      return getRun(runId, workspaceId);
    }

    await insertStep(
      runId,
      workspaceId,
      node.id,
      node.type,
      node.data.label,
      'completed',
      context,
      result.output
    );
    context = { ...context, [`node.${node.id}`]: result.output };

    if (node.type === 'end') {
      await getSupabaseAdmin()
        .from('workflow_runs')
        .update({
          status: 'completed',
          current_node_id: node.id,
          context,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', runId);
      return getRun(runId, workspaceId);
    }

    currentNodeId = resolveNextNodeId(definition, node.id, result.nextBranch ?? 'default');
    await getSupabaseAdmin()
      .from('workflow_runs')
      .update({
        current_node_id: currentNodeId,
        context,
        updated_at: new Date().toISOString(),
      })
      .eq('id', runId);

    if (!currentNodeId) {
      await getSupabaseAdmin()
        .from('workflow_runs')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', runId);
      break;
    }
  }

  return getRun(runId, workspaceId);
}

export async function decideWorkflowApproval(
  approvalId: string,
  workspaceId: string,
  decision: 'approved' | 'rejected',
  userId?: string
) {
  const { data: approval, error } = await getSupabaseAdmin()
    .from('workflow_approvals')
    .select('*')
    .eq('id', approvalId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (error) throw error;
  if (!approval) throw Object.assign(new Error('Approval not found'), { status: 404 });
  if (approval.status !== 'pending') {
    throw Object.assign(new Error('Approval already decided'), { status: 400 });
  }

  await getSupabaseAdmin()
    .from('workflow_approvals')
    .update({
      status: decision,
      decided_by: userId ?? null,
      decided_at: new Date().toISOString(),
    })
    .eq('id', approvalId);

  if (decision === 'rejected') {
    await getSupabaseAdmin()
      .from('workflow_runs')
      .update({
        status: 'cancelled',
        error: 'Rejected at approval gate',
        completed_at: new Date().toISOString(),
      })
      .eq('id', approval.run_id);
    return { approvalId, decision };
  }

  const run = await getRun(approval.run_id, workspaceId);
  const workflowMeta = run?.workflows as { definition?: WorkflowDefinition } | null;
  const definition = asDefinition(workflowMeta?.definition);
  const nextId = resolveNextNodeId(definition, approval.node_id, 'default');

  await getSupabaseAdmin()
    .from('workflow_runs')
    .update({
      status: 'queued',
      current_node_id: nextId,
      context: {
        ...((run?.context as Record<string, unknown>) ?? {}),
        [`approval.${approval.node_id}`]: 'approved',
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', approval.run_id);

  const jobId = await enqueueJob(QUEUES.LOW, 'workflow.advance', {
    type: 'workflow_advance',
    runId: approval.run_id,
    workspaceId,
  });
  if (!jobId) {
    await advanceWorkflowRun(approval.run_id, workspaceId);
  }

  return { approvalId, decision, nextNodeId: nextId };
}

export async function listPendingWorkflowApprovals(workspaceId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from('workflow_approvals')
    .select('*, workflow_runs(id, workflow_id, status), workflows:workflow_runs(workflows(name))')
    .eq('workspace_id', workspaceId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) {
    // Fallback simpler select if join alias fails
    const simple = await getSupabaseAdmin()
      .from('workflow_approvals')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (simple.error) throw simple.error;
    return simple.data ?? [];
  }
  return data ?? [];
}

import { randomUUID } from 'node:crypto';
import type { AgentType } from '@seo-os/agent-contracts';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { getAIRuntime } from './runtime.js';
import { enqueueJob, QUEUES } from '../../jobs/boss.js';
import { getEnv } from '../../config/env.js';

export async function listAgents() {
  const rt = getAIRuntime();
  return rt.registry.listSprint2Agents();
}

export async function listAgentRuns(workspaceId: string, limit = 20) {
  const { data, error } = await getSupabaseAdmin()
    .from('agent_runs')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data ?? [];
}

export async function getAgentRun(runId: string, workspaceId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from('agent_runs')
    .select('*')
    .eq('id', runId)
    .eq('workspace_id', workspaceId)
    .single();

  if (error) return null;
  return data;
}

export async function createAgentRun(params: {
  workspaceId: string;
  agentType: AgentType;
  input?: Record<string, unknown>;
  userId?: string;
  async?: boolean;
  useAI?: boolean;
}) {
  const runId = randomUUID();
  const rt = getAIRuntime();
  const def = rt.registry.getDefinition(params.agentType);
  if (!def) {
    throw new Error(`Unknown agent type: ${params.agentType}`);
  }

  const status = params.async && getEnv().ENABLE_WORKERS ? 'queued' : 'pending';

  const { error: insertError } = await getSupabaseAdmin().from('agent_runs').insert({
    id: runId,
    workspace_id: params.workspaceId,
    agent_type: params.agentType,
    status,
    input: params.input ?? {},
    triggered_by: params.userId ?? null,
  });

  if (insertError) throw insertError;

  await rt.events.emit(
    'agent.run.queued',
    { agentType: params.agentType, runId, async: params.async },
    { workspaceId: params.workspaceId, agentRunId: runId }
  );

  await persistEvent(params.workspaceId, runId, 'agent.run.queued', {
    agentType: params.agentType,
  });

  if (params.async && getEnv().ENABLE_WORKERS) {
    await enqueueJob(QUEUES.AGENTS, 'agent.run', {
      runId,
      workspaceId: params.workspaceId,
      agentType: params.agentType,
      input: params.input ?? {},
      useAI: params.useAI ?? false,
    });
    return { runId, status: 'queued' as const };
  }

  const result = await executeAgentRun({
    runId,
    workspaceId: params.workspaceId,
    agentType: params.agentType,
    input: params.input,
    useAI: params.useAI,
  });

  return { runId, status: result.status, output: result.output, error: result.error };
}

export async function executeAgentRun(params: {
  runId: string;
  workspaceId: string;
  agentType: AgentType;
  input?: Record<string, unknown>;
  useAI?: boolean;
}) {
  const rt = getAIRuntime();
  const supabase = getSupabaseAdmin();

  await supabase
    .from('agent_runs')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', params.runId);

  const result = await rt.runner.run({
    runId: params.runId,
    workspaceId: params.workspaceId,
    agentType: params.agentType,
    input: params.input,
    useAI: params.useAI,
  });

  await supabase
    .from('agent_runs')
    .update({
      status: result.status,
      output: result.output ?? null,
      error: result.error ?? null,
      provider: result.provider ?? null,
      tokens_input: result.inputTokens ?? 0,
      tokens_output: result.outputTokens ?? 0,
      completed_at: new Date().toISOString(),
    })
    .eq('id', params.runId);

  if (result.inputTokens || result.outputTokens) {
    await supabase.from('ai_usage_ledger').insert({
      workspace_id: params.workspaceId,
      agent_run_id: params.runId,
      provider: result.provider ?? 'unknown',
      tokens_input: result.inputTokens ?? 0,
      tokens_output: result.outputTokens ?? 0,
    });
  }

  await persistEvent(params.workspaceId, params.runId, `agent.run.${result.status}`, {
    agentType: params.agentType,
  });

  return result;
}

export async function getAIHealth(workspaceId: string) {
  const rt = getAIRuntime();
  const providerHealth = await rt.providers.getAIHealth();
  const usage = rt.telemetry.getWorkspaceSummary(workspaceId);
  const recentRuns = await listAgentRuns(workspaceId, 5);
  const failed = recentRuns.filter((r) => r.status === 'failed').length;

  return {
    providers: providerHealth,
    telemetry: usage,
    recentFailures: failed,
    agentsRegistered: rt.registry.listSprint2Agents().length,
    handlersReady: rt.registry.listSprint2Agents().filter((a) =>
      rt.registry.hasHandler(a.agentType)
    ).length,
  };
}

export async function getAIEvents(workspaceId: string, limit = 30) {
  const rt = getAIRuntime();
  const memory = rt.events.getRecent(workspaceId, limit);

  const { data } = await getSupabaseAdmin()
    .from('ai_events')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(limit);

  return {
    live: memory,
    persisted: data ?? [],
  };
}

async function persistEvent(
  workspaceId: string,
  agentRunId: string,
  eventType: string,
  payload: Record<string, unknown>
) {
  await getSupabaseAdmin().from('ai_events').insert({
    workspace_id: workspaceId,
    agent_run_id: agentRunId,
    event_type: eventType,
    payload,
  });
}

/**
 * Shared AI workforce job context — agents collaborate on one mission thread.
 */

export interface WorkforceJobContext {
  jobId: string;
  workspaceId: string;
  orgId?: string | null;
  projectId?: string | null;
  campaignId?: string | null;
  workflowRunId?: string | null;
  /** Ordered agent handoff chain */
  agentChain: string[];
  currentAgent?: string;
  /** Accumulated findings from prior agents */
  shared: Record<string, unknown>;
  status: 'queued' | 'running' | 'waiting_approval' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
}

const jobs = new Map<string, WorkforceJobContext>();

export function createWorkforceJob(input: {
  workspaceId: string;
  orgId?: string | null;
  projectId?: string | null;
  campaignId?: string | null;
  agentChain?: string[];
}): WorkforceJobContext {
  const now = new Date().toISOString();
  const job: WorkforceJobContext = {
    jobId: crypto.randomUUID(),
    workspaceId: input.workspaceId,
    orgId: input.orgId ?? null,
    projectId: input.projectId ?? null,
    campaignId: input.campaignId ?? null,
    agentChain: input.agentChain ?? [
      'browser',
      'relationship',
      'campaign',
      'content',
      'outreach',
      'qa',
      'verification',
      'executive_summary',
    ],
    currentAgent: input.agentChain?.[0] ?? 'browser',
    shared: {},
    status: 'queued',
    createdAt: now,
    updatedAt: now,
  };
  jobs.set(job.jobId, job);
  return job;
}

export function getWorkforceJob(jobId: string) {
  return jobs.get(jobId) ?? null;
}

export function advanceWorkforceJob(
  jobId: string,
  patch: {
    shared?: Record<string, unknown>;
    status?: WorkforceJobContext['status'];
    nextAgent?: string;
  }
) {
  const job = jobs.get(jobId);
  if (!job) return null;
  if (patch.shared) job.shared = { ...job.shared, ...patch.shared };
  if (patch.status) job.status = patch.status;
  if (patch.nextAgent) job.currentAgent = patch.nextAgent;
  else if (patch.status === 'running' && job.currentAgent) {
    const idx = job.agentChain.indexOf(job.currentAgent);
    if (idx >= 0 && idx < job.agentChain.length - 1) {
      job.currentAgent = job.agentChain[idx + 1];
    }
  }
  job.updatedAt = new Date().toISOString();
  jobs.set(jobId, job);
  return job;
}

export function listWorkforceJobs(workspaceId: string) {
  return [...jobs.values()]
    .filter((j) => j.workspaceId === workspaceId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

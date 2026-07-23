/**
 * Job leasing — anti-deadlock foundation for Phase 4.
 * Only the current leaseholder can update an in-flight job.
 */
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { logger } from '../../lib/logger.js';
import { BEE_RELIABILITY, beeWorkerId } from './bee-config.js';
import { appendTimelineEvent } from './bee-timeline.service.js';

export type JobLease = {
  jobId: string;
  workerId: string;
  generation: number;
  expiresAt: string;
};

const ACTIVE_LEASES = new Map<string, JobLease>();

export function getActiveLease(jobId: string): JobLease | undefined {
  return ACTIVE_LEASES.get(jobId);
}

function expiresAtIso(): string {
  return new Date(Date.now() + BEE_RELIABILITY.LEASE_TTL_MS).toISOString();
}

/** Acquire or renew a lease. Returns null if another live leaseholder owns the job. */
export async function acquireJobLease(
  workspaceId: string,
  jobId: string,
  workerId = beeWorkerId()
): Promise<JobLease | null> {
  const { data: row } = await getSupabaseAdmin()
    .from('execution_jobs')
    .select('id, lease_holder, lease_generation, lease_expires_at, opportunity_id')
    .eq('id', jobId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (!row) return null;

  const now = Date.now();
  const exp = row.lease_expires_at ? new Date(String(row.lease_expires_at)).getTime() : 0;
  const holder = row.lease_holder != null ? String(row.lease_holder) : null;
  const gen = Number(row.lease_generation ?? 0);

  if (holder && holder !== workerId && exp > now) {
    logger.debug({ jobId, holder }, 'Lease held by another worker');
    return null;
  }

  const nextGen = holder === workerId ? gen : gen + 1;
  const expiresAt = expiresAtIso();
  const { error } = await getSupabaseAdmin()
    .from('execution_jobs')
    .update({
      lease_holder: workerId,
      lease_generation: nextGen,
      lease_expires_at: expiresAt,
      leased_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId)
    .eq('workspace_id', workspaceId)
    // Optimistic: only if still free or ours or expired
    .or(
      `lease_holder.is.null,lease_holder.eq.${workerId},lease_expires_at.is.null,lease_expires_at.lt.${new Date().toISOString()}`
    );

  if (error) {
    logger.warn({ error, jobId }, 'Lease acquire failed');
    return null;
  }

  // Re-read to confirm we won
  const { data: confirm } = await getSupabaseAdmin()
    .from('execution_jobs')
    .select('lease_holder, lease_generation, lease_expires_at')
    .eq('id', jobId)
    .maybeSingle();
  if (!confirm || String(confirm.lease_holder) !== workerId) return null;

  const lease: JobLease = {
    jobId,
    workerId,
    generation: Number(confirm.lease_generation),
    expiresAt: String(confirm.lease_expires_at),
  };
  ACTIVE_LEASES.set(jobId, lease);

  if (holder !== workerId) {
    await appendTimelineEvent({
      workspaceId,
      jobId,
      opportunityId: row.opportunity_id != null ? String(row.opportunity_id) : null,
      event: 'Lease Acquired',
      stage: 'scheduler',
      workerId,
      payload: { generation: lease.generation },
    });
  }
  return lease;
}

export async function renewJobLease(
  workspaceId: string,
  jobId: string,
  lease: JobLease
): Promise<boolean> {
  const expiresAt = expiresAtIso();
  const { data, error } = await getSupabaseAdmin()
    .from('execution_jobs')
    .update({
      lease_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId)
    .eq('workspace_id', workspaceId)
    .eq('lease_holder', lease.workerId)
    .eq('lease_generation', lease.generation)
    .select('id')
    .maybeSingle();

  if (error || !data) {
    ACTIVE_LEASES.delete(jobId);
    return false;
  }
  lease.expiresAt = expiresAt;
  ACTIVE_LEASES.set(jobId, lease);
  return true;
}

export async function releaseJobLease(
  workspaceId: string,
  jobId: string,
  lease: JobLease | null
): Promise<void> {
  ACTIVE_LEASES.delete(jobId);
  if (!lease) return;
  await getSupabaseAdmin()
    .from('execution_jobs')
    .update({
      lease_holder: null,
      lease_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId)
    .eq('workspace_id', workspaceId)
    .eq('lease_holder', lease.workerId)
    .eq('lease_generation', lease.generation);
}

/**
 * Guard writes — rejects stale lease holders (prevents double-submit after network blip).
 */
export async function assertLeaseAllowsWrite(
  workspaceId: string,
  jobId: string,
  lease: JobLease | null | undefined
): Promise<void> {
  if (!lease) return; // pre-lease / terminal updates
  const { data } = await getSupabaseAdmin()
    .from('execution_jobs')
    .select('lease_holder, lease_generation, lease_expires_at')
    .eq('id', jobId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (!data) throw Object.assign(new Error('Job not found'), { code: 'STALE_LEASE' });
  if (
    String(data.lease_holder) !== lease.workerId ||
    Number(data.lease_generation) !== lease.generation
  ) {
    throw Object.assign(
      new Error('Stale lease — write rejected (another worker holds the job)'),
      { code: 'STALE_LEASE', status: 409 }
    );
  }
}

/** Expire dead leases → requeue jobs as interrupted (no site retry consumed). */
export async function sweepExpiredLeases(): Promise<{ recovered: number }> {
  const now = new Date().toISOString();
  const { data: expired } = await getSupabaseAdmin()
    .from('execution_jobs')
    .select('id, workspace_id, opportunity_id, lease_holder, status, session_id')
    .lt('lease_expires_at', now)
    .not('lease_holder', 'is', null)
    .is('deleted_at', null)
    .not(
      'status',
      'in',
      '(completed,failed,cancelled,skipped,deleted,ignored,submitted,verified,blocked_captcha,blocked_mfa,blocked_email_verify,blocked_phone_verify,needs_approval,paused,awaiting_user,watching_captcha,watching_login,ready_to_continue,waiting_infrastructure)'
    )
    .limit(100);

  let recovered = 0;
  for (const row of expired ?? []) {
    const workspaceId = String(row.workspace_id);
    const jobId = String(row.id);
    ACTIVE_LEASES.delete(jobId);

    // Close orphaned session so capacity frees
    if (row.session_id) {
      await getSupabaseAdmin()
        .from('browser_sessions')
        .update({ status: 'closed', closed_at: new Date().toISOString() })
        .eq('id', row.session_id)
        .eq('status', 'running');
    }

    await getSupabaseAdmin()
      .from('execution_jobs')
      .update({
        status: 'queued',
        lease_holder: null,
        lease_expires_at: null,
        session_id: null,
        error_message: 'worker lost — lease expired',
        failure_classification: 'WORKER_OFFLINE',
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    try {
      const { stampRequeueTrace } = await import('./bee-record-failure.service.js');
      await stampRequeueTrace({
        workspaceId,
        jobId,
        reason: `worker lost — lease expired (prior status ${row.status})`,
        source: 'sweepExpiredLeases',
      });
    } catch {
      /* best-effort */
    }

    await appendTimelineEvent({
      workspaceId,
      jobId,
      opportunityId: row.opportunity_id != null ? String(row.opportunity_id) : null,
      event: 'Worker Lost — Requeued',
      stage: 'recovery',
      workerId: row.lease_holder != null ? String(row.lease_holder) : null,
      payload: { reason: 'lease_expired', priorStatus: row.status },
    });

    recovered++;
    logger.warn({ jobId, priorStatus: row.status }, 'Expired lease recovered — job requeued');
  }
  return { recovered };
}

export function startLeaseHeartbeat(
  workspaceId: string,
  lease: JobLease
): NodeJS.Timeout {
  return setInterval(() => {
    void renewJobLease(workspaceId, lease.jobId, lease).then((ok) => {
      if (!ok) logger.warn({ jobId: lease.jobId }, 'Lease heartbeat failed — lease lost');
    });
  }, BEE_RELIABILITY.HEARTBEAT_MS);
}

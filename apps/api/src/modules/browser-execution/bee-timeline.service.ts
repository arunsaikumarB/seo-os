/**
 * Append-only Execution Timeline — forensic history per Campaign Item / job.
 */
import { getSupabaseAdmin } from '../../lib/supabase.js';

const lastEventAt = new Map<string, number>();

export async function appendTimelineEvent(params: {
  workspaceId: string;
  jobId: string;
  opportunityId?: string | null;
  event: string;
  stage?: string | null;
  workerId?: string | null;
  payload?: Record<string, unknown>;
}): Promise<void> {
  const prev = lastEventAt.get(params.jobId) ?? Date.now();
  const now = Date.now();
  lastEventAt.set(params.jobId, now);
  const durationMs = Math.max(0, now - prev);

  await getSupabaseAdmin()
    .from('execution_timeline')
    .insert({
      workspace_id: params.workspaceId,
      job_id: params.jobId,
      opportunity_id: params.opportunityId ?? null,
      event: params.event,
      stage: params.stage ?? null,
      worker_id: params.workerId ?? null,
      duration_ms: durationMs,
      payload: params.payload ?? {},
    })
    .then(({ error }) => {
      if (error) {
        // Table may not exist until migration — soft fail
        console.warn('[timeline]', error.message);
      }
    });
}

export async function listTimelineForJob(workspaceId: string, jobId: string) {
  const { data } = await getSupabaseAdmin()
    .from('execution_timeline')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('job_id', jobId)
    .order('created_at', { ascending: true })
    .limit(500);
  return data ?? [];
}

export async function listTimelineForOpportunity(workspaceId: string, opportunityId: string) {
  const { data } = await getSupabaseAdmin()
    .from('execution_timeline')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('opportunity_id', opportunityId)
    .order('created_at', { ascending: true })
    .limit(500);
  return data ?? [];
}

/** Map job status → timeline event label */
export function timelineEventForStatus(status: string): string | null {
  const map: Record<string, string> = {
    queued: 'Queued',
    preparing: 'Browser Allocated',
    launching_browser: 'Browser Allocated',
    navigating: 'Website Opened',
    analyzing_form: 'Form Detected',
    filling_fields: 'Payload Ready',
    uploading_assets: 'Uploading Assets',
    submitting: 'Submitting',
    waiting_verification: 'Waiting Verification',
    submitted: 'Completed',
    completed: 'Completed',
    verified: 'Completed',
    failed: 'Failed',
    cancelled: 'Cancelled',
    paused: 'Waiting Human',
    needs_approval: 'Waiting Human',
    blocked_captcha: 'Waiting Human — CAPTCHA',
    blocked_mfa: 'Waiting Human — MFA',
    blocked_email_verify: 'Waiting Human — Email',
    blocked_phone_verify: 'Waiting Human — Phone',
    awaiting_user: 'Waiting Human',
    retry_scheduled: 'Retrying',
    waiting_infrastructure: 'Waiting Infrastructure',
  };
  return map[status] ?? null;
}

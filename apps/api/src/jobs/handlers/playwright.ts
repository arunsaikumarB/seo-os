import { logger } from '../../lib/logger.js';
import { getSupabaseAdmin } from '../../lib/supabase.js';

/**
 * Playwright assist handler — pauses on login/CAPTCHA/email verify.
 * Does not auto-submit protected challenges.
 */
export async function handlePlaywrightJobs(
  jobs: Array<{ id: string; data: Record<string, unknown> }>
): Promise<void> {
  for (const job of jobs) {
    const type = String(job.data.type ?? '');
    if (type !== 'browser_assist_fill') {
      logger.debug({ jobId: job.id, type }, 'Unknown playwright job');
      continue;
    }
    const planId = String(job.data.planId ?? '');
    const workspaceId = String(job.data.workspaceId ?? '');
    try {
      const { data: plan } = await getSupabaseAdmin()
        .from('browser_action_plans')
        .select('*')
        .eq('id', planId)
        .eq('workspace_id', workspaceId)
        .maybeSingle();

      const blockers = (plan?.blockers as Array<{ type: string }> | null) ?? [];
      const pauseReason = blockers[0]?.type ?? 'user_confirmation';

      await getSupabaseAdmin()
        .from('browser_assist_sessions')
        .update({
          status: 'paused',
          pause_reason: pauseReason,
          snapshot_refs: [{ note: 'Assisted fill paused — user must complete protected step' }],
          updated_at: new Date().toISOString(),
        })
        .eq('plan_id', planId);

      await getSupabaseAdmin()
        .from('browser_action_plans')
        .update({ status: 'blocked', updated_at: new Date().toISOString() })
        .eq('id', planId);

      logger.info({ jobId: job.id, planId, pauseReason }, 'Browser assist paused for user action');
    } catch (err) {
      logger.error({ jobId: job.id, err }, 'Playwright assist job failed');
      throw err;
    }
  }
}

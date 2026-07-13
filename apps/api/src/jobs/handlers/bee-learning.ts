import { logger } from '../../lib/logger.js';
import { getSupabaseAdmin } from '../../lib/supabase.js';

/** Selector / requirement / stats learning after BEE runs */
export async function handleBeeLearningJobs(
  jobs: Array<{ id: string; data: Record<string, unknown> }>
): Promise<void> {
  for (const job of jobs) {
    if (String(job.data.type ?? '') !== 'bee_learning') continue;
    const jobId = String(job.data.jobId ?? '');
    const workspaceId = String(job.data.workspaceId ?? '');
    try {
      const { data: exec } = await getSupabaseAdmin()
        .from('execution_jobs')
        .select('*')
        .eq('id', jobId)
        .maybeSingle();
      if (!exec) continue;

      const domain = String(exec.site_domain ?? '');
      const form = (exec.plan_snapshot as { form?: Record<string, unknown> })?.form;
      if (domain && form) {
        await getSupabaseAdmin()
          .from('execution_profiles')
          .update({
            form_schema: form,
            last_execution_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            confidence: exec.status === 'completed' ? 70 : 45,
          })
          .eq('workspace_id', workspaceId)
          .eq('site_domain', domain);
      }

      // Refresh day stats
      const day = new Date().toISOString().slice(0, 10);
      const { data: stats } = await getSupabaseAdmin()
        .from('execution_jobs')
        .select('status')
        .eq('workspace_id', workspaceId)
        .gte('created_at', `${day}T00:00:00.000Z`);

      const counts = {
        completed: 0,
        failed: 0,
        blocked: 0,
        needs_approval: 0,
      };
      for (const s of stats ?? []) {
        const st = String(s.status);
        if (st === 'completed') counts.completed++;
        else if (st === 'failed') counts.failed++;
        else if (st.startsWith('blocked_')) counts.blocked++;
        else if (st === 'needs_approval') counts.needs_approval++;
      }
      const done = counts.completed + counts.failed;
      await getSupabaseAdmin().from('execution_statistics').upsert(
        {
          workspace_id: workspaceId,
          day,
          completed: counts.completed,
          failed: counts.failed,
          blocked: counts.blocked,
          needs_approval: counts.needs_approval,
          success_rate: done ? Math.round((counts.completed / done) * 1000) / 10 : null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'workspace_id,day' }
      );

      logger.info({ jobId, workspaceId }, 'BEE learning pass complete');
    } catch (err) {
      logger.error({ err, jobId: job.id }, 'BEE learning job failed');
    }
  }
}

export async function handleBeeCleanupJobs(
  jobs: Array<{ id: string; data: Record<string, unknown> }>
): Promise<void> {
  for (const job of jobs) {
    if (String(job.data.type ?? '') !== 'bee_cleanup') continue;
    const workspaceId = String(job.data.workspaceId ?? '');
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    await getSupabaseAdmin()
      .from('browser_sessions')
      .update({ deleted_at: new Date().toISOString(), status: 'closed' })
      .eq('workspace_id', workspaceId)
      .eq('status', 'idle')
      .lt('updated_at', cutoff);
    logger.info({ workspaceId }, 'BEE session cleanup done');
  }
}

import { logger } from '../../lib/logger.js';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { runBeeExecutionJob } from '../../modules/browser-execution/bee-worker.js';

/**
 * Playwright queue handler — V1.1 assist (compat) + BEE execution (SoT).
 * Never bypasses CAPTCHA/MFA/email/phone verification.
 */
export async function handlePlaywrightJobs(
  jobs: Array<{ id: string; data: Record<string, unknown> }>
): Promise<void> {
  for (const job of jobs) {
    const type = String(job.data.type ?? '');

    if (type === 'bee_execute') {
      const jobId = String(job.data.jobId ?? '');
      const workspaceId = String(job.data.workspaceId ?? '');
      try {
        await runBeeExecutionJob({
          jobId,
          workspaceId,
          sessionId: job.data.sessionId ? String(job.data.sessionId) : undefined,
          action: job.data.action ? String(job.data.action) : 'run',
        });
      } catch (err) {
        logger.error({ jobId: job.id, err }, 'BEE playwright job failed');
        // Phase 6.3.4 — record Failure/Retrying; do not leave Queued with no trace
        try {
          const { recordFailure } = await import(
            '../../modules/browser-execution/bee-record-failure.service.js'
          );
          await recordFailure({
            workspaceId,
            jobId,
            err,
            source: 'handlePlaywrightJobs',
            allowRetry: true,
          });
        } catch (recErr) {
          logger.error({ recErr, jobId }, 'recordFailure after playwright throw failed');
        }
        // Do not rethrow — status is now Failed/Retrying; pg-boss retry would silent-requeue
      }
      continue;
    }

    if (type === 'bee_profile') {
      try {
        const { runSiteProfileJob } = await import(
          '../../modules/browser-execution/site-intelligence.service.js'
        );
        await runSiteProfileJob({
          workspaceId: String(job.data.workspaceId ?? ''),
          profileId: String(job.data.profileId ?? ''),
          profileJobId: String(job.data.profileJobId ?? ''),
          domain: String(job.data.domain ?? ''),
        });
      } catch (err) {
        logger.error({ jobId: job.id, err }, 'SIE profile job failed');
        throw err;
      }
      continue;
    }

    // V1.1 compatibility layer — delegates pause semantics; new runs should use bee_execute
    if (type === 'browser_assist_fill') {
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
            snapshot_refs: [
              {
                note: 'V1.1 assist compatibility — paused for protected step. Prefer BEE Execution Center.',
              },
            ],
            updated_at: new Date().toISOString(),
          })
          .eq('plan_id', planId);

        await getSupabaseAdmin()
          .from('browser_action_plans')
          .update({ status: 'blocked', updated_at: new Date().toISOString() })
          .eq('id', planId);

        // If linked BEE job exists, mirror pause
        const { data: beeJob } = await getSupabaseAdmin()
          .from('execution_jobs')
          .select('id')
          .eq('legacy_plan_id', planId)
          .maybeSingle();
        if (beeJob) {
          await getSupabaseAdmin()
            .from('execution_jobs')
            .update({
              status:
                pauseReason === 'captcha'
                  ? 'blocked_captcha'
                  : pauseReason === 'email_verify'
                    ? 'blocked_email_verify'
                    : 'needs_approval',
              updated_at: new Date().toISOString(),
            })
            .eq('id', beeJob.id);
        }

        logger.info({ jobId: job.id, planId, pauseReason }, 'Browser assist (compat) paused');
      } catch (err) {
        logger.error({ jobId: job.id, err }, 'Playwright assist job failed');
        throw err;
      }
      continue;
    }

    logger.debug({ jobId: job.id, type }, 'Unknown playwright job');
  }
}

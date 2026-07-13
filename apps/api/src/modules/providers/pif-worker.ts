import { getProviderHealthSnapshot, getProviderStatistics } from './pif.service.js';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { logger } from '../../lib/logger.js';
import { randomUUID } from 'node:crypto';

export async function handleProviderJobs(
  jobs: Array<{ id: string; data: Record<string, unknown> }>
): Promise<void> {
  for (const job of jobs) {
    const type = String(job.data.type ?? '');
    const workspaceId = String(job.data.workspaceId ?? '');
    if (!workspaceId) continue;
    try {
      if (type === 'provider_health' || type === 'provider_quota') {
        await getProviderHealthSnapshot(workspaceId);
      } else if (type === 'provider_metrics' || type === 'provider_usage') {
        const stats = await getProviderStatistics(workspaceId);
        const { data: ws } = await getSupabaseAdmin()
          .from('workspaces')
          .select('org_id')
          .eq('id', workspaceId)
          .single();
        if (ws?.org_id) {
          await getSupabaseAdmin().from('provider_metrics').insert({
            id: randomUUID(),
            org_id: ws.org_id,
            workspace_id: workspaceId,
            provider_key: 'framework',
            metric: 'usage_rows',
            value: stats.usage.length,
            unit: 'count',
          });
        }
      } else if (type === 'provider_failover' || type === 'provider_retry') {
        await getProviderHealthSnapshot(workspaceId);
      }
      logger.info({ type, workspaceId }, 'Provider framework job completed');
    } catch (err) {
      logger.error({ err, type, workspaceId }, 'Provider framework job failed');
    }
  }
}

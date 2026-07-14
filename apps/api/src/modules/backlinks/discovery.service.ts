import { randomUUID } from 'node:crypto';
import {
  discoverWebsiteCandidates,
  discoverKeywordCandidates,
  type DiscoverInputs,
} from '@seo-os/backlink-builder';
import { AppError } from '@seo-os/shared';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { getProjectById } from '../projects/project.service.js';
import { enqueueJob, QUEUES, areQueuesInitialized } from '../../jobs/boss.js';
import { runAutomationPipeline } from './automation.service.js';
import { logger } from '../../lib/logger.js';
import { getEnv } from '../../config/env.js';

export async function runDiscoverWebsites(
  workspaceId: string,
  inputs: DiscoverInputs,
  opts: { userId?: string; orgId?: string } = {}
) {
  const runId = randomUUID();
  const project = opts.orgId ? await getProjectById(workspaceId, opts.orgId) : null;

  await getSupabaseAdmin().from('backlink_discovery_runs').insert({
    id: runId,
    project_id: workspaceId,
    website: inputs.website ?? project?.domain ?? null,
    industry: inputs.industry ?? project?.industry ?? null,
    country: inputs.country ?? null,
    keywords: inputs.keywords ?? [],
    target_dr: inputs.targetDr ?? null,
    target_traffic: inputs.targetTraffic ?? null,
    status: 'running',
    created_by: opts.userId ?? null,
  });

  try {
    const candidates = discoverWebsiteCandidates(
      {
        ...inputs,
        industry: inputs.industry ?? project?.industry ?? undefined,
        website: inputs.website ?? project?.domain ?? undefined,
      },
      {
        projectDomain: project?.domain ?? undefined,
        projectIndustry: inputs.industry ?? project?.industry ?? undefined,
        brandName: project?.name ?? undefined,
      },
      25
    );

    // Never emit placeholder/example domains
    const safe = candidates.filter(
      (c) => !c.domain.endsWith('.example') && !c.domain.includes('example.com')
    );

    let created = 0;
    for (const c of safe) {
      const { data: existing } = await getSupabaseAdmin()
        .from('opportunities')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('domain', c.domain)
        .maybeSingle();
      if (existing) continue;

      await getSupabaseAdmin().from('opportunities').insert({
        id: randomUUID(),
        workspace_id: workspaceId,
        opportunity_type: c.opportunityType,
        title: c.title,
        url: c.url,
        domain: c.domain,
        score: c.score,
        status: 'discovered',
        pipeline_stage: 'discovered',
        automation_status: 'qualified',
        website_name: c.title,
        domain_rating: c.domainRating,
        monthly_traffic: c.monthlyTraffic,
        country: c.country,
        spam_score: c.spamRisk,
        success_probability: c.successProbability,
        relevance_score: c.relevanceScore,
        priority: c.priority,
        recommended_action: c.recommendedAction,
        ai_recommendation: c.recommendedAction,
        discovery_source: 'ai_discover',
        authority_estimated: true,
        traffic_estimated: true,
        metrics_source: 'estimated',
        queue_status: 'pending_review',
        metadata: {
          discovery_run_id: runId,
          match_reasons: c.matchReasons,
          difficulty: c.difficulty,
          estimated: true,
          metrics_labels: {
            domain_rating: 'Estimated',
            monthly_traffic: 'Estimated',
            success_probability: 'Estimated',
            difficulty: 'Estimated',
          },
        },
      });
      created++;
    }

    const stats = {
      candidates: safe.length,
      created,
      skippedDuplicates: safe.length - created,
      metricsSource: 'estimated',
    };

    await getSupabaseAdmin()
      .from('backlink_discovery_runs')
      .update({
        status: 'completed',
        stats,
        completed_at: new Date().toISOString(),
      })
      .eq('id', runId);

    return { runId, stats, candidates: safe };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Discovery failed';
    await getSupabaseAdmin()
      .from('backlink_discovery_runs')
      .update({ status: 'failed', error_message: message })
      .eq('id', runId);
    throw err;
  }
}

export async function listDiscoveryRuns(workspaceId: string, limit = 20) {
  const { data } = await getSupabaseAdmin()
    .from('backlink_discovery_runs')
    .select('*')
    .eq('project_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function enqueueAutomationPipeline(
  workspaceId: string,
  importId: string,
  orgId?: string,
  userId?: string
) {
  const env = getEnv();

  // Workers disabled: mark analyzing and run inline (never claim a queue job succeeded).
  if (!env.ENABLE_WORKERS) {
    await getSupabaseAdmin()
      .from('backlink_imports')
      .update({ status: 'analyzing' })
      .eq('id', importId)
      .eq('workspace_id', workspaceId)
      .in('status', ['validated', 'failed', 'pending', 'analyzing']);

    void runAutomationPipeline(workspaceId, importId, orgId, userId).catch((err) => {
      logger.error({ err, importId, workspaceId }, 'Inline automation pipeline failed');
    });
    return { queued: false, jobId: null, importId, status: 'started_inline' as const };
  }

  if (!areQueuesInitialized()) {
    logger.error({ importId, workspaceId }, 'Automation enqueue refused — queues not initialized');
    await markImportEnqueueFailed(
      workspaceId,
      importId,
      'pg-boss queues not initialized — automation job was not created'
    );
    throw new AppError(
      503,
      'SERVICE_UNAVAILABLE',
      'Automation queue is not ready. Import was marked failed — retry after API workers start.'
    );
  }

  const jobId = await enqueueJob(
    QUEUES.CRAWL,
    'backlink_automation',
    { type: 'backlink_automation', workspaceId, importId, orgId, userId },
    { singletonKey: `automation-${importId}`, retryLimit: 1 }
  );

  if (!jobId) {
    logger.error(
      { importId, workspaceId, queuesInitialized: areQueuesInitialized() },
      'Automation enqueue failed — boss.send returned null (not treated as already_active)'
    );
    await markImportEnqueueFailed(
      workspaceId,
      importId,
      'Failed to enqueue automation job (pg-boss send returned null). Import left failed — not analyzing.'
    );
    throw new AppError(
      503,
      'SERVICE_UNAVAILABLE',
      'Failed to enqueue automation pipeline job. Import was marked failed — please retry.'
    );
  }

  // Only mark analyzing after a real job id exists
  const { data: existing } = await getSupabaseAdmin()
    .from('backlink_imports')
    .select('metadata')
    .eq('id', importId)
    .maybeSingle();
  const meta = {
    ...((existing?.metadata as Record<string, unknown>) ?? {}),
    lastEnqueuedJobId: jobId,
    lastEnqueuedAt: new Date().toISOString(),
    enqueueError: null,
  };
  await getSupabaseAdmin()
    .from('backlink_imports')
    .update({ status: 'analyzing', metadata: meta })
    .eq('id', importId)
    .eq('workspace_id', workspaceId);

  return { queued: true, jobId, importId, status: 'queued' as const };
}

async function markImportEnqueueFailed(workspaceId: string, importId: string, reason: string) {
  const { data: existing } = await getSupabaseAdmin()
    .from('backlink_imports')
    .select('metadata')
    .eq('id', importId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  const meta = {
    ...((existing?.metadata as Record<string, unknown>) ?? {}),
    enqueueError: reason,
    enqueueFailedAt: new Date().toISOString(),
  };
  await getSupabaseAdmin()
    .from('backlink_imports')
    .update({
      status: 'failed',
      metadata: meta,
      completed_at: new Date().toISOString(),
    })
    .eq('id', importId)
    .eq('workspace_id', workspaceId);
}

/**
 * Recover imports stuck in analyzing with no automation run (e.g. pre-queue-init bug).
 * Older than 5 minutes → re-enqueue once, or mark failed if enqueue still returns null.
 */
export async function recoverStuckAnalyzingImports(): Promise<{
  scanned: number;
  requeued: number;
  failed: number;
  skipped: number;
}> {
  const cutoff = new Date(Date.now() - 5 * 60_000).toISOString();
  const { data: stuck, error } = await getSupabaseAdmin()
    .from('backlink_imports')
    .select('id, workspace_id, created_at, created_by, metadata')
    .eq('status', 'analyzing')
    .lt('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(40);

  if (error) {
    logger.warn({ err: error }, 'recoverStuckAnalyzingImports query failed');
    return { scanned: 0, requeued: 0, failed: 0, skipped: 0 };
  }

  let requeued = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of stuck ?? []) {
    const { data: runs } = await getSupabaseAdmin()
      .from('backlink_automation_runs')
      .select('id, status')
      .eq('import_id', row.id)
      .limit(5);

    const hasRun = (runs ?? []).length > 0;
    const hasActiveRun = (runs ?? []).some((r) =>
      ['running', 'queued', 'retrying', 'waiting'].includes(String(r.status))
    );
    if (hasActiveRun) {
      skipped++;
      continue;
    }
    if (hasRun) {
      // Completed/failed run already exists — leave import status to pipeline/stats
      skipped++;
      continue;
    }

    const meta = (row.metadata as Record<string, unknown>) ?? {};
    if (meta.recoveryAttemptedAt) {
      await markImportEnqueueFailed(
        row.workspace_id,
        row.id,
        'Stuck in analyzing with no automation run after recovery attempt — marked failed'
      );
      failed++;
      continue;
    }

    await getSupabaseAdmin()
      .from('backlink_imports')
      .update({
        status: 'validated',
        metadata: {
          ...meta,
          recoveryAttemptedAt: new Date().toISOString(),
          recoveryReason: 'Stuck analyzing without automation run (>5m)',
        },
      })
      .eq('id', row.id);

    try {
      // Use a recovery singleton so a prior null ghost does not block forever
      const env = getEnv();
      if (!env.ENABLE_WORKERS || !areQueuesInitialized()) {
        await markImportEnqueueFailed(
          row.workspace_id,
          row.id,
          'Cannot recover — workers/queues unavailable'
        );
        failed++;
        continue;
      }

      const jobId = await enqueueJob(
        QUEUES.CRAWL,
        'backlink_automation',
        {
          type: 'backlink_automation',
          workspaceId: row.workspace_id,
          importId: row.id,
          userId: row.created_by ?? undefined,
        },
        { singletonKey: `automation-recovery-${row.id}`, retryLimit: 1 }
      );

      if (!jobId) {
        await markImportEnqueueFailed(
          row.workspace_id,
          row.id,
          'Recovery re-enqueue failed — boss.send returned null'
        );
        failed++;
        continue;
      }

      await getSupabaseAdmin()
        .from('backlink_imports')
        .update({
          status: 'analyzing',
          metadata: {
            ...meta,
            recoveryAttemptedAt: new Date().toISOString(),
            lastEnqueuedJobId: jobId,
            lastEnqueuedAt: new Date().toISOString(),
            enqueueError: null,
          },
        })
        .eq('id', row.id);

      requeued++;
      logger.info({ importId: row.id, jobId }, 'Re-enqueued stuck analyzing import');
    } catch (err) {
      logger.error({ err, importId: row.id }, 'Stuck import recovery error');
      await markImportEnqueueFailed(
        row.workspace_id,
        row.id,
        err instanceof Error ? err.message : 'Recovery failed'
      );
      failed++;
    }
  }

  return { scanned: stuck?.length ?? 0, requeued, failed, skipped };
}

export async function discoverProjectKeywords(
  workspaceId: string,
  primaryKeywords: string[],
  industry?: string
) {
  const candidates = discoverKeywordCandidates(primaryKeywords, industry);
  let inserted = 0;
  for (const c of candidates) {
    const { data: existing } = await getSupabaseAdmin()
      .from('keywords')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('keyword', c.keyword)
      .maybeSingle();
    if (existing) continue;
    await getSupabaseAdmin().from('keywords').insert({
      id: randomUUID(),
      workspace_id: workspaceId,
      keyword: c.keyword,
      priority_score: Math.round(100 - c.estimatedDifficulty * 0.5),
      discovery_source: 'ai_discover',
      metadata: {
        type: c.type,
        metrics_source: c.metricsSource,
        search_volume: c.estimatedVolume,
        difficulty: c.estimatedDifficulty,
        metrics_labels: { search_volume: 'Estimated', difficulty: 'Estimated' },
      },
    });
    inserted++;
  }
  logger.info({ workspaceId, inserted, total: candidates.length }, 'Keyword discovery completed');
  return { candidates, inserted, metricsSource: 'estimated' as const };
}

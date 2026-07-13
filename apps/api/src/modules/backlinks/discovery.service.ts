import { randomUUID } from 'node:crypto';
import {
  discoverWebsiteCandidates,
  discoverKeywordCandidates,
  type DiscoverInputs,
} from '@seo-os/backlink-builder';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { getProjectById } from '../projects/project.service.js';
import { enqueueJob, QUEUES } from '../../jobs/boss.js';
import { runAutomationPipeline } from './automation.service.js';
import { logger } from '../../lib/logger.js';

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
        queue_status: 'pending_approval',
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
  const jobId = await enqueueJob(
    QUEUES.CRAWL,
    'backlink_automation',
    { type: 'backlink_automation', workspaceId, importId, orgId, userId },
    { singletonKey: `automation-${importId}`, retryLimit: 1 }
  );
  if (!jobId) {
    return runAutomationPipeline(workspaceId, importId, orgId, userId);
  }
  return { queued: true, jobId, importId };
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

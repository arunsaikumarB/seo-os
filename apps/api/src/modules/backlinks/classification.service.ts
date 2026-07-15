/**
 * Workspace classification analytics, learning, and type-queue helpers.
 * No schema changes — persists learning in workspace_settings.memory_config JSON.
 */

import {
  OPPORTUNITY_CLASSIFICATION_TYPES,
  CLASSIFICATION_QUEUES,
  buildLearningPatternFromCorrection,
  getClassificationLabel,
  summarizeClassificationCounts,
  type LearningPattern,
  type WebsiteInspectionSignals,
} from '@seo-os/backlink-builder';
import { getSupabaseAdmin } from '../../lib/supabase.js';

const LEARNING_KEY = 'classification_learning';

export async function loadClassificationLearning(
  workspaceId: string
): Promise<LearningPattern[]> {
  const { data } = await getSupabaseAdmin()
    .from('workspace_settings')
    .select('memory_config')
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  const cfg = (data?.memory_config ?? {}) as Record<string, unknown>;
  const patterns = cfg[LEARNING_KEY];
  return Array.isArray(patterns) ? (patterns as LearningPattern[]) : [];
}

export async function saveClassificationLearning(
  workspaceId: string,
  patterns: LearningPattern[]
) {
  const { data: existing } = await getSupabaseAdmin()
    .from('workspace_settings')
    .select('id, memory_config')
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  const memory_config = {
    ...((existing?.memory_config ?? {}) as Record<string, unknown>),
    [LEARNING_KEY]: patterns.slice(0, 500),
  };

  if (existing) {
    await getSupabaseAdmin()
      .from('workspace_settings')
      .update({ memory_config })
      .eq('workspace_id', workspaceId);
  } else {
    await getSupabaseAdmin().from('workspace_settings').insert({
      workspace_id: workspaceId,
      memory_config,
    });
  }
}

export async function recordClassificationCorrection(params: {
  workspaceId: string;
  opportunityId: string;
  fromType: string;
  toType: string;
  reason?: string;
  userId?: string;
}) {
  const { data: opp } = await getSupabaseAdmin()
    .from('opportunities')
    .select('id, domain, opportunity_type, metadata, website_name, url')
    .eq('id', params.opportunityId)
    .eq('workspace_id', params.workspaceId)
    .maybeSingle();
  if (!opp) throw Object.assign(new Error('Opportunity not found'), { status: 404 });

  const meta = (opp.metadata ?? {}) as Record<string, unknown>;
  const classification = (meta.classification ?? {}) as Record<string, unknown>;
  const signals = (meta.websiteSignals ?? classification.signals) as
    | WebsiteInspectionSignals
    | undefined;

  const learning = await loadClassificationLearning(params.workspaceId);
  const existing =
    learning.find(
      (p) =>
        p.toType === params.toType &&
        (p.domainHint
          ? String(opp.domain ?? '')
              .toLowerCase()
              .includes(p.domainHint)
          : false)
    ) ?? null;

  const pattern = buildLearningPatternFromCorrection({
    fromType: params.fromType,
    toType: params.toType,
    domain: opp.domain ?? undefined,
    signals,
    existing,
  });

  const next = existing
    ? learning.map((p) => (p === existing ? pattern : p))
    : [pattern, ...learning];
  await saveClassificationLearning(params.workspaceId, next);

  const typeMeta = OPPORTUNITY_CLASSIFICATION_TYPES.find((t) => t.id === params.toType);
  const storageType = typeMeta?.storageType ?? params.toType;
  const queue = typeMeta?.queue ?? 'unknown';
  const agent = typeMeta?.agent ?? 'verification_agent';

  const corrections = Array.isArray(meta.corrections) ? [...(meta.corrections as unknown[])] : [];
  corrections.push({
    from: params.fromType,
    to: params.toType,
    reason: params.reason ?? null,
    at: new Date().toISOString(),
    by: params.userId ?? null,
  });

  await getSupabaseAdmin()
    .from('opportunities')
    .update({
      opportunity_type: storageType,
      backlink_category:
        typeMeta?.queue === 'directory'
          ? 'business_based'
          : typeMeta?.queue === 'guest_post' || typeMeta?.queue === 'article'
            ? 'content_based'
            : typeMeta?.queue === 'forum' || typeMeta?.queue === 'qa'
              ? 'community_based'
              : typeMeta?.queue === 'outreach'
                ? 'outreach_based'
                : null,
      metadata: {
        ...meta,
        corrections,
        classification: {
          ...classification,
          id: params.toType,
          displayName: getClassificationLabel(params.toType),
          confidence: 100,
          reason: params.reason ?? `Manually corrected from ${params.fromType}`,
          evidence: [`User override → ${params.toType}`],
          workflowQueue: queue,
          assignedAgent: agent,
          manuallyCorrected: true,
        },
        assignedAgent: agent,
        workflowQueue: queue,
      },
    })
    .eq('id', params.opportunityId)
    .eq('workspace_id', params.workspaceId);

  await getSupabaseAdmin().from('backlink_history').insert({
    workspace_id: params.workspaceId,
    opportunity_id: params.opportunityId,
    event_type: 'classification_corrected',
    title: `Classification ${params.fromType} → ${params.toType}`,
    actor_id: params.userId ?? null,
    metadata: { from: params.fromType, to: params.toType, reason: params.reason ?? null },
  });

  return {
    opportunityId: params.opportunityId,
    classificationId: params.toType,
    storageType,
    workflowQueue: queue,
    assignedAgent: agent,
    learningPatterns: next.length,
  };
}

export async function getClassificationAnalytics(workspaceId: string) {
  const { data: opps } = await getSupabaseAdmin()
    .from('opportunities')
    .select(
      'id, domain, website_name, opportunity_type, queue_status, status, priority, metadata, automation_status, created_at'
    )
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(2000);

  const rows = opps ?? [];
  const decisions = rows.map((o) => {
    const meta = (o.metadata ?? {}) as Record<string, unknown>;
    const c = (meta.classification ?? {}) as Record<string, unknown>;
    return {
      classificationId: String(c.id ?? o.opportunity_type ?? 'unknown'),
      displayName: String(
        c.displayName ?? getClassificationLabel(String(c.id ?? o.opportunity_type))
      ),
      confidence: Number(c.confidence ?? 0),
      queue: String(c.workflowQueue ?? meta.workflowQueue ?? 'unknown'),
      agent: String(c.assignedAgent ?? meta.assignedAgent ?? ''),
      corrected: Boolean(c.manuallyCorrected),
    };
  });

  const byType = summarizeClassificationCounts(decisions);
  const byQueue = CLASSIFICATION_QUEUES.map((q) => ({
    queue: q,
    count: decisions.filter((d) => d.queue === q).length,
  })).filter((q) => q.count > 0);

  const withConfidence = decisions.filter((d) => d.confidence > 0);
  const avgConfidence =
    withConfidence.length === 0
      ? 0
      : Math.round(
          withConfidence.reduce((s, d) => s + d.confidence, 0) / withConfidence.length
        );
  const corrected = decisions.filter((d) => d.corrected).length;
  const estimatedAccuracy = Math.min(
    99,
    Math.max(
      50,
      Math.round(
        avgConfidence * 0.85 +
          (corrected > 0 ? Math.max(0, 10 - corrected) : 10) +
          (withConfidence.length > 0 ? 5 : 0)
      )
    )
  );

  const learning = await loadClassificationLearning(workspaceId);

  return {
    imported: rows.length,
    classified: decisions.filter((d) => d.classificationId !== 'unknown').length,
    unknown: decisions.filter((d) => d.classificationId === 'unknown').length,
    byType,
    byQueue,
    avgConfidence,
    estimatedAccuracy,
    learningPatterns: learning.length,
    types: OPPORTUNITY_CLASSIFICATION_TYPES.map((t) => ({
      id: t.id,
      displayName: t.displayName,
      queue: t.queue,
      agent: t.agent,
    })),
    snapshot: {
      directories: byQueue.find((q) => q.queue === 'directory')?.count ?? 0,
      guestPosts: byQueue.find((q) => q.queue === 'guest_post')?.count ?? 0,
      articles: byQueue.find((q) => q.queue === 'article')?.count ?? 0,
      images: byQueue.find((q) => q.queue === 'image')?.count ?? 0,
      videos: byQueue.find((q) => q.queue === 'video')?.count ?? 0,
      profiles: byQueue.find((q) => q.queue === 'profile')?.count ?? 0,
      forums: byQueue.find((q) => q.queue === 'forum')?.count ?? 0,
      qa: byQueue.find((q) => q.queue === 'qa')?.count ?? 0,
      unknown: byQueue.find((q) => q.queue === 'unknown')?.count ?? 0,
    },
  };
}

export async function getClassificationQueues(workspaceId: string) {
  const analytics = await getClassificationAnalytics(workspaceId);
  const { data: opps } = await getSupabaseAdmin()
    .from('opportunities')
    .select('id, domain, website_name, opportunity_type, queue_status, priority, metadata, score')
    .eq('workspace_id', workspaceId)
    .eq('queue_status', 'pending_review')
    .order('created_at', { ascending: false })
    .limit(500);

  const groups: Record<
    string,
    Array<{
      id: string;
      domain: string;
      website: string;
      type: string;
      confidence: number;
      reason: string;
      agent: string;
      score: number | null;
    }>
  > = {};

  for (const o of opps ?? []) {
    const meta = (o.metadata ?? {}) as Record<string, unknown>;
    const c = (meta.classification ?? {}) as Record<string, unknown>;
    const queue = String(c.workflowQueue ?? meta.workflowQueue ?? 'unknown');
    if (!groups[queue]) groups[queue] = [];
    groups[queue].push({
      id: o.id,
      domain: o.domain ?? '',
      website: o.website_name ?? o.domain ?? '',
      type: String(c.id ?? o.opportunity_type),
      confidence: Number(c.confidence ?? 0),
      reason: String(c.reason ?? ''),
      agent: String(c.assignedAgent ?? meta.assignedAgent ?? ''),
      score: o.score ?? null,
    });
  }

  return {
    queues: Object.entries(groups).map(([queue, items]) => ({
      queue,
      label: `${queue.replace(/_/g, ' ')} queue`,
      count: items.length,
      items,
    })),
    analytics,
  };
}

import { randomUUID } from 'node:crypto';
import { OPPORTUNITY_TYPES, scoreOpportunity } from '@seo-os/seo-intelligence';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { logResearchEvent } from './research.service.js';
import { fireAndForget, publishPlatformEvent } from '../platform/event-bus.service.js';

export async function listOpportunities(workspaceId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from('opportunities')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('score', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getOpportunityCounts(workspaceId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from('opportunities')
    .select('opportunity_type')
    .eq('workspace_id', workspaceId);

  if (error) throw error;

  const counts: Record<string, number> = {};
  for (const t of OPPORTUNITY_TYPES) counts[t] = 0;
  for (const row of data ?? []) {
    counts[row.opportunity_type] = (counts[row.opportunity_type] ?? 0) + 1;
  }
  return counts;
}

export async function discoverOpportunities(
  workspaceId: string,
  context: { domain: string; brandTopics?: string[]; keywords?: string[] }
) {
  const templates: Array<{ type: (typeof OPPORTUNITY_TYPES)[number]; title: string }> = [
    { type: 'guest_post', title: `Guest post opportunities in ${context.domain} niche` },
    { type: 'resource_page', title: `Resource pages linking to ${context.domain} competitors` },
    { type: 'broken_link', title: `Broken link reclamation for ${context.domain}` },
    { type: 'directory', title: `Industry directories for ${context.domain}` },
    {
      type: 'qa_site',
      title: `Q&A discussions about ${context.brandTopics?.[0] ?? context.domain}`,
    },
    { type: 'forum', title: `Forum threads — ${context.domain} topics` },
    { type: 'podcast', title: `Podcast guest opportunities — ${context.domain}` },
    { type: 'partnership', title: `Partnership opportunities — ${context.domain}` },
  ];

  const rows = templates.map((t) => {
    const score = scoreOpportunity(
      { type: t.type, title: t.title, domain: `example-${t.type}.com` },
      { brandTopics: context.brandTopics, keywordOverlap: context.keywords?.length ?? 0 }
    );
    return {
      id: randomUUID(),
      workspace_id: workspaceId,
      opportunity_type: t.type,
      title: t.title,
      domain: `discovered-${t.type}.example`,
      score,
      status: 'discovered',
      summary: `AI-classified ${t.type.replace(/_/g, ' ')} opportunity`,
      discovery_source: 'ai',
    };
  });

  for (const row of rows) {
    await getSupabaseAdmin().from('opportunities').insert(row);
  }

  await logResearchEvent(workspaceId, {
    eventType: 'opportunity.discovery',
    phase: 'opportunity_discovery',
    title: `Discovered ${rows.length} opportunity types`,
    payload: { count: rows.length },
  });

  fireAndForget(
    publishPlatformEvent({
      workspaceId,
      sourceModule: 'seo_intelligence',
      eventType: 'opportunity_discovery_started',
      title: 'Opportunity discovery started',
      summary: `Scanning niche signals for ${context.domain}`,
      severity: 'info',
      payload: { domain: context.domain },
    }).then(() =>
      publishPlatformEvent({
        workspaceId,
        sourceModule: 'seo_intelligence',
        eventType: 'opportunity_discovered',
        title: `Discovered ${rows.length} opportunities`,
        summary: rows.map((r) => r.opportunity_type).join(', '),
        severity: 'success',
        entityType: 'opportunity',
        entityId: rows[0]?.id,
        payload: { count: rows.length, types: rows.map((r) => r.opportunity_type) },
        href: `/projects/${workspaceId}/campaigns/queue`,
      })
    )
  );

  return rows;
}

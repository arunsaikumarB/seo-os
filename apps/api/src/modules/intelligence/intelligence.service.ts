import { getProjectById } from '../projects/project.service.js';
import { startWebsiteScan, listScans, getScan } from './website-scan.service.js';
import { discoverCompetitors } from './competitor.service.js';
import { discoverKeywords } from './keyword.service.js';
import { discoverOpportunities } from './opportunity.service.js';
import { createProspectFromOpportunity, listProspects } from './prospect.service.js';
import { listResearchEvents } from './research.service.js';
import { getOpportunityCounts } from './opportunity.service.js';
import { logResearchEvent } from './research.service.js';
import { getSupabaseAdmin } from '../../lib/supabase.js';

export async function runFullDiscovery(workspaceId: string, orgId: string, userId: string) {
  const project = await getProjectById(workspaceId, orgId);
  if (!project) throw new Error('Project not found');

  const targetUrl = project.url ?? `https://${project.domain}`;

  await logResearchEvent(workspaceId, {
    eventType: 'discovery.started',
    title: 'SEO Intelligence discovery started',
    payload: { targetUrl },
  });

  const scan = await startWebsiteScan(workspaceId, userId, targetUrl);

  const latestScan = await getScan(scan.id as string, workspaceId);
  const brandTopics =
    (latestScan?.brand_profile as { primaryTopics?: string[] })?.primaryTopics ?? [];

  await discoverCompetitors(workspaceId, {
    domain: project.domain,
    industry: project.industry ?? undefined,
    brandTopics,
  });

  const kwResult = await discoverKeywords(workspaceId, {
    domain: project.domain,
    industry: project.industry ?? undefined,
    brandTopics,
  });

  const { data: keywords } = await getSupabaseAdmin()
    .from('keywords')
    .select('keyword')
    .eq('workspace_id', workspaceId)
    .limit(20);

  const opportunities = await discoverOpportunities(workspaceId, {
    domain: project.domain,
    brandTopics,
    keywords: (keywords ?? []).map((k) => k.keyword),
  });

  for (const opp of opportunities.slice(0, 3)) {
    await createProspectFromOpportunity(workspaceId, opp.id as string);
  }

  await logResearchEvent(workspaceId, {
    eventType: 'discovery.completed',
    title: 'SEO Intelligence discovery complete',
    payload: { scanId: scan.id, keywords: kwResult.keywords },
  });

  return { scanId: scan.id, keywords: kwResult, opportunities: opportunities.length };
}

export async function getIntelligenceSummary(workspaceId: string) {
  const [scans, events, opportunityCounts, prospects, keywords] = await Promise.all([
    listScans(workspaceId),
    listResearchEvents(workspaceId, 15),
    getOpportunityCounts(workspaceId),
    listProspects(workspaceId),
    getSupabaseAdmin()
      .from('keywords')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId),
  ]);

  const latestScan = scans[0];
  const pipelineCounts = {
    discovered: 0,
    qualified: 0,
    approved: 0,
    outreach_ready: 0,
    won: 0,
    lost: 0,
  };
  for (const p of prospects) {
    const s = p.pipeline_status as keyof typeof pipelineCounts;
    if (s in pipelineCounts) pipelineCounts[s] += 1;
  }

  return {
    websiteScanner: {
      status: latestScan?.status ?? 'none',
      phase: latestScan?.phase ?? 'init',
      pagesAnalyzed: latestScan?.pages_analyzed ?? 0,
      pagesDiscovered: latestScan?.pages_discovered ?? 0,
    },
    researchProgress: {
      eventsTotal: events.length,
      latestPhase: latestScan?.phase ?? 'pending',
    },
    discovery: {
      keywordCount: keywords.count ?? 0,
      opportunityCounts,
      prospectTotal: prospects.length,
      pipelineCounts,
    },
    timeline: events,
  };
}

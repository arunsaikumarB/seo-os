import { DEFAULT_FEATURE_FLAGS, FEATURE_FLAGS, type FeatureFlag } from '@seo-os/shared';
import { getAIRuntime } from './runtime.js';
import { getBoss, QUEUES } from '../../jobs/boss.js';
import { getEnv } from '../../config/env.js';
import { getKnowledgeStats } from '../knowledge/document.service.js';
import { listMemory } from '../memory/memory.service.js';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { getIntelligenceSummary } from '../intelligence/intelligence.service.js';
import { getCampaignSummary, listCampaigns } from '../campaigns/campaign.service.js';
import { getBacklinkDashboard } from '../backlinks/backlink-builder.service.js';
import { getAutomationSummary } from '../backlinks/automation.service.js';
import { getBrowserIntelligenceSummary } from '../intelligence/browser-intelligence.service.js';
import { getRelationshipSummary } from '../relationships/relationship-intelligence.service.js';
import { getOutreachSummary } from '../outreach/outreach.service.js';
import { getWorkflowSummary } from '../workflows/workflow.service.js';
import { getPendingApprovalCount } from '../campaigns/approval.service.js';
import { getTechnicalSummary } from '../technical-seo/technical-seo.service.js';
import { getIntegrationsSummary } from '../integrations/integrations.service.js';
import { listAgentRuns } from './agent.service.js';

export function getFeatureFlags(overrides?: Partial<Record<FeatureFlag, boolean>>) {
  return FEATURE_FLAGS.reduce(
    (acc, flag) => {
      acc[flag] = overrides?.[flag] ?? DEFAULT_FEATURE_FLAGS[flag];
      return acc;
    },
    {} as Record<FeatureFlag, boolean>
  );
}

export async function getProviderStatus() {
  const rt = getAIRuntime();
  const status = rt.providers.getStatus();
  const health = await rt.providers.getAIHealth();
  return { status, health, mode: getEnv().PROVIDER_MODE };
}

export async function getQueueStatus() {
  const env = getEnv();
  const boss = await getBoss();

  if (!boss || !env.ENABLE_WORKERS) {
    return {
      enabled: false,
      queues: Object.values(QUEUES).map((name) => ({
        name,
        pending: 0,
        active: 0,
      })),
    };
  }

  const queues = await Promise.all(
    Object.values(QUEUES).map(async (name) => {
      try {
        const size = await boss.getQueueSize(name);
        return { name, pending: size, active: 0 };
      } catch {
        return { name, pending: 0, active: 0 };
      }
    })
  );

  return { enabled: true, queues };
}

export async function getMissionControlSummary(workspaceId: string) {
  const [
    knowledge,
    memory,
    runs,
    conversations,
    intelligence,
    campaigns,
    pendingApprovals,
    backlinkBuilder,
    automation,
    browserIntelligence,
    relationshipIntelligence,
    outreach,
    workflows,
    technicalSeo,
    integrations,
  ] = await Promise.all([
    getKnowledgeStats(workspaceId),
    listMemory(workspaceId),
    listAgentRuns(workspaceId, 10),
    getSupabaseAdmin()
      .from('ai_conversations')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId),
    getIntelligenceSummary(workspaceId),
    getCampaignSummary(workspaceId),
    getPendingApprovalCount(workspaceId),
    getBacklinkDashboard(workspaceId),
    getAutomationSummary(workspaceId),
    getBrowserIntelligenceSummary(workspaceId),
    getRelationshipSummary(workspaceId),
    getOutreachSummary(workspaceId),
    getWorkflowSummary(workspaceId),
    getTechnicalSummary(workspaceId).catch(() => null),
    getIntegrationsSummary(workspaceId).catch(() => null),
  ]);

  const activeCampaigns = await listCampaigns(workspaceId);
  const campaignTimeline = await getSupabaseAdmin()
    .from('campaign_timeline_events')
    .select('title, event_type, created_at, campaign_id')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(8);

  const rt = getAIRuntime();
  const agents = rt.registry.listSprint2Agents();
  const activeRuns = runs.filter((r) => r.status === 'running' || r.status === 'queued').length;
  const completedRuns = runs.filter((r) => r.status === 'completed').length;

  const { getWorkforceStrip, getQueueBoard } = await import('../backlinks/v11.service.js');
  const { getStatistics: getBeeStatistics } = await import('../browser-execution/bee.service.js');
  const { getImageStatistics } = await import('../image-intelligence/iie.service.js');
  const { getProviderHealthSnapshot } = await import('../providers/pif.service.js');
  const { getEnterpriseHealthSnapshot } = await import('../../routes/health.js');
  const { getClassificationAnalytics } = await import('../backlinks/classification.service.js');
  const { getContentIntelligenceAnalytics } = await import(
    '../backlinks/content-intelligence.service.js'
  );
  const [
    workforceStrip,
    queueBoard,
    browserExecution,
    imageIntelligence,
    providerFramework,
    enterpriseHealth,
    opportunityClassification,
    contentIntelligence,
  ] = await Promise.all([
    getWorkforceStrip(workspaceId).catch(() => null),
    getQueueBoard(workspaceId, 'kanban').catch(() => null),
    getBeeStatistics(workspaceId).catch(() => null),
    getImageStatistics(workspaceId).catch(() => null),
    getProviderHealthSnapshot(workspaceId).catch(() => null),
    getEnterpriseHealthSnapshot().catch(() => null),
    getClassificationAnalytics(workspaceId).catch(() => null),
    getContentIntelligenceAnalytics(workspaceId).catch(() => null),
  ]);

  const stageCounts: Record<string, number> = {};
  for (const [stage, items] of Object.entries(queueBoard?.columns ?? {})) {
    stageCounts[stage] = (items as unknown[]).length;
  }

  return {
    knowledge,
    memory: {
      entries: memory.entries.length,
      facts: memory.facts.length,
    },
    conversations: conversations.count ?? 0,
    workforce: {
      registered: agents.length,
      activeRuns,
      completedRuns,
      recentRuns: runs,
      strip: workforceStrip,
    },
    campaignOps: stageCounts,
    browserExecution,
    imageIntelligence,
    opportunityClassification,
    contentIntelligence,
    providerFramework,
    enterpriseHealth,
    intelligence,
    campaigns: {
      ...campaigns,
      pendingApprovals,
      recent: activeCampaigns.slice(0, 5),
      timeline: campaignTimeline.data ?? [],
    },
    backlinkBuilder,
    automation,
    browserIntelligence,
    relationshipIntelligence,
    outreach,
    workflows,
    technicalSeo,
    integrations,
  };
}

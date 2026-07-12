import {
  ANALYTICS_DASHBOARD_KEYS,
  buildForecasts,
  bucketDailyTrend,
  estimateAutomationHoursSaved,
  generateInsights,
  toNamedPercents,
  type AnalyticsDashboardKey,
  type AnalyticsInsight,
  type AnalyticsForecast,
  type KpiCard,
  type NamedCount,
  type FunnelStep,
  type TrendPoint,
} from '@seo-os/analytics-engine';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { getBacklinkDashboard } from '../backlinks/backlink-builder.service.js';
import { getCampaignSummary, listCampaigns } from '../campaigns/campaign.service.js';
import { getOutreachSummary } from '../outreach/outreach.service.js';
import { getWorkflowSummary } from '../workflows/workflow.service.js';
import { getRelationshipSummary } from '../relationships/relationship-intelligence.service.js';
import { getIntelligenceSummary } from '../intelligence/intelligence.service.js';
import { getBrowserIntelligenceSummary } from '../intelligence/browser-intelligence.service.js';
import { getKnowledgeStats } from '../knowledge/document.service.js';
import { listMemory } from '../memory/memory.service.js';
import { listAgentRuns } from '../ai/agent.service.js';
import { getPendingApprovalCount } from '../campaigns/approval.service.js';
import { getQueueStatus } from '../ai/infra.service.js';
import { logger } from '../../lib/logger.js';

export type AnalyticsOverview = {
  kpis: KpiCard[];
  growth: {
    today: Record<string, number>;
    weekly: TrendPoint[];
    monthly: TrendPoint[];
  };
  insights: AnalyticsInsight[];
  forecasts: AnalyticsForecast[];
  dashboards: AnalyticsDashboardKey[];
};

export async function getBacklinkAnalytics(workspaceId: string) {
  const [dashboard, backlinks, opps] = await Promise.all([
    getBacklinkDashboard(workspaceId),
    getSupabaseAdmin()
      .from('backlinks')
      .select('verification_status, da_score, domain, backlink_type, created_at')
      .eq('workspace_id', workspaceId),
    getSupabaseAdmin()
      .from('opportunities')
      .select('opportunity_type, score, domain, pipeline_stage, country, industry')
      .eq('workspace_id', workspaceId),
  ]);

  const bl = backlinks.data ?? [];
  const opportunities = opps.data ?? [];
  const daVals = bl.map((b) => Number(b.da_score ?? 0)).filter((v) => v > 0);
  const scores = opportunities.map((o) => Number(o.score ?? 0)).filter((v) => v > 0);

  const typeMap = new Map<string, { won: number; total: number }>();
  for (const o of opportunities) {
    const t = String(o.opportunity_type ?? 'other');
    const cur = typeMap.get(t) ?? { won: 0, total: 0 };
    cur.total += 1;
    if (['won', 'verified'].includes(String(o.pipeline_stage))) cur.won += 1;
    typeMap.set(t, cur);
  }
  const byType: NamedCount[] = toNamedPercents(
    [...typeMap.entries()].map(([name, v]) => ({ name, value: v.total }))
  );

  const guest = typeMap.get('guest_post');
  const directory = typeMap.get('directory');
  const guestPostSuccessRate = guest && guest.total ? Math.round((guest.won / guest.total) * 100) : undefined;
  const directorySuccessRate =
    directory && directory.total ? Math.round((directory.won / directory.total) * 100) : undefined;

  const domainCounts = new Map<string, number>();
  for (const b of bl) {
    const d = String(b.domain ?? 'unknown');
    domainCounts.set(d, (domainCounts.get(d) ?? 0) + 1);
  }
  const topDomains = [...domainCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, value]) => ({ name, value }));

  const industryCounts = new Map<string, number>();
  for (const o of opportunities) {
    const ind = String(o.industry ?? 'unspecified');
    industryCounts.set(ind, (industryCounts.get(ind) ?? 0) + 1);
  }
  const topIndustries = [...industryCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, value]) => ({ name, value }));

  const countryCounts = new Map<string, number>();
  for (const o of opportunities) {
    const c = String(o.country ?? 'unknown');
    countryCounts.set(c, (countryCounts.get(c) ?? 0) + 1);
  }
  const topCountries = [...countryCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, value]) => ({ name, value }));

  const growthTrend = bucketDailyTrend(
    bl.map((b) => b.created_at as string | undefined),
    30
  );

  return {
    totalBacklinks: bl.length,
    won: dashboard.won,
    lost: dashboard.lost,
    pending: dashboard.pending,
    verified: dashboard.verified,
    avgAuthority: daVals.length
      ? Math.round(daVals.reduce((a, b) => a + b, 0) / daVals.length)
      : dashboard.avgDomainRating,
    avgOpportunityScore: scores.length
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 0,
    successRate: dashboard.successRate,
    byType,
    topDomains,
    topIndustries,
    topCountries,
    growthTrend,
    guestPostSuccessRate,
    directorySuccessRate,
    funnel: [
      { name: 'Discovered', value: dashboard.discovered },
      { name: 'Qualified', value: dashboard.qualified },
      { name: 'Outreach', value: dashboard.outreach_running },
      { name: 'Won', value: dashboard.won },
      { name: 'Verified', value: dashboard.verified },
    ] as FunnelStep[],
  };
}

export async function getCampaignAnalytics(workspaceId: string) {
  const [summary, campaigns, approvals, opps] = await Promise.all([
    getCampaignSummary(workspaceId),
    listCampaigns(workspaceId),
    getSupabaseAdmin()
      .from('approvals')
      .select('status, created_at, reviewed_at')
      .eq('workspace_id', workspaceId),
    getSupabaseAdmin()
      .from('opportunities')
      .select('status, pipeline_stage')
      .eq('workspace_id', workspaceId),
  ]);

  const approvalRows = approvals.data ?? [];
  const approved = approvalRows.filter((a) => a.status === 'approved').length;
  const rejected = approvalRows.filter((a) => a.status === 'rejected').length;
  const approvalRate =
    approved + rejected > 0 ? Math.round((approved / (approved + rejected)) * 100) : 0;

  const completed = campaigns.filter((c) => c.status === 'completed').length;
  const active = campaigns.filter((c) => c.status === 'active').length;
  const successRate =
    campaigns.length > 0
      ? Math.round(((completed + active) / campaigns.length) * 100)
      : 0;

  const converted = (opps.data ?? []).filter((o) =>
    ['won', 'verified', 'converted'].includes(String(o.pipeline_stage ?? o.status))
  ).length;

  const durations: number[] = [];
  for (const c of campaigns) {
    const start = c.started_at ? new Date(String(c.started_at)).getTime() : null;
    const end = c.completed_at
      ? new Date(String(c.completed_at)).getTime()
      : c.status === 'active'
        ? Date.now()
        : null;
    if (start && end && end >= start) durations.push((end - start) / (1000 * 60 * 60 * 24));
  }
  const avgDurationDays =
    durations.length > 0
      ? Math.round((durations.reduce((a, b) => a + b, 0) / durations.length) * 10) / 10
      : 0;

  const sorted = [...campaigns].sort((a, b) => Number(b.progress ?? 0) - Number(a.progress ?? 0));
  const campaignAProgress = Number(sorted[0]?.progress ?? 0);
  const campaignBProgress = Number(sorted[1]?.progress ?? 0);

  const estimatedRoi =
    Math.round(successRate * 0.6 + converted * 2 + summary.avgProgress * 0.3);

  return {
    total: summary.total,
    active: summary.active,
    pendingApproval: summary.pendingApproval,
    successRate,
    opportunitiesConverted: converted,
    approvalRate,
    executionRate: summary.avgProgress,
    completionRate:
      campaigns.length > 0 ? Math.round((completed / campaigns.length) * 100) : 0,
    estimatedRoi,
    avgDurationDays,
    campaignAProgress,
    campaignBProgress,
    byStatus: toNamedPercents(
      Object.entries(
        campaigns.reduce(
          (acc, c) => {
            const s = String(c.status ?? 'draft');
            acc[s] = (acc[s] ?? 0) + 1;
            return acc;
          },
          {} as Record<string, number>
        )
      ).map(([name, value]) => ({ name, value: Number(value) }))
    ),
    progressTrend: bucketDailyTrend(
      campaigns.map((c) => (c.created_at ?? c.started_at) as string | undefined),
      14
    ),
  };
}

export async function getOutreachAnalytics(workspaceId: string) {
  const [summary, messages, approvals] = await Promise.all([
    getOutreachSummary(workspaceId),
    getSupabaseAdmin()
      .from('outreach_messages')
      .select('status, direction, created_at, sent_at')
      .eq('workspace_id', workspaceId),
    getSupabaseAdmin()
      .from('approvals')
      .select('status, approval_type')
      .eq('workspace_id', workspaceId)
      .in('approval_type', ['outreach_send', 'email_draft']),
  ]);

  const msgs = messages.data ?? [];
  const outreachApprovals = approvals.data ?? [];
  const appr = outreachApprovals.filter((a) => a.status === 'approved').length;
  const rej = outreachApprovals.filter((a) => a.status === 'rejected').length;
  const approvalRate = appr + rej > 0 ? Math.round((appr / (appr + rej)) * 100) : 0;

  const positiveReplies = msgs.filter(
    (m) => m.direction === 'inbound' && ['replied', 'positive', 'interested'].includes(String(m.status))
  ).length;
  const guestPostsAccepted = 0;
  const negotiations = msgs.filter(
    (m) => m.direction === 'inbound' && String(m.status) === 'negotiating'
  ).length;
  const conversionRate =
    summary.emailsSent > 0
      ? Math.round((positiveReplies / summary.emailsSent) * 1000) / 10
      : 0;

  const responseTimes: number[] = [];
  for (const m of msgs) {
    if (m.sent_at && m.created_at) {
      const hours =
        (new Date(String(m.sent_at)).getTime() - new Date(String(m.created_at)).getTime()) /
        (1000 * 60 * 60);
      if (hours >= 0 && hours < 720) responseTimes.push(hours);
    }
  }
  const avgResponseTimeHours =
    responseTimes.length > 0
      ? Math.round((responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length) * 10) / 10
      : 0;

  return {
    emailsSent: summary.emailsSent,
    approvalRate,
    openRate: summary.openRate,
    replyRate: summary.replyRate,
    positiveReplies,
    guestPostsAccepted,
    negotiations,
    conversionRate,
    avgResponseTimeHours,
    priorReplyRate: undefined,
    deliverability: summary.deliverability,
    sendTrend: bucketDailyTrend(
      msgs.map((m) => (m.sent_at ?? m.created_at) as string | undefined),
      21
    ),
  };
}

export async function getWorkflowAnalytics(workspaceId: string) {
  const summary = await getWorkflowSummary(workspaceId);
  const { data: runs } = await getSupabaseAdmin()
    .from('workflow_runs')
    .select('status, started_at, completed_at, created_at')
    .eq('workspace_id', workspaceId);

  const runRows = runs ?? [];
  const completed = runRows.filter((r) => r.status === 'completed');
  const failed = runRows.filter((r) => r.status === 'failed').length;
  const runtimes: number[] = [];
  for (const r of completed) {
    const start = new Date(String(r.started_at ?? r.created_at)).getTime();
    const end = new Date(String(r.completed_at ?? r.created_at)).getTime();
    if (end >= start) runtimes.push((end - start) / 1000);
  }
  const avgRuntimeSec =
    runtimes.length > 0
      ? Math.round(runtimes.reduce((a, b) => a + b, 0) / runtimes.length)
      : 0;

  const timeSavedHours = Math.round(completed.length * 0.4);

  return {
    executed: runRows.length,
    avgRuntimeSec,
    successRate: summary.automationSuccessRate ?? 0,
    failures: failed,
    retries: failed,
    approvals: summary.pendingApprovals ?? 0,
    automationTimeSavedHours: timeSavedHours,
    activeWorkflows: summary.activeDefinitions ?? 0,
    runTrend: bucketDailyTrend(
      runRows.map((r) => r.created_at as string | undefined),
      14
    ),
  };
}

export async function getAiAnalytics(workspaceId: string) {
  const [runs, ledger] = await Promise.all([
    listAgentRuns(workspaceId, 200),
    getSupabaseAdmin()
      .from('ai_usage_ledger')
      .select('total_tokens, input_tokens, output_tokens, agent_type, created_at')
      .eq('workspace_id', workspaceId)
      .limit(500),
  ]);

  const completed = runs.filter((r) => r.status === 'completed');
  const failed = runs.filter((r) => r.status === 'failed');
  const byAgent = new Map<string, number>();
  for (const r of completed) {
    const t = String((r as { agent_type?: string }).agent_type ?? 'unknown');
    byAgent.set(t, (byAgent.get(t) ?? 0) + 1);
  }
  const topAgents = [...byAgent.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, value]) => ({ name, value }));

  const tokens = (ledger.data ?? []).reduce(
    (s, row) => s + Number(row.total_tokens ?? 0),
    0
  );

  const responseTimes = completed
    .map((r) => {
      const row = r as { completed_at?: string; created_at?: string };
      if (!row.completed_at || !row.created_at) return null;
      return (
        (new Date(row.completed_at).getTime() - new Date(row.created_at).getTime()) / 1000
      );
    })
    .filter((n): n is number => n != null && n >= 0);

  const avgResponseTimeSec =
    responseTimes.length > 0
      ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
      : 0;

  const hoursSaved = estimateAutomationHoursSaved({
    completedAgentRuns: completed.length,
    completedWorkflowRuns: 0,
    emailsSent: 0,
  });

  return {
    tasksCompleted: completed.length,
    tasksFailed: failed.length,
    agentUtilization:
      runs.length > 0 ? Math.round((completed.length / runs.length) * 100) : 0,
    avgResponseTimeSec,
    tokensUsed: tokens,
    estimatedHoursSaved: hoursSaved,
    topAgents,
    recommendationAccuracy:
      completed.length > 0
        ? Math.round((completed.length / Math.max(1, completed.length + failed.length)) * 100)
        : 0,
    runTrend: bucketDailyTrend(
      completed.map((r) => (r as { created_at?: string }).created_at),
      21
    ),
  };
}

export async function getRelationshipAnalytics(workspaceId: string) {
  const summary = await getRelationshipSummary(workspaceId);
  const { data: orgs } = await getSupabaseAdmin()
    .from('relationship_organizations')
    .select('relationship_score, warmth, industry, backlinks_won, created_at')
    .eq('workspace_id', workspaceId);

  const rows = orgs ?? [];
  const improved = rows.filter((o) => Number(o.relationship_score ?? 0) >= 60).length;
  const avgHealth =
    rows.length > 0
      ? Math.round(
          rows.reduce((s, o) => s + Number(o.relationship_score ?? 0), 0) / rows.length
        )
      : summary.relationshipHealth ?? 0;

  return {
    totalOrganizations: rows.length,
    totalContacts: summary.contactsDiscovered ?? 0,
    avgHealth,
    improved,
    backlinksFromRelationships: rows.reduce((s, o) => s + Number(o.backlinks_won ?? 0), 0),
    byStatus: toNamedPercents(
      Object.entries(
        rows.reduce(
          (acc, o) => {
            const s = String(o.warmth ?? 'cold');
            acc[s] = (acc[s] ?? 0) + 1;
            return acc;
          },
          {} as Record<string, number>
        )
      ).map(([name, value]) => ({ name, value }))
    ),
    growthTrend: bucketDailyTrend(
      rows.map((o) => o.created_at as string | undefined),
      30
    ),
  };
}

export async function getSeoAnalytics(workspaceId: string) {
  const [intel, browser, knowledge, memory, opps] = await Promise.all([
    getIntelligenceSummary(workspaceId),
    getBrowserIntelligenceSummary(workspaceId),
    getKnowledgeStats(workspaceId),
    listMemory(workspaceId),
    getSupabaseAdmin()
      .from('opportunities')
      .select('created_at')
      .eq('workspace_id', workspaceId),
  ]);

  return {
    keywords: intel?.discovery?.keywordCount ?? 0,
    prospects: intel?.discovery?.prospectTotal ?? 0,
    opportunities: Object.values(intel?.discovery?.opportunityCounts ?? {}).reduce(
      (a: number, b) => a + Number(b),
      0
    ),
    scansCompleted: browser?.websitesScanned ?? 0,
    pagesAnalyzed: browser?.pagesRead ?? 0,
    knowledgeDocuments: knowledge.readyDocuments ?? 0,
    memoryFacts: memory.facts?.length ?? 0,
    opportunityTrend: bucketDailyTrend(
      (opps.data ?? []).map((o) => o.created_at as string | undefined),
      21
    ),
  };
}

export async function getTeamAnalytics(workspaceId: string) {
  const pendingApprovals = await getPendingApprovalCount(workspaceId);
  const { data: audits } = await getSupabaseAdmin()
    .from('audit_logs')
    .select('actor_id, actor_type, action, created_at')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(200);

  const rows = audits ?? [];
  const byActor = new Map<string, number>();
  for (const a of rows) {
    const key = String(a.actor_type ?? 'user');
    byActor.set(key, (byActor.get(key) ?? 0) + 1);
  }

  return {
    pendingApprovals,
    recentActions: rows.length,
    actionsByActor: toNamedPercents(
      [...byActor.entries()].map(([name, value]) => ({ name, value }))
    ),
    activityTrend: bucketDailyTrend(
      rows.map((a) => a.created_at as string | undefined),
      14
    ),
  };
}

export async function getSystemAnalytics(workspaceId: string) {
  const [queue, events, knowledge] = await Promise.all([
    getQueueStatus(),
    getSupabaseAdmin()
      .from('platform_events')
      .select('severity, created_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(100),
    getKnowledgeStats(workspaceId),
  ]);

  const ev = events.data ?? [];
  const failures = ev.filter((e) => e.severity === 'failure').length;

  return {
    queueEnabled: queue.enabled,
    queues: queue.queues,
    recentEvents: ev.length,
    failureEvents: failures,
    knowledgeChunks: knowledge.totalChunks ?? 0,
    eventTrend: bucketDailyTrend(
      ev.map((e) => e.created_at as string | undefined),
      14
    ),
  };
}

export async function getAnalyticsOverview(
  workspaceId: string,
  opts: { persistInsights?: boolean } = {}
): Promise<AnalyticsOverview> {
  const persistInsights = opts.persistInsights !== false;
  const [backlinks, campaigns, outreach, workflows, ai, relationships, seo] =
    await Promise.all([
      getBacklinkAnalytics(workspaceId),
      getCampaignAnalytics(workspaceId),
      getOutreachAnalytics(workspaceId),
      getWorkflowAnalytics(workspaceId),
      getAiAnalytics(workspaceId),
      getRelationshipAnalytics(workspaceId),
      getSeoAnalytics(workspaceId),
    ]);

  const hoursSaved = estimateAutomationHoursSaved({
    completedAgentRuns: ai.tasksCompleted,
    completedWorkflowRuns: Math.round(workflows.executed * (workflows.successRate / 100)),
    emailsSent: outreach.emailsSent,
  });

  const insights = generateInsights({
    backlinkSuccessRate: backlinks.successRate,
    guestPostSuccessRate: backlinks.guestPostSuccessRate,
    directorySuccessRate: backlinks.directorySuccessRate,
    campaignAProgress: campaigns.campaignAProgress,
    campaignBProgress: campaigns.campaignBProgress,
    replyRate: outreach.replyRate,
    priorReplyRate: outreach.priorReplyRate,
    relationshipsImproved: relationships.improved,
    workflowSuccessRate: workflows.successRate,
    aiHoursSaved: hoursSaved,
  });

  const forecasts = buildForecasts({
    backlinksWon: backlinks.won,
    replies: outreach.replyRate > 0 ? Math.round(outreach.emailsSent * (outreach.replyRate / 100)) : 0,
    campaignsActive: campaigns.active,
    campaignsCompleted: Math.round((campaigns.completionRate / 100) * campaigns.total),
    relationships: relationships.totalOrganizations,
    aiHoursSaved: hoursSaved,
  });

  // Persist insight cache (best-effort) — only on explicit overview/insights fetches
  if (persistInsights) {
    try {
      if (insights.length) {
        await getSupabaseAdmin().from('analytics_insights').insert(
          insights.map((i) => ({
            workspace_id: workspaceId,
            category: i.category,
            severity: i.severity,
            title: i.title,
            body: i.body,
            recommendation: i.recommendation ?? null,
            metric_delta_pct: i.metricDeltaPct ?? null,
            payload: {},
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          }))
        );
      }
    } catch (err) {
      logger.warn({ err }, 'analytics_insights cache insert skipped');
    }
  }

  const kpis: KpiCard[] = [
    {
      key: 'backlinks_won',
      label: 'Backlinks Won',
      value: backlinks.won,
      trend: backlinks.won > 0 ? 'up' : 'flat',
    },
    {
      key: 'campaign_success',
      label: 'Campaign Success',
      value: campaigns.successRate,
      unit: '%',
      trend: campaigns.successRate >= 50 ? 'up' : 'flat',
    },
    {
      key: 'workflow_success',
      label: 'Workflow Success',
      value: workflows.successRate,
      unit: '%',
      trend: workflows.successRate >= 70 ? 'up' : workflows.successRate > 0 ? 'down' : 'flat',
    },
    {
      key: 'ai_productivity',
      label: 'Est. AI Hours Saved',
      value: hoursSaved,
      unit: 'h',
      trend: hoursSaved > 0 ? 'up' : 'flat',
    },
    {
      key: 'reply_rate',
      label: 'Reply Rate',
      value: outreach.replyRate,
      unit: '%',
      trend: outreach.replyRate > 0 ? 'up' : 'flat',
    },
    {
      key: 'relationship_health',
      label: 'Relationship Health',
      value: relationships.avgHealth,
      unit: '/100',
      trend: relationships.avgHealth >= 50 ? 'up' : 'flat',
    },
    {
      key: 'opportunities',
      label: 'Opportunities',
      value: Number(seo.opportunities),
      trend: Number(seo.opportunities) > 0 ? 'up' : 'flat',
    },
    {
      key: 'roi_index',
      label: 'Projected ROI Index',
      value: forecasts.find((f) => f.metric === 'projected_roi_index')?.current ?? 0,
      trend: 'flat',
    },
  ];

  return {
    kpis,
    growth: {
      today: {
        backlinksWon: backlinks.won,
        emailsSent: outreach.emailsSent,
        workflowsRun: workflows.executed,
        aiTasks: ai.tasksCompleted,
      },
      weekly: backlinks.growthTrend.slice(-7),
      monthly: backlinks.growthTrend,
    },
    insights,
    forecasts,
    dashboards: [...ANALYTICS_DASHBOARD_KEYS],
  };
}

export async function getAnalyticsDashboard(workspaceId: string, key: AnalyticsDashboardKey) {
  switch (key) {
    case 'executive':
      return getAnalyticsOverview(workspaceId);
    case 'seo':
      return getSeoAnalytics(workspaceId);
    case 'backlinks':
      return getBacklinkAnalytics(workspaceId);
    case 'campaigns':
      return getCampaignAnalytics(workspaceId);
    case 'workflows':
      return getWorkflowAnalytics(workspaceId);
    case 'relationships':
      return getRelationshipAnalytics(workspaceId);
    case 'outreach':
      return getOutreachAnalytics(workspaceId);
    case 'ai':
      return getAiAnalytics(workspaceId);
    case 'team':
      return getTeamAnalytics(workspaceId);
    case 'system':
      return getSystemAnalytics(workspaceId);
    default:
      return getAnalyticsOverview(workspaceId);
  }
}

export async function getMissionControlAnalytics(workspaceId: string) {
  const overview = await getAnalyticsOverview(workspaceId, { persistInsights: false });
  return {
    todaysPerformance: overview.growth.today,
    weeklyGrowth: overview.growth.weekly,
    monthlyGrowth: overview.growth.monthly,
    kpis: overview.kpis,
    insights: overview.insights.slice(0, 5),
    forecasts: overview.forecasts.slice(0, 4),
  };
}

export async function exportAnalytics(
  workspaceId: string,
  dashboardKey: AnalyticsDashboardKey,
  format: 'csv' | 'xlsx' | 'json',
  userId?: string
) {
  const data = await getAnalyticsDashboard(workspaceId, dashboardKey);
  const payload = { dashboardKey, exportedAt: new Date().toISOString(), data };

  let body: string;
  let contentType: string;
  let filename: string;

  if (format === 'json') {
    body = JSON.stringify(payload, null, 2);
    contentType = 'application/json';
    filename = `${dashboardKey}-analytics.json`;
  } else {
    // Flatten top-level numeric / simple fields for CSV/XLSX text export
    const rows: string[][] = [['metric', 'value']];
    const flat = flattenMetrics(data as Record<string, unknown>);
    for (const [k, v] of Object.entries(flat)) {
      rows.push([k, String(v)]);
    }
    body = rows.map((r) => r.map(csvEscape).join(',')).join('\n');
    contentType = format === 'xlsx' ? 'text/csv' : 'text/csv';
    filename = `${dashboardKey}-analytics.${format === 'xlsx' ? 'csv' : 'csv'}`;
  }

  try {
    await getSupabaseAdmin().from('analytics_exports').insert({
      workspace_id: workspaceId,
      dashboard_key: dashboardKey,
      format,
      created_by: userId ?? null,
      row_count: Object.keys(flattenMetrics(data as Record<string, unknown>)).length,
    });
  } catch (err) {
    logger.warn({ err }, 'analytics_exports insert skipped');
  }

  return { body, contentType, filename, format, note: format === 'xlsx' ? 'CSV-compatible spreadsheet export (Excel-openable). PDF/PPT deferred to Reports Engine.' : undefined };
}

function flattenMetrics(obj: Record<string, unknown>, prefix = ''): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') {
      out[key] = typeof v === 'boolean' ? (v ? 1 : 0) : v;
    } else if (Array.isArray(v) && v.every((i) => i && typeof i === 'object' && 'name' in i && 'value' in i)) {
      for (const item of v as { name: string; value: number }[]) {
        out[`${key}.${item.name}`] = item.value;
      }
    }
  }
  return out;
}

function csvEscape(v: string) {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export async function listCachedInsights(workspaceId: string, limit = 20) {
  const { data, error } = await getSupabaseAdmin()
    .from('analytics_insights')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

import type { AnalyticsInsight, AnalyticsForecast, NamedCount } from './types.js';

function id() {
  return `ins_${Math.random().toString(36).slice(2, 10)}`;
}

function pctDelta(a: number, b: number) {
  if (b === 0) return a > 0 ? 100 : 0;
  return Math.round(((a - b) / Math.abs(b)) * 100);
}

export function generateInsights(input: {
  backlinkSuccessRate: number;
  guestPostSuccessRate?: number;
  directorySuccessRate?: number;
  campaignAProgress?: number;
  campaignBProgress?: number;
  replyRate: number;
  priorReplyRate?: number;
  relationshipsImproved?: number;
  workflowSuccessRate: number;
  aiHoursSaved: number;
}): AnalyticsInsight[] {
  const now = new Date().toISOString();
  const insights: AnalyticsInsight[] = [];

  if (
    input.guestPostSuccessRate != null &&
    input.directorySuccessRate != null &&
    input.directorySuccessRate > 0
  ) {
    const lift = pctDelta(input.guestPostSuccessRate, input.directorySuccessRate);
    if (lift > 10) {
      insights.push({
        id: id(),
        category: 'backlinks',
        severity: 'positive',
        title: `Guest posts outperform directories by ${lift}%`,
        body: `Guest post success rate is ${input.guestPostSuccessRate}% vs directories at ${input.directorySuccessRate}%.`,
        recommendation: 'Prioritize guest-post campaigns in the next sprint.',
        metricDeltaPct: lift,
        createdAt: now,
      });
    }
  }

  if (input.campaignAProgress != null && input.campaignBProgress != null) {
    const lift = pctDelta(input.campaignAProgress, input.campaignBProgress);
    if (Math.abs(lift) >= 15) {
      const better = lift > 0 ? 'Campaign A' : 'Campaign B';
      insights.push({
        id: id(),
        category: 'campaigns',
        severity: 'positive',
        title: `${better} is outperforming by ${Math.abs(lift)}%`,
        body: `Progress gap detected between top campaigns (${input.campaignAProgress}% vs ${input.campaignBProgress}%).`,
        recommendation: 'Replicate the winning campaign template across similar niches.',
        metricDeltaPct: Math.abs(lift),
        createdAt: now,
      });
    }
  }

  if (input.priorReplyRate != null) {
    const lift = pctDelta(input.replyRate, input.priorReplyRate);
    if (lift !== 0) {
      insights.push({
        id: id(),
        category: 'outreach',
        severity: lift > 0 ? 'positive' : 'warning',
        title: `Reply rates ${lift > 0 ? 'increased' : 'decreased'} ${Math.abs(lift)}%`,
        body: `Current reply rate ${input.replyRate}% vs prior ${input.priorReplyRate}%.`,
        recommendation:
          lift > 0
            ? 'Double down on subject lines and sequences used this week.'
            : 'Review recent outreach copy and targeting filters.',
        metricDeltaPct: lift,
        createdAt: now,
      });
    }
  }

  if ((input.relationshipsImproved ?? 0) > 0) {
    insights.push({
      id: id(),
      category: 'relationships',
      severity: 'positive',
      title: `Relationship quality improved for ${input.relationshipsImproved} organizations`,
      body: 'Engagement and timeline activity indicate healthier partner relationships.',
      recommendation: 'Schedule follow-ups with warm relationships this week.',
      createdAt: now,
    });
  }

  if (input.workflowSuccessRate >= 80) {
    insights.push({
      id: id(),
      category: 'workflows',
      severity: 'positive',
      title: `Workflows running at ${input.workflowSuccessRate}% success`,
      body: 'Automation reliability is strong — expand triggers to more modules.',
      recommendation: 'Enable more event-triggered workflows for scan and approval paths.',
      createdAt: now,
    });
  } else if (input.workflowSuccessRate > 0 && input.workflowSuccessRate < 60) {
    insights.push({
      id: id(),
      category: 'workflows',
      severity: 'warning',
      title: `Workflow success is only ${input.workflowSuccessRate}%`,
      body: 'Failures or approval bottlenecks may be slowing automation value.',
      recommendation: 'Inspect failed runs and reduce approval friction on low-risk nodes.',
      createdAt: now,
    });
  }

  if (input.aiHoursSaved > 0) {
    insights.push({
      id: id(),
      category: 'ai',
      severity: 'info',
      title: `AI workforce saved ~${input.aiHoursSaved} hours`,
      body: 'Estimated from completed agent runs and automated workflow steps.',
      recommendation: 'Increase AI utilization on content and verification agents.',
      createdAt: now,
    });
  }

  if (input.backlinkSuccessRate > 0) {
    insights.push({
      id: id(),
      category: 'backlinks',
      severity: input.backlinkSuccessRate >= 50 ? 'positive' : 'info',
      title: `Backlink pipeline success rate ${input.backlinkSuccessRate}%`,
      body: 'Won + verified versus lost opportunities in the pipeline.',
      recommendation:
        input.backlinkSuccessRate < 40
          ? 'Tighten opportunity scoring thresholds before outreach.'
          : 'Maintain current qualification bar and scale volume carefully.',
      createdAt: now,
    });
  }

  return insights.slice(0, 12);
}

export function buildForecasts(input: {
  backlinksWon: number;
  replies: number;
  campaignsActive: number;
  campaignsCompleted: number;
  relationships: number;
  aiHoursSaved: number;
  weeklyBacklinkGrowth?: number;
  weeklyReplyGrowth?: number;
}): AnalyticsForecast[] {
  const blGrowth = input.weeklyBacklinkGrowth ?? Math.max(1, Math.round(input.backlinksWon * 0.15));
  const replyGrowth = input.weeklyReplyGrowth ?? Math.max(1, Math.round(input.replies * 0.12));
  const relGrowth = Math.max(1, Math.round(input.relationships * 0.05));

  return [
    {
      metric: 'expected_backlinks',
      current: input.backlinksWon,
      projected30d: input.backlinksWon + blGrowth * 4,
      projected90d: input.backlinksWon + blGrowth * 12,
      confidence: 0.62,
      unit: 'links',
    },
    {
      metric: 'expected_replies',
      current: input.replies,
      projected30d: input.replies + replyGrowth * 4,
      projected90d: input.replies + replyGrowth * 12,
      confidence: 0.58,
      unit: 'replies',
    },
    {
      metric: 'campaign_completion',
      current: input.campaignsCompleted,
      projected30d: input.campaignsCompleted + Math.max(1, Math.round(input.campaignsActive * 0.4)),
      projected90d: input.campaignsCompleted + Math.max(2, Math.round(input.campaignsActive * 1.1)),
      confidence: 0.55,
      unit: 'campaigns',
    },
    {
      metric: 'relationship_growth',
      current: input.relationships,
      projected30d: input.relationships + relGrowth * 4,
      projected90d: input.relationships + relGrowth * 12,
      confidence: 0.6,
      unit: 'orgs',
    },
    {
      metric: 'ai_productivity_hours',
      current: input.aiHoursSaved,
      projected30d: Math.round(input.aiHoursSaved * 1.35),
      projected90d: Math.round(input.aiHoursSaved * 2.1),
      confidence: 0.5,
      unit: 'hours',
    },
    {
      metric: 'projected_roi_index',
      current: Math.round(40 + input.backlinksWon * 2 + input.replies),
      projected30d: Math.round(40 + (input.backlinksWon + blGrowth * 4) * 2 + input.replies + replyGrowth * 4),
      projected90d: Math.round(40 + (input.backlinksWon + blGrowth * 12) * 2 + input.replies + replyGrowth * 12),
      confidence: 0.45,
      unit: 'index',
    },
  ];
}

export function toNamedPercents(items: NamedCount[]): NamedCount[] {
  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  return items.map((i) => ({ ...i, pct: Math.round((i.value / total) * 100) }));
}

export function buildTrendSeries(
  points: number,
  base: number,
  volatility = 0.15
): { date: string; value: number }[] {
  const out: { date: string; value: number }[] = [];
  let v = Math.max(0, base);
  const now = Date.now();
  for (let i = points - 1; i >= 0; i--) {
    const d = new Date(now - i * 24 * 60 * 60 * 1000);
    const wobble = 1 + (Math.sin(i * 1.7) * volatility) / 2;
    v = Math.max(0, Math.round(v * wobble + base * 0.02));
    out.push({ date: d.toISOString().slice(0, 10), value: v });
  }
  return out;
}

/** Bucket ISO timestamps into a fixed trailing day window (zeros when empty). */
export function bucketDailyTrend(
  timestamps: Array<string | null | undefined>,
  days: number
): { date: string; value: number }[] {
  const counts = new Map<string, number>();
  const now = Date.now();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    counts.set(d, 0);
  }
  for (const ts of timestamps) {
    if (!ts) continue;
    const day = String(ts).slice(0, 10);
    if (counts.has(day)) counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return [...counts.entries()].map(([date, value]) => ({ date, value }));
}

export function estimateAutomationHoursSaved(opts: {
  completedAgentRuns: number;
  completedWorkflowRuns: number;
  emailsSent: number;
}) {
  return Math.round(
    opts.completedAgentRuns * 0.25 +
      opts.completedWorkflowRuns * 0.4 +
      opts.emailsSent * 0.08
  );
}

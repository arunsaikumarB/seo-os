import type { CampaignPlan, CampaignType } from './campaign-types.js';

export interface PlannerInput {
  projectName: string;
  domain: string;
  goals: string[];
  campaignType: CampaignType;
  keywordCount?: number;
  opportunityCount?: number;
  brandSummary?: string;
}

export function buildDefaultPlan(input: PlannerInput): CampaignPlan {
  const typeLabel = input.campaignType.replace(/_/g, ' ');
  return {
    summary: `AI campaign plan for ${typeLabel} targeting ${input.domain}`,
    phases: [
      {
        name: 'Discovery & qualification',
        durationWeeks: 2,
        actions: ['Review opportunity queue', 'Approve top-scored prospects', 'Assign to campaign'],
      },
      {
        name: 'Outreach preparation',
        durationWeeks: 2,
        actions: ['Draft email templates', 'Personalize outreach', 'Submit for approval'],
      },
      {
        name: 'Execution',
        durationWeeks: 4,
        actions: ['Launch approved outreach', 'Track responses', 'Iterate messaging'],
      },
    ],
    targetOpportunities: Math.max(10, input.opportunityCount ?? 15),
    recommendedTypes: [input.campaignType],
    aiGenerated: false,
  };
}

export function parseAiPlanResponse(text: string, campaignType: CampaignType): CampaignPlan {
  const lines = text.split('\n').filter((l) => l.trim());
  const actions = lines.filter((l) => l.match(/^[-*]/)).map((l) => l.replace(/^[-*]\s*/, ''));
  return {
    summary: lines[0]?.slice(0, 300) ?? 'AI-generated campaign plan',
    phases: [
      { name: 'Phase 1', durationWeeks: 2, actions: actions.slice(0, 3) },
      { name: 'Phase 2', durationWeeks: 2, actions: actions.slice(3, 6) },
      { name: 'Phase 3', durationWeeks: 4, actions: actions.slice(6, 10) },
    ],
    targetOpportunities: 20,
    recommendedTypes: [campaignType],
    aiGenerated: true,
  };
}

export function recommendOpportunities<T extends { score: number; opportunity_type: string }>(
  opportunities: T[],
  campaignType: CampaignType,
  limit = 5
): Array<T & { recommendation: string }> {
  return opportunities
    .filter((o) => o.opportunity_type === campaignType || o.score >= 60)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((o) => ({
      ...o,
      recommendation:
        o.score >= 75
          ? 'Strong fit — approve for campaign'
          : o.score >= 60
            ? 'Moderate fit — review before approving'
            : 'Low priority — consider rejecting',
    }));
}

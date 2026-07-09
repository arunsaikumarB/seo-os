import { getTypeLabel } from './backlink-types.js';
import { getScoreTier, scoreBacklinkOpportunity } from './scoring.js';

export interface OpportunityAiContext {
  title: string;
  domain?: string | null;
  opportunity_type: string;
  score?: number;
  domain_rating?: number | null;
  monthly_traffic?: number | null;
  spam_score?: number | null;
  website_name?: string | null;
}

export function predictReplyRate(ctx: OpportunityAiContext): number {
  let rate = 12;
  if (ctx.domain_rating && ctx.domain_rating >= 50) rate += 8;
  if (ctx.score && ctx.score >= 75) rate += 10;
  if (ctx.opportunity_type === 'broken_link') rate += 15;
  if (ctx.opportunity_type === 'haro') rate += 12;
  if (ctx.opportunity_type === 'resource_page') rate += 8;
  if (ctx.spam_score && ctx.spam_score > 30) rate -= 10;
  return Math.min(85, Math.max(3, Math.round(rate)));
}

export function estimateSuccessProbability(ctx: OpportunityAiContext): number {
  const score =
    ctx.score ??
    scoreBacklinkOpportunity({
      type: ctx.opportunity_type,
      title: ctx.title,
      domain: ctx.domain ?? undefined,
      da: ctx.domain_rating ?? undefined,
    });
  let prob = score * 0.7;
  if (ctx.domain_rating && ctx.domain_rating >= 60) prob += 8;
  if (ctx.monthly_traffic && ctx.monthly_traffic >= 10000) prob += 5;
  if (ctx.spam_score && ctx.spam_score > 40) prob -= 15;
  return Math.min(95, Math.max(5, Math.round(prob)));
}

export function suggestAnchorText(ctx: OpportunityAiContext, brand?: string): string {
  const b = brand ?? 'your brand';
  const type = ctx.opportunity_type;
  if (type === 'guest_post') return `${b} — expert insights`;
  if (type === 'resource_page') return `${b} guide`;
  if (type === 'broken_link') return ctx.title.slice(0, 60);
  return b;
}

export function suggestTargetPage(domain?: string | null): string {
  if (!domain) return '/';
  return `https://${domain.replace(/^https?:\/\//, '')}/`;
}

export function suggestOutreachStrategy(ctx: OpportunityAiContext): string {
  const type = getTypeLabel(ctx.opportunity_type);
  const tier = getScoreTier(ctx.score ?? 50);
  if (tier === 'high') {
    return `Personalized ${type} pitch highlighting mutual audience value. Lead with a specific content gap on their site.`;
  }
  if (tier === 'medium') {
    return `Standard ${type} outreach with one custom data point. Follow up once after 5 business days.`;
  }
  return `Low-touch ${type} template. Batch with similar opportunities. Deprioritize if no reply in 10 days.`;
}

export function generateEmailDraft(ctx: OpportunityAiContext, brand = 'our team'): string {
  const site = ctx.website_name ?? ctx.domain ?? 'your site';
  return `Subject: Collaboration idea for ${site}

Hi,

I came across ${site} while researching ${getTypeLabel(ctx.opportunity_type).toLowerCase()} opportunities. We think there's a strong fit for a collaboration with ${brand}.

Would you be open to a brief conversation about a potential placement?

Best regards`;
}

export function generateGuestPostDraft(ctx: OpportunityAiContext, brand = 'Our Brand'): string {
  return `# ${ctx.title}

## Introduction
${brand} brings unique expertise relevant to readers of ${ctx.website_name ?? ctx.domain ?? 'this publication'}.

## Key Takeaways
- Insight 1 tailored to the target audience
- Data-backed perspective on industry trends
- Actionable recommendations

## Conclusion
A natural mention of ${brand} as a trusted resource in this space.`;
}

export function generatePressReleaseDraft(ctx: OpportunityAiContext, brand = 'Our Brand'): string {
  return `FOR IMMEDIATE RELEASE

${brand} Announces Initiative Related to ${ctx.title}

${brand} today shared new insights of interest to readers of ${ctx.website_name ?? ctx.domain ?? 'industry publications'}.

About ${brand}
[Company boilerplate]`;
}

export function summarizeWebsite(ctx: OpportunityAiContext): string {
  const dr = ctx.domain_rating ? `DR ${ctx.domain_rating}` : 'unknown authority';
  const traffic = ctx.monthly_traffic
    ? `~${ctx.monthly_traffic.toLocaleString()} monthly visits`
    : 'traffic data pending';
  return `${ctx.website_name ?? ctx.domain ?? 'Site'}: ${dr}, ${traffic}. Strong candidate for ${getTypeLabel(ctx.opportunity_type).toLowerCase()} outreach.`;
}

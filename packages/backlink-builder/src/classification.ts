/** AI classification for imported domains — Epic 2 + Classification Engine */

import type { DomainAnalysisResult } from './domain-analyzer.js';
import { scoreBacklinkOpportunity, getScoreTier } from './scoring.js';
import { estimateSuccessProbability, predictReplyRate } from './ai-features.js';
import type { BacklinkTypeId } from './backlink-types.js';
import { getTypeLabel } from './backlink-types.js';
import type {
  ClassificationAgentId,
  ClassificationDecision,
  ClassificationQueue,
  LearningPattern,
  OpportunityClassificationId,
} from './opportunity-classifier.js';
import { classifyFromWebsiteInspection, extractWebsiteSignals } from './opportunity-classifier.js';

export type Priority = 'low' | 'medium' | 'high' | 'urgent';

export interface ClassificationResult {
  backlinkType: BacklinkTypeId;
  opportunityScore: number;
  relevanceScore: number;
  spamRisk: number;
  priority: Priority;
  successProbability: number;
  replyRate: number;
  difficulty: number;
  recommendedAction: string;
  scoreTier: string;
  estimated: true;
  metricsSource: 'estimated';
  /** Extended classification engine fields */
  classificationId: OpportunityClassificationId | string;
  classificationLabel: string;
  confidence: number;
  reason: string;
  evidence: string[];
  workflowQueue: ClassificationQueue | string;
  assignedAgent: ClassificationAgentId | string;
  alternatives: ClassificationDecision['alternatives'];
}

export interface ClassificationContext {
  projectDomain?: string;
  projectIndustry?: string;
  brandName?: string;
  learning?: LearningPattern[];
}

function computeRelevance(analysis: DomainAnalysisResult, ctx: ClassificationContext): number {
  let score = 50;
  if (ctx.projectIndustry && analysis.niche === ctx.projectIndustry) score += 25;
  if (ctx.projectIndustry && analysis.niche === 'general') score += 5;
  if (analysis.domainRating >= 50) score += 10;
  if (analysis.domainRating >= 70) score += 10;
  return Math.min(100, score);
}

function computeSpamRisk(analysis: DomainAnalysisResult): number {
  let risk = 20;
  if (analysis.domainRating < 20) risk += 25;
  if (analysis.domain.includes('free') || analysis.domain.includes('submit')) risk += 15;
  if (analysis.domain.endsWith('.edu') || analysis.domain.endsWith('.gov')) risk -= 20;
  return Math.max(5, Math.min(90, risk));
}

function computePriority(score: number, relevance: number, spamRisk: number): Priority {
  const combined = score * 0.5 + relevance * 0.4 - spamRisk * 0.2;
  if (combined >= 75) return 'urgent';
  if (combined >= 60) return 'high';
  if (combined >= 40) return 'medium';
  return 'low';
}

function recommendAction(
  type: BacklinkTypeId,
  tier: string,
  analysis: DomainAnalysisResult,
  queue?: string
): string {
  const label = getTypeLabel(type);
  if (tier === 'high') {
    return `Prioritize personalized ${label.toLowerCase()} outreach to ${analysis.websiteName}. Generate custom content and assign to active campaign.`;
  }
  if (queue === 'directory' || type === 'directory') {
    return `Prepare directory listing for ${analysis.websiteName}. Use assisted submission workflow — human review required before publish.`;
  }
  if (type === 'forum' || type === 'qa_site' || queue === 'forum' || queue === 'qa') {
    return `Draft community response for ${analysis.websiteName}. Platform moderation required — do not auto-post.`;
  }
  if (type === 'guest_post' || queue === 'guest_post') {
    return `Generate guest post draft and outreach email for ${analysis.websiteName}. Editorial approval required.`;
  }
  return `Queue ${label.toLowerCase()} opportunity for batch outreach. Monitor reply rate and adjust strategy.`;
}

export function classifyOpportunity(
  analysis: DomainAnalysisResult,
  ctx: ClassificationContext = {}
): ClassificationResult {
  const decision =
    analysis.classificationDecision ??
    classifyFromWebsiteInspection(
      analysis.websiteSignals ??
        extractWebsiteSignals('<html></html>', {
          fetchOk: analysis.metricsSource === 'live',
          sitemapFound: analysis.sitemapFound,
          robotsOk: analysis.robotsTxtStatus === 'found',
        }),
      {
        learning: ctx.learning,
        domain: analysis.domain,
        fallbackType: analysis.primaryType,
      }
    );

  const backlinkType = decision.backlinkType;
  const opportunityScore = scoreBacklinkOpportunity({
    type: backlinkType,
    title: analysis.websiteName,
    domain: analysis.domain,
    da: analysis.domainRating,
  });
  const relevanceScore = computeRelevance(analysis, ctx);
  const spamRisk = computeSpamRisk(analysis);
  const aiCtx = {
    title: analysis.websiteName,
    domain: analysis.domain,
    opportunity_type: backlinkType,
    score: opportunityScore,
    domain_rating: analysis.domainRating,
    monthly_traffic: analysis.monthlyTraffic,
    spam_score: spamRisk,
    website_name: analysis.websiteName,
  };
  const successProbability = estimateSuccessProbability(aiCtx);
  const replyRate = predictReplyRate(aiCtx);
  const scoreTier = getScoreTier(opportunityScore);
  const priority = computePriority(opportunityScore, relevanceScore, spamRisk);
  const difficulty = Math.min(
    95,
    Math.round(40 + analysis.domainRating * 0.35 + (spamRisk > 40 ? 10 : 0))
  );

  return {
    backlinkType,
    opportunityScore,
    relevanceScore,
    spamRisk,
    priority,
    successProbability,
    replyRate,
    difficulty,
    recommendedAction: recommendAction(
      backlinkType,
      scoreTier,
      analysis,
      decision.workflowQueue
    ),
    scoreTier,
    estimated: true,
    metricsSource: 'estimated',
    classificationId: decision.classificationId,
    classificationLabel: decision.displayName,
    confidence: decision.confidence,
    reason: decision.reason,
    evidence: decision.evidence,
    workflowQueue: decision.workflowQueue,
    assignedAgent: decision.assignedAgent,
    alternatives: decision.alternatives,
  };
}

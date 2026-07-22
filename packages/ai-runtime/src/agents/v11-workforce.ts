import type { AgentType } from '@seo-os/agent-contracts';
import {
  detectSubmissionRequirements,
  discoverKeywordCandidates,
  generateContentPack,
  recommendBacklinkTypes,
  buildDomainStyleProfile,
  buildImagePrompt,
  buildImageMetadata,
  type OpportunityAiContext,
} from '@seo-os/backlink-builder';
import type { AgentHandler } from '../agent-registry.js';

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' && v.trim() ? v.trim() : fallback;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x)).filter(Boolean);
}

function oppFromInput(input: Record<string, unknown>): OpportunityAiContext {
  return {
    domain: asString(input.domain, 'example.com'),
    title: asString(input.title, asString(input.websiteName, 'Opportunity')),
    website_name: asString(input.websiteName, asString(input.domain, 'Site')),
    opportunity_type: asString(input.backlinkType, asString(input.opportunityType, 'directory')),
  };
}

/** V1.1 specialized agents — dispatch to @seo-os/backlink-builder domain logic */
export function registerV11WorkforceAgents(
  register: (agentType: AgentType, handler: AgentHandler) => void
): void {
  register('discovery_agent', async ({ workspaceId, input }) => {
    const seeds = asStringArray(input.seeds).length
      ? asStringArray(input.seeds)
      : [asString(input.query, 'seo backlinks')];
    return {
      agentType: 'discovery_agent',
      status: 'ok',
      summary: `Prepared discovery seeds for workspace ${workspaceId}`,
      seeds,
      suggestedQueries: seeds.flatMap((s) => [
        `${s} directory`,
        `${s} guest post`,
        `${s} resource list`,
      ]),
      metricsSource: 'estimated',
    };
  });

  register('website_analyzer_agent', async ({ input }) => {
    const domain = asString(input.domain, 'unknown');
    const opportunityType = asString(input.backlinkType, asString(input.opportunityType, 'directory'));
    const requirements = detectSubmissionRequirements(opportunityType, {
      htmlSnippet: asString(input.html) || undefined,
      url: asString(input.url) || `https://${domain}`,
    });
    return {
      agentType: 'website_analyzer_agent',
      status: 'ok',
      summary: `Analyzed ${domain} — ${requirements.metricsSource} requirements`,
      requirements,
      metricsSource: requirements.metricsSource,
    };
  });

  register('keyword_agent', async ({ input }) => {
    const primaries = asStringArray(input.primaryKeywords).length
      ? asStringArray(input.primaryKeywords)
      : [asString(input.keyword, 'seo')];
    const keywords = discoverKeywordCandidates(primaries, asString(input.industry));
    return {
      agentType: 'keyword_agent',
      status: 'ok',
      summary: `Discovered ${keywords.length} keyword candidates (Estimated)`,
      keywords,
      metricsSource: 'estimated',
    };
  });

  register('content_agent', async ({ input }) => {
    const { isGenerationMockEnabled } = await import('@seo-os/backlink-builder');
    if (!isGenerationMockEnabled()) {
      return {
        agentType: 'content_agent',
        status: 'error',
        summary:
          'Template content_agent disabled — use campaign Generate Content (LLM). Set GENERATION_MOCK=true only for local mock.',
        metricsSource: 'live',
      };
    }
    const opp = oppFromInput(input);
    const pack = generateContentPack(
      asString(input.backlinkType, opp.opportunity_type),
      opp,
      {
        brandName: asString(input.brandName, 'Brand'),
        industry: asString(input.industry, 'general'),
        projectDomain: asString(input.projectDomain),
      }
    );
    return {
      agentType: 'content_agent',
      status: 'ok',
      summary: `Generated editable ${pack.backlinkType} content pack`,
      pack,
      metricsSource: 'estimated',
    };
  });

  register('submission_agent', async ({ input }) => {
    const domain = asString(input.domain, 'unknown');
    const opportunityType = asString(input.backlinkType, asString(input.opportunityType, 'directory'));
    const requirements = detectSubmissionRequirements(opportunityType, {
      htmlSnippet: asString(input.html) || undefined,
      url: asString(input.url) || `https://${domain}`,
    });
    return {
      agentType: 'submission_agent',
      status: 'ok',
      summary: `Submission prep for ${domain} — approval required before send`,
      requirements,
      approvalRequired: true,
      metricsSource: requirements.metricsSource,
    };
  });

  register('relationship_agent', async ({ input }) => {
    const domain = asString(input.domain, 'unknown');
    const priorTouches = Number(input.priorTouches ?? 0);
    const score = Math.min(95, 40 + priorTouches * 8 + (hash(domain) % 20));
    return {
      agentType: 'relationship_agent',
      status: 'ok',
      summary: `Relationship score for ${domain}: ${score}`,
      domain,
      score,
      nextAction: score >= 70 ? 'nurture' : 'introduce',
      metricsSource: 'estimated',
    };
  });

  register('verification_agent', async ({ input }) => {
    const url = asString(input.url, asString(input.backlinkUrl));
    return {
      agentType: 'verification_agent',
      status: 'ok',
      summary: url
        ? `Queued verification plan for ${url}`
        : 'Verification agent ready — provide backlinkUrl',
      url: url || null,
      checks: ['href_present', 'rel_nofollow', 'anchor_match', 'status_code'],
      metricsSource: 'estimated',
    };
  });

  register('campaign_agent', async ({ input }) => {
    const recommendations = recommendBacklinkTypes({
      industry: asString(input.industry),
      primaryKeywords: asStringArray(input.primaryKeywords),
      domainAuthorityHint: Number(input.domainAuthorityHint ?? 40),
    });
    return {
      agentType: 'campaign_agent',
      status: 'ok',
      summary: `Campaign priorities: top type ${recommendations[0]?.type ?? 'directory'}`,
      recommendations: recommendations.slice(0, 5),
      metricsSource: 'estimated',
    };
  });

  register('reporting_agent', async ({ input }) => {
    const submitted = Number(input.submitted ?? 0);
    const verified = Number(input.verified ?? 0);
    const lost = Number(input.lost ?? 0);
    return {
      agentType: 'reporting_agent',
      status: 'ok',
      summary: `Ops report: ${submitted} submitted, ${verified} verified, ${lost} lost`,
      report: {
        submitted,
        verified,
        lost,
        verificationRate: submitted > 0 ? Math.round((verified / submitted) * 100) : 0,
      },
      metricsSource: 'user',
    };
  });

  register('image_intelligence_agent', async ({ workspaceId, input }) => {
    const brandName = asString(input.brandName, 'Brand');
    const style = buildDomainStyleProfile({
      domain: asString(input.domain, 'example.com'),
      brandName,
      industry: asString(input.industry, 'general'),
      keywords: asStringArray(input.keywords),
    });
    const imageType = asString(input.imageType, 'blog_hero');
    const prompt = buildImagePrompt({
      imageType,
      style,
      topic: asString(input.topic),
      backlinkType: asString(input.backlinkType),
      brandName,
    });
    const metadata = buildImageMetadata({
      brandName,
      imageType,
      topic: asString(input.topic),
      width: prompt.width,
      height: prompt.height,
    });
    return {
      agentType: 'image_intelligence_agent',
      status: 'ok',
      summary: `Image Intelligence prepared ${imageType} for workspace ${workspaceId}`,
      style,
      prompt,
      metadata,
      recommendedProvider: prompt.recommendedProvider,
      metricsSource: 'estimated',
    };
  });
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

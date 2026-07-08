import type { CampaignType } from '@seo-os/campaign-engine';
import { buildDefaultPlan, parseAiPlanResponse } from '@seo-os/campaign-engine';
import { getAIRuntime } from '../ai/runtime.js';
import { getEnv } from '../../config/env.js';
import { getProjectById } from '../projects/project.service.js';
import { listOpportunityQueue } from './opportunity-queue.service.js';
import { getKnowledgeStats } from '../knowledge/document.service.js';
import { getIntelligenceSummary } from '../intelligence/intelligence.service.js';

export async function generateCampaignPlan(
  workspaceId: string,
  orgId: string,
  input: { campaignType: CampaignType; goals: string[] }
) {
  const project = await getProjectById(workspaceId, orgId);
  if (!project) throw new Error('Project not found');

  const [knowledge, intelligence, opportunities] = await Promise.all([
    getKnowledgeStats(workspaceId),
    getIntelligenceSummary(workspaceId),
    listOpportunityQueue(workspaceId),
  ]);

  const plannerInput = {
    projectName: project.name,
    domain: project.domain,
    goals: input.goals,
    campaignType: input.campaignType,
    keywordCount: intelligence.discovery.keywordCount,
    opportunityCount: opportunities.length,
    brandSummary: `KB docs: ${knowledge.readyDocuments}, keywords: ${intelligence.discovery.keywordCount}`,
  };

  if (getEnv().GEMINI_API_KEY || getEnv().OLLAMA_BASE_URL) {
    try {
      const rt = getAIRuntime();
      const prompt = `Create an SEO campaign plan for ${input.campaignType} campaign.
Project: ${project.name} (${project.domain})
Goals: ${input.goals.join(', ')}
Context: ${plannerInput.brandSummary}
List phases and actions as bullet points.`;
      const result = await rt.providers.getAIProviderRouter().completeWithFailover([
        { role: 'user', content: prompt },
      ]);
      return parseAiPlanResponse(result.text, input.campaignType);
    } catch {
      /* fallback */
    }
  }

  return buildDefaultPlan(plannerInput);
}

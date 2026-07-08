import type { AgentType } from '@seo-os/agent-contracts';
import type { AgentHandler } from '../agent-registry.js';

function stubHandler(agentType: AgentType, displayName: string): AgentHandler {
  return async ({ workspaceId, input }) => {
    const base: Record<string, unknown> = {
      agentType,
      summary: `${displayName} registered for workspace ${workspaceId}`,
      status: 'stub',
      input,
    };
    if (agentType === 'ceo') base.objectives = [];
    return base;
  };
}

export function registerSprint2Agents(
  register: (agentType: AgentType, handler: AgentHandler) => void
): void {
  register('ceo', stubHandler('ceo', 'CEO Agent'));
  register('seo_strategist', stubHandler('seo_strategist', 'SEO Strategist'));
  register('research_manager', stubHandler('research_manager', 'Research Manager'));
  register(
    'competitor_intelligence',
    stubHandler('competitor_intelligence', 'Competitor Intelligence')
  );
  register('prospect_discovery', stubHandler('prospect_discovery', 'Prospect Discovery'));
  register('content_strategist', stubHandler('content_strategist', 'Content Strategist'));
  register('outreach_manager', stubHandler('outreach_manager', 'Outreach Manager'));
  register('qa', async ({ agentType, input }) => ({
    agentType,
    summary: 'QA framework stub — validation pipeline ready',
    status: 'stub',
    passed: true,
    issues: [],
    reviewed: input,
  }));
}

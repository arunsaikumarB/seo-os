import type { AgentType } from '@seo-os/agent-contracts';

export interface IntentMatch {
  agentType: AgentType;
  confidence: number;
  reason: string;
}

const INTENT_PATTERNS: Array<{ pattern: RegExp; agentType: AgentType }> = [
  { pattern: /@ceo\b/i, agentType: 'ceo' },
  { pattern: /@seo_strategist\b/i, agentType: 'seo_strategist' },
  { pattern: /@research_manager\b/i, agentType: 'research_manager' },
  { pattern: /@qa\b/i, agentType: 'qa' },
  { pattern: /\b(strategy|prioritize|roadmap)\b/i, agentType: 'seo_strategist' },
  { pattern: /\b(research|investigate)\b/i, agentType: 'research_manager' },
  { pattern: /\b(content (plan|strategy|brief))\b/i, agentType: 'content_strategist' },
  { pattern: /\b(prospect|link opportunit)/i, agentType: 'prospect_discovery' },
  { pattern: /\b(outreach|campaign)\b/i, agentType: 'outreach_manager' },
];

export function classifyIntent(message: string): IntentMatch | null {
  for (const { pattern, agentType } of INTENT_PATTERNS) {
    if (pattern.test(message)) {
      return {
        agentType,
        confidence: pattern.source.startsWith('@') ? 1.0 : 0.75,
        reason: `Matched pattern: ${pattern.source}`,
      };
    }
  }
  return null;
}

export const SUGGESTED_PROMPTS = [
  'Summarize our uploaded knowledge base documents',
  'What are our target keywords and how should we prioritize them?',
  'Create an SEO strategy outline for this project',
  '@ceo What should we focus on this quarter?',
  'What does our brand voice guidelines say?',
  '@research_manager What should we research next?',
];

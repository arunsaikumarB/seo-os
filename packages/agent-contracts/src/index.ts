/** Sprint 2 workforce agents — framework registration (8 of 14 for this sprint) */
export const SPRINT2_AGENT_TYPES = [
  'ceo',
  'seo_strategist',
  'research_manager',
  'competitor_intelligence',
  'prospect_discovery',
  'content_strategist',
  'outreach_manager',
  'qa',
] as const;

export type Sprint2AgentType = (typeof SPRINT2_AGENT_TYPES)[number];

export const AGENT_TYPES = [
  'ceo',
  'seo_strategist',
  'research_manager',
  'competitor_intelligence',
  'prospect_discovery',
  'content_strategist',
  'guest_post_writer',
  'outreach_manager',
  'email_personalization',
  'technical_seo',
  'backlink_verification',
  'analytics',
  'reporting',
  'qa',
  'discovery_agent',
  'website_analyzer_agent',
  'keyword_agent',
  'content_agent',
  'submission_agent',
  'relationship_agent',
  'verification_agent',
  'campaign_agent',
  'reporting_agent',
] as const;

export type AgentType = (typeof AGENT_TYPES)[number];

export type AgentRunStatus =
  'pending' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface AgentDefinition {
  agentType: AgentType;
  displayName: string;
  description: string;
  syncMode: 'sync' | 'async';
  defaultApproval: 'none' | 'optional' | 'review' | 'required';
  outputSchemaId: string;
}

export const AGENT_DEFINITIONS: AgentDefinition[] = [
  {
    agentType: 'ceo',
    displayName: 'CEO Agent',
    description: 'Strategic oversight and execution planning',
    syncMode: 'async',
    defaultApproval: 'optional',
    outputSchemaId: 'ceo_plan_v1',
  },
  {
    agentType: 'seo_strategist',
    displayName: 'SEO Strategist',
    description: 'SEO strategy and prioritization',
    syncMode: 'async',
    defaultApproval: 'review',
    outputSchemaId: 'seo_strategy_v1',
  },
  {
    agentType: 'research_manager',
    displayName: 'Research Manager',
    description: 'Orchestrates research workflows',
    syncMode: 'async',
    defaultApproval: 'none',
    outputSchemaId: 'research_plan_v1',
  },
  {
    agentType: 'competitor_intelligence',
    displayName: 'Competitor Intelligence',
    description: 'Competitive landscape analysis',
    syncMode: 'async',
    defaultApproval: 'none',
    outputSchemaId: 'competitor_intel_v1',
  },
  {
    agentType: 'prospect_discovery',
    displayName: 'Prospect Discovery',
    description: 'Discovers link-building prospects',
    syncMode: 'async',
    defaultApproval: 'review',
    outputSchemaId: 'prospect_discovery_v1',
  },
  {
    agentType: 'content_strategist',
    displayName: 'Content Strategist',
    description: 'Content planning and briefs',
    syncMode: 'async',
    defaultApproval: 'none',
    outputSchemaId: 'content_strategy_v1',
  },
  {
    agentType: 'outreach_manager',
    displayName: 'Outreach Manager',
    description: 'Outreach campaign coordination',
    syncMode: 'async',
    defaultApproval: 'review',
    outputSchemaId: 'outreach_plan_v1',
  },
  {
    agentType: 'qa',
    displayName: 'Quality Assurance Agent',
    description: 'Validates agent outputs',
    syncMode: 'async',
    defaultApproval: 'none',
    outputSchemaId: 'qa_result_v1',
  },
  {
    agentType: 'discovery_agent',
    displayName: 'Discovery Agent',
    description: 'Discovers backlink opportunity websites',
    syncMode: 'async',
    defaultApproval: 'none',
    outputSchemaId: 'discovery_v11',
  },
  {
    agentType: 'website_analyzer_agent',
    displayName: 'Website Analyzer Agent',
    description: 'Analyzes target websites for submission fit',
    syncMode: 'async',
    defaultApproval: 'none',
    outputSchemaId: 'analyzer_v11',
  },
  {
    agentType: 'keyword_agent',
    displayName: 'Keyword Agent',
    description: 'Discovers and clusters project keywords',
    syncMode: 'async',
    defaultApproval: 'none',
    outputSchemaId: 'keyword_v11',
  },
  {
    agentType: 'content_agent',
    displayName: 'Content Agent',
    description: 'Generates editable content packs',
    syncMode: 'async',
    defaultApproval: 'review',
    outputSchemaId: 'content_v11',
  },
  {
    agentType: 'submission_agent',
    displayName: 'Submission Agent',
    description: 'Prepares submission requirements and prefill',
    syncMode: 'async',
    defaultApproval: 'required',
    outputSchemaId: 'submission_v11',
  },
  {
    agentType: 'relationship_agent',
    displayName: 'Relationship Agent',
    description: 'Scores publisher relationships',
    syncMode: 'async',
    defaultApproval: 'none',
    outputSchemaId: 'relationship_v11',
  },
  {
    agentType: 'verification_agent',
    displayName: 'Verification Agent',
    description: 'Verifies live backlinks',
    syncMode: 'async',
    defaultApproval: 'none',
    outputSchemaId: 'verification_v11',
  },
  {
    agentType: 'campaign_agent',
    displayName: 'Campaign Agent',
    description: 'Orchestrates campaign priorities',
    syncMode: 'async',
    defaultApproval: 'review',
    outputSchemaId: 'campaign_v11',
  },
  {
    agentType: 'reporting_agent',
    displayName: 'Reporting Agent',
    description: 'Builds operational backlink reports',
    syncMode: 'async',
    defaultApproval: 'none',
    outputSchemaId: 'reporting_v11',
  },
];

export interface AgentOutputBase {
  agentType: AgentType;
  summary: string;
  status: 'ok' | 'stub';
}

export const AGENT_OUTPUT_SCHEMAS: Record<string, object> = {
  ceo_plan_v1: {
    type: 'object',
    required: ['agentType', 'summary', 'status', 'objectives'],
    properties: {
      agentType: { type: 'string' },
      summary: { type: 'string' },
      status: { type: 'string' },
      objectives: { type: 'array', items: { type: 'string' } },
    },
  },
  qa_result_v1: {
    type: 'object',
    required: ['agentType', 'summary', 'status', 'passed'],
    properties: {
      agentType: { type: 'string' },
      summary: { type: 'string' },
      status: { type: 'string' },
      passed: { type: 'boolean' },
      issues: { type: 'array', items: { type: 'string' } },
    },
  },
};

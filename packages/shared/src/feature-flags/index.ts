export const FEATURE_FLAGS = [
  'ai_workforce',
  'mission_control',
  'knowledge_base',
  'ai_memory',
  'backlink_builder',
  'outreach',
  'workflows',
  'analytics',
  'technical_seo',
  'reports',
  'marketplace',
  'white_label',
] as const;

export type FeatureFlag = (typeof FEATURE_FLAGS)[number];

/** Sprint 3 defaults — Knowledge Engine enabled */
export const DEFAULT_FEATURE_FLAGS: Record<FeatureFlag, boolean> = {
  ai_workforce: true,
  mission_control: true,
  knowledge_base: true,
  ai_memory: true,
  backlink_builder: true,
  outreach: true,
  workflows: true,
  analytics: true,
  technical_seo: false,
  reports: false,
  marketplace: false,
  white_label: false,
};

export type AIEventType =
  | 'agent.run.queued'
  | 'agent.run.started'
  | 'agent.run.completed'
  | 'agent.run.failed'
  | 'agent.step.started'
  | 'agent.step.completed'
  | 'provider.health.changed'
  | 'provider.failover';

export interface AIEvent {
  id: string;
  type: AIEventType;
  workspaceId?: string;
  agentRunId?: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface AIProviderHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'down' | 'disabled';
  latencyMs?: number;
  lastCheckedAt: string;
  message?: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  provider: string;
  estimatedCostUsd?: number;
}

export interface AgentRunRecord {
  id: string;
  workspaceId: string;
  agentType: string;
  status: string;
  provider?: string;
  inputTokens?: number;
  outputTokens?: number;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

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
  'integrations',
  'closed_beta',
  'feedback_center',
  'marketplace',
  'white_label',
  'v11_submission_assistant',
  'v11_submission_queue',
  'v11_browser_assistant',
  'v11_browser_assist_fill',
  'v11_oauth_email',
  'v11_content_studio_v2',
  'v11_media_studios',
  'v11_keyword_intel',
  'v11_recommendations',
  'v11_ai_workforce_v2',
  'bee_enabled',
  'bee_headed_debug',
  'bee_automatic_submit',
  'bee_learning',
  'bee_auto_resume',
  'v13_image_generation',
  'v13_flux',
  'v13_sdxl',
  'v13_comfy',
  'provider_keyword',
  'provider_authority',
  'provider_cms',
  'provider_image',
  'provider_email',
  'provider_browser',
  'provider_llm',
  'provider_search',
] as const;

export type FeatureFlag = (typeof FEATURE_FLAGS)[number];

/** Defaults — closed beta program enabled for v0.99.5; V1.1 flags on for production rollout */
export const DEFAULT_FEATURE_FLAGS: Record<FeatureFlag, boolean> = {
  ai_workforce: true,
  mission_control: true,
  knowledge_base: true,
  ai_memory: true,
  backlink_builder: true,
  outreach: true,
  workflows: true,
  analytics: true,
  technical_seo: true,
  reports: true,
  integrations: true,
  closed_beta: true,
  feedback_center: true,
  marketplace: false,
  white_label: true,
  v11_submission_assistant: true,
  v11_submission_queue: true,
  v11_browser_assistant: true,
  v11_browser_assist_fill: false,
  v11_oauth_email: true,
  v11_content_studio_v2: true,
  v11_media_studios: true,
  v11_keyword_intel: true,
  v11_recommendations: true,
  v11_ai_workforce_v2: true,
  bee_enabled: true,
  bee_headed_debug: false,
  bee_automatic_submit: false,
  bee_learning: true,
  bee_auto_resume: true,
  v13_image_generation: false,
  v13_flux: true,
  v13_sdxl: true,
  v13_comfy: false,
  provider_keyword: true,
  provider_authority: true,
  provider_cms: false,
  provider_image: true,
  provider_email: true,
  provider_browser: true,
  provider_llm: true,
  provider_search: false,
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

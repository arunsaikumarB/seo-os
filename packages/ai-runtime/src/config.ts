export interface AIConfig {
  defaultTemperature: number;
  defaultMaxTokens: number;
  enableFailover: boolean;
  queueAsyncAgents: boolean;
}

export const DEFAULT_AI_CONFIG: AIConfig = {
  defaultTemperature: 0.7,
  defaultMaxTokens: 2048,
  enableFailover: true,
  queueAsyncAgents: true,
};

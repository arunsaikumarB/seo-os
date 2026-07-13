/** Provider Integration Framework — shared types (no vendor lock-in) */

export const PROVIDER_TYPES = [
  'keyword',
  'authority',
  'cms',
  'image',
  'email',
  'browser',
  'storage',
  'analytics',
  'embedding',
  'llm',
  'search',
  'webhook',
] as const;

export type FrameworkProviderType = (typeof PROVIDER_TYPES)[number];

export type ProviderHealthStatus =
  | 'healthy'
  | 'warning'
  | 'offline'
  | 'unconfigured'
  | 'quota_exceeded';

export interface FrameworkProviderHealth {
  status: ProviderHealthStatus;
  latencyMs?: number;
  message: string;
  quotaRemaining?: number;
  quotaLimit?: number;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  checkedAt: string;
}

export interface FrameworkProviderCapabilities {
  [key: string]: boolean | number | string | undefined;
}

export interface FrameworkProviderDescriptor {
  key: string;
  displayName: string;
  version: string;
  type: FrameworkProviderType;
  capabilities: string[];
  status: 'available' | 'deprecated' | 'disabled' | 'beta';
  priority: number;
  isDefault: boolean;
  isEstimated: boolean;
  costTier: 'free' | 'free_tier' | 'self_hosted' | 'paid';
  authModes: string[];
  configured: boolean;
  enabled: boolean;
}

export interface FrameworkProvider {
  readonly key: string;
  readonly displayName: string;
  readonly version: string;
  readonly type: FrameworkProviderType;
  capabilities(): FrameworkProviderCapabilities;
  health(): Promise<FrameworkProviderHealth>;
}

export interface ProviderManagerConfig {
  preferred?: Partial<Record<FrameworkProviderType, string>>;
  enabledKeys?: string[];
  disabledKeys?: string[];
}

export interface FailoverResult<T> {
  data: T;
  providerKey: string;
  failoverUsed: boolean;
  attempted: string[];
  estimated: boolean;
}

/**
 * Phase 5.8 — Workspace-aware LLM complete with real failover + quota circuit breaker.
 * Reads preferred/enabled from provider_configs per call (not process-start cache).
 */
import {
  createDeepSeekProvider,
  createGeminiProvider,
  createMistralProvider,
  createOllamaProvider,
  createOpenAIChatProvider,
  createOpenRouterProvider,
  getProviderManager,
  isQuotaExhaustedError,
  isRetryableProviderError,
  type AICompleteResult,
  type AIProvider,
  type FrameworkProviderType,
} from '@seo-os/providers';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { logger } from '../../lib/logger.js';
import { recordProviderInvocation, recordProviderFailoverHop } from './pif.service.js';

/** Quota-exhausted providers skipped for the rest of this API process (per workspace). */
const quotaCircuit = new Map<string, number>(); // `${workspaceId}:${providerKey}` → openedAt

function circuitKey(workspaceId: string, providerKey: string) {
  return `${workspaceId}:${providerKey}`;
}

export function isLlmQuotaCircuitOpen(workspaceId: string, providerKey: string): boolean {
  return quotaCircuit.has(circuitKey(workspaceId, providerKey));
}

export function openLlmQuotaCircuit(workspaceId: string, providerKey: string): void {
  quotaCircuit.set(circuitKey(workspaceId, providerKey), Date.now());
  logger.warn({ workspaceId, providerKey }, 'LLM quota circuit opened — skipping provider for run');
}

export function clearLlmQuotaCircuits(workspaceId?: string): void {
  if (!workspaceId) {
    quotaCircuit.clear();
    return;
  }
  for (const k of [...quotaCircuit.keys()]) {
    if (k.startsWith(`${workspaceId}:`)) quotaCircuit.delete(k);
  }
}

async function resolveOrgId(workspaceId: string): Promise<string> {
  const { data } = await getSupabaseAdmin()
    .from('workspaces')
    .select('org_id')
    .eq('id', workspaceId)
    .single();
  if (!data?.org_id) throw Object.assign(new Error('Workspace not found'), { status: 404 });
  return data.org_id as string;
}

function envConfigured(providerKey: string): boolean {
  switch (providerKey) {
    case 'llm.gemini':
      return Boolean(process.env.GEMINI_API_KEY);
    case 'llm.mistral':
      return Boolean(process.env.MISTRAL_API_KEY);
    case 'llm.openai':
      return Boolean(process.env.OPENAI_API_KEY);
    case 'llm.ollama':
      return Boolean(process.env.OLLAMA_BASE_URL);
    case 'llm.deepseek':
      return Boolean(process.env.DEEPSEEK_API_KEY);
    case 'llm.openrouter':
      return Boolean(process.env.OPENROUTER_API_KEY);
    case 'llm.claude':
      return Boolean(process.env.ANTHROPIC_API_KEY);
    default:
      return false;
  }
}

function createProviderClient(providerKey: string): AIProvider | null {
  switch (providerKey) {
    case 'llm.gemini':
      return process.env.GEMINI_API_KEY
        ? createGeminiProvider(process.env.GEMINI_API_KEY)
        : null;
    case 'llm.mistral':
      return process.env.MISTRAL_API_KEY
        ? createMistralProvider(process.env.MISTRAL_API_KEY)
        : null;
    case 'llm.openai':
      return process.env.OPENAI_API_KEY
        ? createOpenAIChatProvider(process.env.OPENAI_API_KEY)
        : null;
    case 'llm.ollama':
      return process.env.OLLAMA_BASE_URL
        ? createOllamaProvider(process.env.OLLAMA_BASE_URL)
        : null;
    case 'llm.deepseek':
      return process.env.DEEPSEEK_API_KEY
        ? createDeepSeekProvider(process.env.DEEPSEEK_API_KEY)
        : null;
    case 'llm.openrouter':
      return process.env.OPENROUTER_API_KEY
        ? createOpenRouterProvider(process.env.OPENROUTER_API_KEY)
        : null;
    default:
      return null;
  }
}

function shortName(providerKey: string): string {
  return providerKey.replace(/^llm\./, '');
}

/**
 * Resolve LLM try-order for this workspace:
 * selected default (priority 1 / preferred) → other enabled+configured → catalog default.
 * Re-read from DB every call so Select takes effect without restart.
 */
export async function resolveLlmProviderChain(workspaceId: string): Promise<string[]> {
  const orgId = await resolveOrgId(workspaceId);
  const manager = getProviderManager();
  const catalog = manager.list('llm' as FrameworkProviderType);

  const { data: configs } = await getSupabaseAdmin()
    .from('provider_configs')
    .select('provider_key, enabled, priority, settings')
    .eq('org_id', orgId)
    .like('provider_key', 'llm.%')
    .is('deleted_at', null);

  const configMap = new Map(
    (configs ?? []).map((c) => [String(c.provider_key), c] as const)
  );

  type Ranked = { key: string; priority: number; preferred: boolean };
  const ranked: Ranked[] = [];

  for (const p of catalog) {
    const cfg = configMap.get(p.key);
    const enabled = cfg ? Boolean(cfg.enabled) : p.enabled;
    if (!enabled) continue;
    if (!envConfigured(p.key)) continue;
    if (isLlmQuotaCircuitOpen(workspaceId, p.key)) continue;

    const settings = (cfg?.settings ?? {}) as Record<string, unknown>;
    const preferred =
      Boolean(settings.is_preferred) ||
      Number(cfg?.priority ?? 100) === 1 ||
      (manager.getPreferredKey('llm') === p.key &&
        ![...configMap.values()].some(
          (c) =>
            Number(c.priority) === 1 ||
            Boolean((c.settings as Record<string, unknown> | null)?.is_preferred)
        ));

    ranked.push({
      key: p.key,
      priority: preferred ? 0 : Number(cfg?.priority ?? (p.isDefault ? 50 : 100)),
      preferred,
    });
  }

  ranked.sort((a, b) => a.priority - b.priority || a.key.localeCompare(b.key));

  // Dedupe while preserving order
  const seen = new Set<string>();
  const chain: string[] = [];
  for (const r of ranked) {
    if (seen.has(r.key)) continue;
    seen.add(r.key);
    chain.push(r.key);
  }

  // If DB left us empty but env has keys, fall back to env order via manager preferred first
  if (!chain.length) {
    const preferred = manager.getPreferredKey('llm');
    for (const key of [
      preferred,
      'llm.gemini',
      'llm.mistral',
      'llm.openai',
      'llm.deepseek',
      'llm.openrouter',
      'llm.ollama',
    ]) {
      if (seen.has(key)) continue;
      if (!envConfigured(key)) continue;
      if (isLlmQuotaCircuitOpen(workspaceId, key)) continue;
      seen.add(key);
      chain.push(key);
    }
  }

  return chain;
}

export type LlmFailoverResult = AICompleteResult & {
  failoverUsed: boolean;
  chainSummary: string;
  attempted: string[];
};

/**
 * Complete with real provider failover for content generation.
 * - Preferred from DB Select
 * - ≤1 same-provider retry on retryable errors
 * - Quota 429 → circuit open, skip immediately
 * - Exhaust all enabled providers before failing
 */
export async function completeLlmWithFailover(params: {
  workspaceId: string;
  messages: Array<{ role: string; content: string }>;
  options?: Record<string, unknown>;
}): Promise<LlmFailoverResult> {
  const chain = await resolveLlmProviderChain(params.workspaceId);
  if (!chain.length) {
    throw new Error(
      'No LLM provider available. Enable and configure an LLM (e.g. llm.mistral) in Providers.'
    );
  }

  const hops: string[] = [];
  let lastErr: unknown;
  let hopsSinceStart = 0;

  for (let i = 0; i < chain.length; i++) {
    const key = chain[i]!;
    if (isLlmQuotaCircuitOpen(params.workspaceId, key)) {
      hops.push(`${shortName(key)}: skipped (quota-exhausted)`);
      continue;
    }

    const client = createProviderClient(key);
    if (!client) {
      hops.push(`${shortName(key)}: unconfigured`);
      continue;
    }

    const maxAttempts = 2;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const t0 = Date.now();
      try {
        const result = await client.complete(params.messages, {
          timeoutMs: 60_000,
          ...params.options,
        });
        const latencyMs = Date.now() - t0;
        const failoverUsed = hopsSinceStart > 0 || i > 0;
        await recordProviderInvocation({
          workspaceId: params.workspaceId,
          providerKey: key,
          success: true,
          latencyMs,
          failoverEvents: failoverUsed ? 1 : 0,
        }).catch(() => undefined);

        if (failoverUsed && chain[0] && chain[0] !== key) {
          await recordProviderFailoverHop({
            workspaceId: params.workspaceId,
            fromProviderKey: chain[0],
            toProviderKey: key,
            reason: hops.join(' → ') || 'auto_failover',
          }).catch(() => undefined);
        }

        hops.push(`${shortName(key)}: ok`);
        const chainSummary = hops.join(' → ');
        logger.info(
          { workspaceId: params.workspaceId, provider: key, chainSummary, failoverUsed },
          'LLM completeWithFailover succeeded'
        );
        return {
          text: result.text,
          usage: result.usage,
          provider: key,
          failoverUsed,
          chainSummary,
          attempted: [...hops],
        };
      } catch (err) {
        lastErr = err;
        const latencyMs = Date.now() - t0;
        const msg = err instanceof Error ? err.message : String(err);
        await recordProviderInvocation({
          workspaceId: params.workspaceId,
          providerKey: key,
          success: false,
          latencyMs,
        }).catch(() => undefined);

        if (isQuotaExhaustedError(err)) {
          openLlmQuotaCircuit(params.workspaceId, key);
          hops.push(`${shortName(key)}: quota 429`);
          hopsSinceStart++;
          break;
        }

        if (isRetryableProviderError(err) && attempt === 0) {
          logger.warn(
            { providerKey: key, attempt: 1, err: msg.slice(0, 160) },
            'LLM same-provider retry'
          );
          continue;
        }

        hops.push(`${shortName(key)}: ${msg.slice(0, 100)}`);
        hopsSinceStart++;
        break;
      }
    }
  }

  const chainSummary = hops.join(' → ');
  const detail =
    chainSummary ||
    (lastErr instanceof Error ? lastErr.message : String(lastErr ?? 'unknown'));
  throw Object.assign(new Error(`LLM failover exhausted: ${detail}`), {
    code: 'LLM_FAILOVER_EXHAUSTED',
    hops,
    chainSummary,
    cause: lastErr,
  });
}

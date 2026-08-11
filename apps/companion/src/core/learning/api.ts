/**
 * Shared learning client — uploads corrections to Backlink Agent (not chrome.storage).
 */
import type { DomainFieldMapping, FillableRole } from '../types';
import { companionLog } from '../diagnostics/connection';

export type LearningAuth = {
  apiBase: string;
  accessToken: string;
  orgId: string;
  projectId: string;
};

let auth: LearningAuth | null = null;
/** domain → mappings (in-memory cache from API) */
const cache = new Map<string, DomainFieldMapping[]>();
const listeners = new Set<() => void>();

function emit(): void {
  for (const cb of listeners) {
    try {
      cb();
    } catch {
      /* ignore */
    }
  }
}

export function onLearningChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function setLearningAuth(next: LearningAuth | null): void {
  auth = next
    ? {
        apiBase: String(next.apiBase).replace(/\/$/, ''),
        accessToken: String(next.accessToken),
        orgId: String(next.orgId),
        projectId: String(next.projectId),
      }
    : null;
  companionLog('learning.auth_set', { hasAuth: Boolean(auth), orgId: auth?.orgId ?? null });
}

export function getLearningAuth(): LearningAuth | null {
  return auth;
}

export function clearLearningCache(): void {
  cache.clear();
  emit();
}

function normalizeHost(host: string): string {
  return String(host ?? '')
    .trim()
    .toLowerCase()
    .replace(/^www\./, '');
}

export function getCachedMappings(hostname: string): DomainFieldMapping[] {
  return cache.get(normalizeHost(hostname)) ?? [];
}

export function setCachedMappings(hostname: string, mappings: DomainFieldMapping[]): void {
  cache.set(normalizeHost(hostname), mappings);
  emit();
}

/** Convert verified mappings into alias boosts for mergeAliasLists */
export function mappingsToAliasBoost(
  mappings: DomainFieldMapping[]
): Partial<Record<FillableRole, string[]>> {
  const out: Partial<Record<FillableRole, string[]>> = {};
  for (const m of mappings) {
    const role = m.mappedTo as FillableRole;
    if (role === ('skip' as FillableRole) || !m.websiteField) continue;
    if (!out[role]) out[role] = [];
    out[role]!.push(m.websiteField.replace(/_/g, ' '));
    out[role]!.push(m.websiteField);
  }
  return out;
}

export async function fetchDomainKnowledge(hostname: string): Promise<DomainFieldMapping[]> {
  if (!auth) return getCachedMappings(hostname);
  const domain = normalizeHost(hostname);
  try {
    const res = await fetch(
      `${auth.apiBase}/v1/learning/domain/${encodeURIComponent(domain)}`,
      {
        headers: {
          Authorization: `Bearer ${auth.accessToken}`,
          'X-Org-Id': auth.orgId,
          Accept: 'application/json',
        },
      }
    );
    if (!res.ok) {
      companionLog('learning.fetch_failed', { status: res.status, domain }, 'warn');
      return getCachedMappings(hostname);
    }
    const json = (await res.json()) as {
      data?: { fieldMappings?: DomainFieldMapping[] };
    };
    const mappings = Array.isArray(json.data?.fieldMappings) ? json.data!.fieldMappings! : [];
    setCachedMappings(domain, mappings);
    companionLog('learning.fetch_ok', { domain, count: mappings.length });
    return mappings;
  } catch (err) {
    companionLog(
      'learning.fetch_error',
      { domain, error: err instanceof Error ? err.message : String(err) },
      'error'
    );
    return getCachedMappings(hostname);
  }
}

export async function uploadFieldMapping(input: {
  domain: string;
  websiteField: string;
  mappedTo: string;
  confidence?: number;
  verifiedBy?: string;
}): Promise<boolean> {
  if (!auth) {
    companionLog('learning.upload_no_auth', {}, 'warn');
    return false;
  }
  const domain = normalizeHost(input.domain);
  try {
    const res = await fetch(`${auth.apiBase}/v1/learning/field-mapping`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${auth.accessToken}`,
        'X-Org-Id': auth.orgId,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        domain,
        websiteField: input.websiteField,
        mappedTo: input.mappedTo,
        confidence: input.confidence ?? 1,
        verifiedBy: input.verifiedBy ?? 'user',
      }),
    });
    if (!res.ok) {
      companionLog('learning.upload_failed', { status: res.status, domain }, 'error');
      return false;
    }
    const json = (await res.json()) as {
      data?: { fieldMappings?: DomainFieldMapping[] };
    };
    if (Array.isArray(json.data?.fieldMappings)) {
      setCachedMappings(domain, json.data!.fieldMappings!);
    } else {
      const prev = getCachedMappings(domain);
      const next = [
        ...prev.filter(
          (m) =>
            m.websiteField.toLowerCase() !== input.websiteField.toLowerCase()
        ),
        {
          websiteField: input.websiteField,
          mappedTo: input.mappedTo,
          confidence: input.confidence ?? 1,
          verifiedBy: input.verifiedBy ?? 'user',
        },
      ];
      setCachedMappings(domain, next);
    }
    companionLog('learning.upload_ok', {
      domain,
      websiteField: input.websiteField,
      mappedTo: input.mappedTo,
    });
    return true;
  } catch (err) {
    companionLog(
      'learning.upload_error',
      { error: err instanceof Error ? err.message : String(err) },
      'error'
    );
    return false;
  }
}

export function createDomainLearningHook() {
  return {
    getDomainMappings(hostname: string) {
      return getCachedMappings(hostname);
    },
    getDomainAliases(hostname: string) {
      return mappingsToAliasBoost(getCachedMappings(hostname));
    },
    rememberMapping() {
      /* uploads go through uploadFieldMapping / Teach UI */
    },
  };
}

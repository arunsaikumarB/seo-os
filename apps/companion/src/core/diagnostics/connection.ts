/**
 * Connection handshake diagnostics — Phase 2.1 (no storage).
 * Tokens never logged in full.
 */

export type YesNo = 'Yes' | 'No';

export type ConnectionDiagnostics = {
  messageReceived: YesNo;
  tokenValid: YesNo;
  packageRequestStarted: YesNo;
  apiReachable: YesNo;
  authenticated: YesNo;
  packageLoaded: YesNo;
  connected: YesNo;
  opportunityId: string | null;
  domain: string | null;
  lastError: string | null;
  lastStage: string | null;
  lastHttpStatus: number | null;
  updatedAt: string | null;
};

const DEFAULT: ConnectionDiagnostics = {
  messageReceived: 'No',
  tokenValid: 'No',
  packageRequestStarted: 'No',
  apiReachable: 'No',
  authenticated: 'No',
  packageLoaded: 'No',
  connected: 'No',
  opportunityId: null,
  domain: null,
  lastError: null,
  lastStage: null,
  lastHttpStatus: null,
  updatedAt: null,
};

let state: ConnectionDiagnostics = { ...DEFAULT };
const listeners = new Set<(d: ConnectionDiagnostics) => void>();

export function redactToken(token: string | null | undefined): {
  present: boolean;
  length: number;
  fingerprint: string | null;
} {
  if (!token) return { present: false, length: 0, fingerprint: null };
  return {
    present: true,
    length: token.length,
    fingerprint: `${token.slice(0, 8)}…${token.slice(-4)}`,
  };
}

export function summarizePackageBody(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object') return { empty: true };
  const d = data as Record<string, unknown>;
  const pkg = (d.package ?? {}) as Record<string, unknown>;
  const keys = Object.keys(pkg);
  const filled = keys.filter((k) => String(pkg[k] ?? '').trim().length > 0);
  return {
    connected: d.connected ?? null,
    opportunityId: d.opportunityId ?? null,
    packageId: d.packageId ?? null,
    projectId: d.projectId ?? null,
    domain: d.domain ?? null,
    packageFieldsFilled: filled.length,
    filledKeys: filled,
  };
}

export function companionLog(
  stage: string,
  payload: Record<string, unknown> = {},
  level: 'info' | 'warn' | 'error' = 'info'
): void {
  const entry = {
    scope: 'seo-os-companion',
    stage,
    ts: new Date().toISOString(),
    href: typeof location !== 'undefined' ? location.href.split('#')[0] : undefined,
    ...payload,
  };
  const line = `[SEO OS Companion] ${stage}`;
  if (level === 'error') console.error(line, entry);
  else if (level === 'warn') console.warn(line, entry);
  else console.info(line, entry);
}

function emit(): void {
  state = { ...state, updatedAt: new Date().toISOString() };
  for (const cb of listeners) {
    try {
      cb({ ...state });
    } catch {
      /* ignore */
    }
  }
}

export function getDiagnostics(): ConnectionDiagnostics {
  return { ...state };
}

export function patchDiagnostics(partial: Partial<ConnectionDiagnostics>): ConnectionDiagnostics {
  state = { ...state, ...partial };
  emit();
  return getDiagnostics();
}

export function resetDiagnostics(): ConnectionDiagnostics {
  state = { ...DEFAULT };
  emit();
  return getDiagnostics();
}

export function onDiagnosticsChange(cb: (d: ConnectionDiagnostics) => void): () => void {
  listeners.add(cb);
  cb(getDiagnostics());
  return () => listeners.delete(cb);
}

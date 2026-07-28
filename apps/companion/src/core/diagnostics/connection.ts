/**
 * Connection handshake diagnostics + structured logging.
 * Tokens are never logged in full — only length + prefix fingerprint.
 */

export type YesNo = 'Yes' | 'No';

export type ConnectionDiagnostics = {
  handoffCreated: YesNo;
  tokenPresent: YesNo;
  apiReachable: YesNo;
  authenticated: YesNo;
  packageLoaded: YesNo;
  opportunityId: string | null;
  lastError: string | null;
  lastStage: string | null;
  lastHttpStatus: number | null;
  tokenSource: 'none' | 'url' | 'postMessage' | 'storage' | null;
  updatedAt: string | null;
};

const DIAG_KEY = 'seoOsCompanion.diagnostics';

const DEFAULT: ConnectionDiagnostics = {
  handoffCreated: 'No',
  tokenPresent: 'No',
  apiReachable: 'No',
  authenticated: 'No',
  packageLoaded: 'No',
  opportunityId: null,
  lastError: null,
  lastStage: null,
  lastHttpStatus: null,
  tokenSource: null,
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
  const fp = `${token.slice(0, 8)}…${token.slice(-4)}`;
  return { present: true, length: token.length, fingerprint: fp };
}

/** Safe package summary for logs — no full business copy */
export function summarizePackageBody(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object') return { empty: true };
  const d = data as Record<string, unknown>;
  const pkg = (d.package ?? {}) as Record<string, unknown>;
  const keys = Object.keys(pkg);
  const filled = keys.filter((k) => String(pkg[k] ?? '').trim().length > 0);
  return {
    opportunityId: d.opportunityId ?? null,
    packageId: d.packageId ?? null,
    domain: d.domain ?? null,
    workspaceId: d.workspaceId ? '[present]' : null,
    packageFieldKeys: keys,
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

function persist(): void {
  state = { ...state, updatedAt: new Date().toISOString() };
  try {
    chrome.storage?.local?.set({ [DIAG_KEY]: state });
  } catch {
    /* ignore */
  }
  for (const cb of listeners) {
    try {
      cb(state);
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
  persist();
  return getDiagnostics();
}

export function resetDiagnostics(): ConnectionDiagnostics {
  state = { ...DEFAULT };
  persist();
  return getDiagnostics();
}

export function onDiagnosticsChange(cb: (d: ConnectionDiagnostics) => void): () => void {
  listeners.add(cb);
  cb(getDiagnostics());
  return () => listeners.delete(cb);
}

export async function loadDiagnosticsFromStorage(): Promise<ConnectionDiagnostics> {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get([DIAG_KEY], (r) => {
        const v = r?.[DIAG_KEY];
        if (v && typeof v === 'object') {
          state = { ...DEFAULT, ...(v as ConnectionDiagnostics) };
        }
        resolve(getDiagnostics());
      });
    } catch {
      resolve(getDiagnostics());
    }
  });
}

/** Web-app structured logger (same shape, different scope prefix) */
export function webHandoffLog(
  stage: string,
  payload: Record<string, unknown> = {},
  level: 'info' | 'warn' | 'error' = 'info'
): void {
  const entry = {
    scope: 'seo-os-web-handoff',
    stage,
    ts: new Date().toISOString(),
    ...payload,
  };
  const line = `[SEO OS Handoff] ${stage}`;
  if (level === 'error') console.error(line, entry);
  else if (level === 'warn') console.warn(line, entry);
  else console.info(line, entry);
}

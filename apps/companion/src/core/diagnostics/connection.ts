/**
 * Connection diagnostics — Phase 2.2 (no tokens).
 */
export type YesNo = 'Yes' | 'No';

export type ConnectionDiagnostics = {
  connected: YesNo;
  packageLoaded: YesNo;
  opportunityId: string | null;
  domain: string | null;
  fieldCount: number;
  generatedAt: string | null;
  lastError: string | null;
  lastStage: string | null;
  updatedAt: string | null;
};

const DEFAULT: ConnectionDiagnostics = {
  connected: 'No',
  packageLoaded: 'No',
  opportunityId: null,
  domain: null,
  fieldCount: 0,
  generatedAt: null,
  lastError: null,
  lastStage: null,
  updatedAt: null,
};

let state: ConnectionDiagnostics = { ...DEFAULT };
const listeners = new Set<(d: ConnectionDiagnostics) => void>();

export function companionLog(
  stage: string,
  payload: Record<string, unknown> = {},
  level: 'info' | 'warn' | 'error' = 'info'
): void {
  const entry = {
    scope: 'BacklinkAgent-companion',
    stage,
    ts: new Date().toISOString(),
    href: typeof location !== 'undefined' ? location.href.split('#')[0] : undefined,
    ...payload,
  };
  const line = `[Backlink Agent Companion] ${stage}`;
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

export function onDiagnosticsChange(cb: (d: ConnectionDiagnostics) => void): () => void {
  listeners.add(cb);
  cb(getDiagnostics());
  return () => listeners.delete(cb);
}

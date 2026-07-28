/**
 * In-memory Companion runtime — Phase 2.1
 * No chrome.storage / localStorage / sessionStorage. Refresh = new handoff.
 */
import type { OpportunityPackageFields } from '../types';
import { companionLog, patchDiagnostics } from '../diagnostics/connection';

export type ConnectionState =
  | 'waiting_for_handoff'
  | 'loading_package'
  | 'connected'
  | 'error';

export type RuntimeMemory = {
  connectionState: ConnectionState;
  opportunityId: string | null;
  packageId: string | null;
  projectId: string | null;
  domain: string | null;
  entryUrl: string | null;
  currentPackage: OpportunityPackageFields | null;
  /** Transient — cleared immediately after successful package load */
  pendingToken: string | null;
  lastError: string | null;
};

const EMPTY_PACKAGE: OpportunityPackageFields = {
  title: '',
  url: '',
  description: '',
  shortDescription: '',
  businessName: '',
  email: '',
  phone: '',
  category: '',
  facebook: '',
  linkedin: '',
  twitter: '',
  address: '',
  city: '',
  state: '',
  country: '',
  zip: '',
};

let memory: RuntimeMemory = {
  connectionState: 'waiting_for_handoff',
  opportunityId: null,
  packageId: null,
  projectId: null,
  domain: null,
  entryUrl: null,
  currentPackage: null,
  pendingToken: null,
  lastError: null,
};

type Listener = (m: RuntimeMemory) => void;
const listeners = new Set<Listener>();

function emit(): void {
  const snap = getMemory();
  for (const cb of listeners) {
    try {
      cb(snap);
    } catch {
      /* ignore */
    }
  }
}

export function getMemory(): RuntimeMemory {
  return { ...memory, currentPackage: memory.currentPackage ? { ...memory.currentPackage } : null };
}

export function onMemoryChange(cb: Listener): () => void {
  listeners.add(cb);
  cb(getMemory());
  return () => listeners.delete(cb);
}

export function resetMemory(reason = 'reset'): void {
  companionLog('memory.reset', { reason });
  memory = {
    connectionState: 'waiting_for_handoff',
    opportunityId: null,
    packageId: null,
    projectId: null,
    domain: null,
    entryUrl: null,
    currentPackage: null,
    pendingToken: null,
    lastError: null,
  };
  patchDiagnostics({
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
    lastStage: 'memory.reset',
  });
  emit();
}

export function setPendingToken(token: string): void {
  memory.pendingToken = token;
  memory.connectionState = 'loading_package';
  memory.lastError = null;
  emit();
}

export function clearPendingToken(): void {
  memory.pendingToken = null;
  emit();
}

export function takePendingToken(): string | null {
  const t = memory.pendingToken;
  memory.pendingToken = null;
  return t;
}

export function setError(error: string, stage: string): void {
  memory.connectionState = 'error';
  memory.lastError = error;
  memory.pendingToken = null;
  companionLog('memory.error', { error, stage }, 'error');
  patchDiagnostics({
    connected: 'No',
    lastError: error,
    lastStage: stage,
  });
  emit();
}

export function hydrateFromPackage(input: {
  opportunityId: string;
  packageId?: string;
  projectId?: string;
  domain: string;
  entryUrl?: string;
  package: OpportunityPackageFields;
  source: 'postMessage' | 'api';
}): void {
  memory = {
    connectionState: 'connected',
    opportunityId: input.opportunityId,
    packageId: input.packageId ?? null,
    projectId: input.projectId ?? null,
    domain: input.domain,
    entryUrl: input.entryUrl ?? null,
    currentPackage: { ...EMPTY_PACKAGE, ...input.package },
    pendingToken: null, // forget token immediately
    lastError: null,
  };
  companionLog('memory.hydrated', {
    source: input.source,
    opportunityId: input.opportunityId,
    domain: input.domain,
    filledKeys: Object.entries(memory.currentPackage!)
      .filter(([, v]) => String(v).trim())
      .map(([k]) => k),
  });
  const diagPatch: Parameters<typeof patchDiagnostics>[0] = {
    packageLoaded: 'Yes',
    connected: 'Yes',
    authenticated: 'Yes',
    opportunityId: input.opportunityId,
    domain: input.domain,
    lastError: null,
    lastStage: `memory.hydrated.${input.source}`,
  };
  if (input.source === 'api') diagPatch.apiReachable = 'Yes';
  patchDiagnostics(diagPatch);
  emit();
}

export function packageFieldCount(pkg: OpportunityPackageFields | null): number {
  if (!pkg) return 0;
  return Object.values(pkg).filter((v) => String(v ?? '').trim().length > 0).length;
}

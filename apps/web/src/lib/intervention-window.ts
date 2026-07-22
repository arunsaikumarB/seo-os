/** Open the SEO OS helper tab (not an embedded Playwright view). */

export const INTERVENTION_CHANNEL = 'seo-os-intervention';

export type InterventionChannelMessage =
  | { type: 'resumed'; projectId: string; jobId: string; website?: string; message?: string }
  | { type: 'opened'; projectId: string; jobId: string }
  | { type: 'skipped'; projectId: string; jobId: string }
  | { type: 'all_done'; projectId: string };

export function interventionWindowUrl(
  projectId: string,
  jobId: string,
  opts?: { completeAll?: boolean }
): string {
  const base = `${window.location.origin}/projects/${projectId}/intervene`;
  const q = new URLSearchParams({ jobId });
  if (opts?.completeAll) q.set('completeAll', '1');
  return `${base}?${q.toString()}`;
}

const openHandles = new Map<string, Window | null>();

export function openInterventionWindow(
  projectId: string,
  jobId: string,
  opts?: { completeAll?: boolean }
): Window | null {
  const key = `${projectId}:${jobId}`;
  const existing = openHandles.get(key);
  if (existing && !existing.closed) {
    existing.focus();
    return existing;
  }
  const features =
    'popup=yes,width=520,height=640,menubar=no,toolbar=no,location=no,status=no,scrollbars=yes,resizable=yes';
  const win = window.open(
    interventionWindowUrl(projectId, jobId, opts),
    `seo-os-intervene-${jobId}`,
    features
  );
  openHandles.set(key, win);
  return win;
}

export function openAllInterventionWindows(projectId: string, jobIds: string[]): void {
  for (const jobId of jobIds) {
    openInterventionWindow(projectId, jobId);
  }
}

/**
 * Phase 4.6 — Complete All: open one paused site at a time, wait for AI resume, then next.
 * Never opens all tabs at once; user never searches for the next website.
 */
export function waitForInterventionResume(
  projectId: string,
  jobId: string,
  timeoutMs = 30 * 60_000
): Promise<{ message?: string }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let ch: BroadcastChannel | null = null;

    const cleanup = () => {
      try {
        ch?.close();
      } catch {
        /* ignore */
      }
      window.removeEventListener('storage', onStorage);
      window.clearTimeout(timer);
    };

    const finish = (message?: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ message });
    };

    const onMsg = (ev: MessageEvent<InterventionChannelMessage>) => {
      const msg = ev.data;
      if (!msg || msg.type !== 'resumed') return;
      if (msg.projectId !== projectId || msg.jobId !== jobId) return;
      finish(msg.message);
    };

    const onStorage = (e: StorageEvent) => {
      if (e.key !== 'seo-os-intervention-resumed' || !e.newValue) return;
      try {
        const msg = JSON.parse(e.newValue) as {
          projectId: string;
          jobId: string;
          message?: string;
        };
        if (msg.projectId !== projectId || msg.jobId !== jobId) return;
        finish(msg.message);
      } catch {
        /* ignore */
      }
    };

    try {
      ch = new BroadcastChannel(INTERVENTION_CHANNEL);
      ch.addEventListener('message', onMsg);
    } catch {
      /* BroadcastChannel unavailable — storage fallback */
    }
    window.addEventListener('storage', onStorage);

    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('Timed out waiting for intervention completion'));
    }, timeoutMs);
  });
}

export async function runCompleteAllSequence(
  projectId: string,
  jobIds: string[],
  onStep?: (info: {
    index: number;
    total: number;
    jobId: string;
    phase: 'opening' | 'waiting' | 'done' | 'finished';
  }) => void
): Promise<void> {
  const unique = [...new Set(jobIds.filter(Boolean))];
  const total = unique.length;
  for (let i = 0; i < unique.length; i++) {
    const jobId = unique[i]!;
    onStep?.({ index: i, total, jobId, phase: 'opening' });
    openInterventionWindow(projectId, jobId, { completeAll: true });
    onStep?.({ index: i, total, jobId, phase: 'waiting' });
    try {
      await waitForInterventionResume(projectId, jobId);
    } catch {
      /* continue to next so queue keeps draining */
    }
    onStep?.({ index: i, total, jobId, phase: 'done' });
  }
  onStep?.({ index: total, total, jobId: '', phase: 'finished' });
  try {
    const ch = new BroadcastChannel(INTERVENTION_CHANNEL);
    ch.postMessage({ type: 'all_done', projectId } satisfies InterventionChannelMessage);
    ch.close();
  } catch {
    /* ignore */
  }
}

export function openRealWebsiteTab(url: string, jobId: string): Window | null {
  try {
    const normalized = normalizeSiteUrl(url);
    if (!normalized) return null;
    return window.open(normalized, `seo-os-site-${jobId}`, 'noopener,noreferrer');
  } catch {
    return null;
  }
}

export function normalizeSiteUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  if (/^[a-z0-9.-]+\.[a-z]{2,}/i.test(t)) return `https://${t.replace(/^www\./i, '')}`;
  return null;
}

export function notifyInterventionResumed(msg: {
  projectId: string;
  jobId: string;
  website?: string;
  message?: string;
}) {
  try {
    const ch = new BroadcastChannel(INTERVENTION_CHANNEL);
    ch.postMessage({ type: 'resumed', ...msg } satisfies InterventionChannelMessage);
    ch.close();
  } catch {
    /* BroadcastChannel unavailable */
  }
  try {
    localStorage.setItem(
      'seo-os-intervention-resumed',
      JSON.stringify({ ...msg, at: Date.now() })
    );
  } catch {
    /* ignore */
  }
}

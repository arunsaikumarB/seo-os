/** Open the SEO OS helper tab (not an embedded Playwright view). */

export const INTERVENTION_CHANNEL = 'seo-os-intervention';

export type InterventionChannelMessage =
  | { type: 'resumed'; projectId: string; jobId: string; website?: string; message?: string }
  | { type: 'opened'; projectId: string; jobId: string };

export function interventionWindowUrl(projectId: string, jobId: string): string {
  const base = `${window.location.origin}/projects/${projectId}/intervene`;
  return `${base}?jobId=${encodeURIComponent(jobId)}`;
}

const openHandles = new Map<string, Window | null>();

export function openInterventionWindow(projectId: string, jobId: string): Window | null {
  const key = `${projectId}:${jobId}`;
  const existing = openHandles.get(key);
  if (existing && !existing.closed) {
    existing.focus();
    return existing;
  }
  // Compact helper — real website opens from the helper page itself
  const features =
    'popup=yes,width=520,height=640,menubar=no,toolbar=no,location=no,status=no,scrollbars=yes,resizable=yes';
  const win = window.open(
    interventionWindowUrl(projectId, jobId),
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
  // domain-only
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

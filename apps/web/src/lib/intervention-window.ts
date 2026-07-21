/** Helpers to open the lightweight intervention browser window (no AppShell). */

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
  const features =
    'popup=yes,width=1280,height=900,menubar=no,toolbar=no,location=no,status=no,scrollbars=yes,resizable=yes';
  const win = window.open(interventionWindowUrl(projectId, jobId), `seo-os-intervene-${jobId}`, features);
  openHandles.set(key, win);
  return win;
}

export function openAllInterventionWindows(
  projectId: string,
  jobIds: string[]
): void {
  for (const jobId of jobIds) {
    openInterventionWindow(projectId, jobId);
  }
}

export function focusOrOpenIntervention(projectId: string, jobId?: string | null): void {
  if (jobId) {
    openInterventionWindow(projectId, jobId);
    return;
  }
}

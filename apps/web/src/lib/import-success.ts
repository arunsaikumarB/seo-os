/** True when at least one import produced rows / opportunities (not “opened the page”). */
export function isSuccessfulImportRecord(row: {
  status?: string | null;
  opportunities_created?: number | null;
  valid_rows?: number | null;
  total_rows?: number | null;
}): boolean {
  const s = String(row.status ?? '').toLowerCase();
  // Opportunities already in DB unlock later steps even if pipeline later errored
  if (Number(row.opportunities_created ?? 0) > 0) return true;
  // Failed with zero opportunities must not look successful from valid_rows alone
  if (['failed', 'error', 'cancelled', 'canceled'].includes(s)) return false;
  if (
    ['completed', 'complete', 'classified', 'done', 'success', 'analyzed'].includes(s) &&
    (Number(row.valid_rows ?? 0) > 0 || Number(row.total_rows ?? 0) > 0)
  ) {
    return true;
  }
  return false;
}

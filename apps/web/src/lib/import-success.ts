/** True when at least one import produced rows / opportunities (not “opened the page”). */
export function isSuccessfulImportRecord(row: {
  status?: string | null;
  opportunities_created?: number | null;
  valid_rows?: number | null;
  total_rows?: number | null;
}): boolean {
  if (Number(row.opportunities_created ?? 0) > 0) return true;
  if (Number(row.valid_rows ?? 0) > 0) return true;
  const s = String(row.status ?? '').toLowerCase();
  if (['failed', 'error', 'cancelled', 'canceled'].includes(s)) return false;
  if (
    ['completed', 'complete', 'classified', 'done', 'success', 'analyzed'].includes(s) &&
    Number(row.total_rows ?? 0) > 0
  ) {
    return true;
  }
  return false;
}

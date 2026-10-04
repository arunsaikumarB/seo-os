import { AppError } from '@seo-os/shared';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * PostgREST `or` filter matching the image_submission_requirements RLS policy
 * for a single authorized project: shared catalog rows (workspace_id IS NULL)
 * plus rows owned by that workspace.
 *
 * The service-role client bypasses RLS, so this predicate is the tenant boundary.
 */
export function workspaceOrGlobalFilter(workspaceId: string): string {
  if (!UUID_RE.test(workspaceId)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Workspace id must be a UUID');
  }
  return `workspace_id.is.null,workspace_id.eq.${workspaceId}`;
}

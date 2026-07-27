/**
 * Phase 13 — Workflow stepper progress from CSM (API).
 */
import {
  deriveWorkflowProgressInput,
  getWorkflowProgress,
  type WorkflowProgress,
  type WorkflowProgressInput,
} from '@seo-os/backlink-builder';
import { listCampaignItems } from './campaign-state.service.js';
import { getProjectByWorkspaceId } from '../projects/project.service.js';
import { getSupabaseAdmin } from '../../lib/supabase.js';

function projectIsReady(project: {
  domain?: string | null;
  url?: string | null;
} | null): boolean {
  if (!project) return false;
  const domain = String(project.domain ?? '').trim();
  if (!domain) return false;
  // URL is preferred but many workspaces store domain only at create
  const url = String(project.url ?? '').trim();
  return Boolean(url || domain);
}

async function workspaceHasReport(workspaceId: string): Promise<boolean> {
  const { count, error } = await getSupabaseAdmin()
    .from('reports')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId);
  if (error) return false;
  return (count ?? 0) > 0;
}

/** Shared selector used by every stepper / learning-mode consumer. */
export async function getWorkflowProgressForWorkspace(
  workspaceId: string
): Promise<{ input: WorkflowProgressInput; progress: WorkflowProgress }> {
  const [items, project, hasReport] = await Promise.all([
    listCampaignItems(workspaceId, { includeDeleted: false }),
    getProjectByWorkspaceId(workspaceId),
    workspaceHasReport(workspaceId),
  ]);

  const input = deriveWorkflowProgressInput({
    projectReady: projectIsReady(project),
    items,
    hasReport,
  });

  return { input, progress: getWorkflowProgress(input) };
}

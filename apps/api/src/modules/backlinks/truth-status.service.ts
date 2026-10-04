/**
 * Persist scanner verdicts and approval reviews on the opportunity.
 * Verification is scheduled only after a person reports a real submission.
 */

import { randomUUID } from 'node:crypto';
import {
  approvalReview,
  buildApprovalPrompt,
  resolveExecutionMode,
  type UrlScanVerdict,
} from '@seo-os/backlink-builder';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { enqueueJob, QUEUES } from '../../jobs/boss.js';
import { scanLiveUrl } from './url-scanner.service.js';
import { reviewWithConfiguredAi } from './ai-draft.service.js';

async function readOpportunity(workspaceId: string, opportunityId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from('opportunities')
    .select('*')
    .eq('id', opportunityId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Opportunity not found');
  return data as Record<string, unknown>;
}

function metaOf(row: Record<string, unknown>): Record<string, unknown> {
  const metadata = row.metadata;
  return metadata && typeof metadata === 'object' ? { ...(metadata as Record<string, unknown>) } : {};
}

export async function scanOpportunity(workspaceId: string, opportunityId: string) {
  const row = await readOpportunity(workspaceId, opportunityId);
  const url = String(row.url ?? '');
  if (!url) throw new Error('Opportunity has no URL to scan');
  const verdict = await scanLiveUrl({
    url,
    category: row.opportunity_type ? String(row.opportunity_type) : null,
  });
  const metadata = metaOf(row);
  metadata.scan = verdict;
  metadata.truth_status = verdict.truthStatus;
  const { error } = await getSupabaseAdmin()
    .from('opportunities')
    .update({ metadata, updated_at: new Date().toISOString() })
    .eq('id', opportunityId)
    .eq('workspace_id', workspaceId);
  if (error) throw error;
  return verdict;
}

export async function reviewOpportunity(
  workspaceId: string,
  opportunityId: string,
  opts: { confirm?: boolean; niche?: string | null } = {}
) {
  const row = await readOpportunity(workspaceId, opportunityId);
  const metadata = metaOf(row);
  const verdict = (metadata.scan ?? null) as UrlScanVerdict | null;
  const category = verdict?.suggestedCategory ?? null;
  const mode = !verdict
    ? { mode: 'stop' as const, reason: 'The URL has not been scanned.' }
    : !category
      ? { mode: 'stop' as const, reason: `No category. ${verdict.nextAction}` }
      : resolveExecutionMode(category, verdict);
  const pageText = verdict?.pageExcerpt || String(row.title ?? '');
  const niche = opts.niche?.trim() || '';
  const ai = await reviewWithConfiguredAi(
    buildApprovalPrompt({
      niche,
      pageText,
      url: String(row.url ?? ''),
      workflowMode: mode.mode,
      workflowReason: mode.reason,
      verdict,
    })
  );
  const review = approvalReview({
    niche,
    title: verdict?.title || String(row.title ?? ''),
    pageText,
    workflowMode: mode.mode === 'stop' ? 'stop' : mode.mode,
    verdict,
    aiText: ai?.text ?? null,
    aiSource: ai?.source ?? null,
  });
  metadata.approval = review;
  if (review.decision === 'reject') metadata.truth_status = review.source === 'rules' ? 'rules_rejected' : 'ai_rejected';
  else if (!opts.confirm) metadata.truth_status = 'awaiting_human';
  else if (review.decision === 'approve') metadata.truth_status = review.source === 'rules' ? 'rules_approved' : 'ai_approved';
  else metadata.truth_status = 'awaiting_human';

  const patch: Record<string, unknown> = { metadata, updated_at: new Date().toISOString() };
  if (opts.confirm && review.decision === 'approve') {
    patch.pipeline_stage = 'approved';
  }
  const { error } = await getSupabaseAdmin()
    .from('opportunities')
    .update(patch)
    .eq('id', opportunityId)
    .eq('workspace_id', workspaceId);
  if (error) throw error;
  return { review, moved: Boolean(opts.confirm && review.decision === 'approve') };
}

export async function reportHumanSubmission(input: {
  workspaceId: string;
  opportunityId: string;
  sourceUrl: string;
  targetUrl?: string | null;
  anchorText?: string | null;
}) {
  const row = await readOpportunity(input.workspaceId, input.opportunityId);
  const domain = String(row.domain ?? '');
  let backlinkId = '';
  const { data: existing } = await getSupabaseAdmin()
    .from('backlinks')
    .select('id')
    .eq('workspace_id', input.workspaceId)
    .eq('opportunity_id', input.opportunityId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing?.id) backlinkId = String(existing.id);
  if (!backlinkId) {
    backlinkId = randomUUID();
    const { error } = await getSupabaseAdmin().from('backlinks').insert({
      id: backlinkId,
      workspace_id: input.workspaceId,
      opportunity_id: input.opportunityId,
      backlink_type: String(row.opportunity_type ?? 'directory'),
      source_url: input.sourceUrl,
      target_url: input.targetUrl ?? null,
      anchor_text: input.anchorText ?? null,
      domain: domain || new URL(input.sourceUrl).hostname,
      verification_status: 'pending',
    });
    if (error) throw error;
  }
  await enqueueJob(
    QUEUES.CRAWL,
    'backlink_verify',
    {
      type: 'backlink_verify',
      workspaceId: input.workspaceId,
      backlinkId,
      attempt: 0,
    },
    { singletonKey: `verify-${backlinkId}-0`, startAfter: 0 }
  );
  const metadata = metaOf(row);
  metadata.truth_status = 'pending_verification';
  metadata.reported_source_url = input.sourceUrl;
  await getSupabaseAdmin()
    .from('opportunities')
    .update({
      metadata,
      automation_status: 'submitted',
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.opportunityId);
  return { backlinkId, verification: 'pending', truthStatus: 'pending_verification' };
}

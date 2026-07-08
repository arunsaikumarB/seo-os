import { randomUUID } from 'node:crypto';
import { approvalTitle, type ApprovalRequest } from '@seo-os/campaign-engine';
import { getSupabaseAdmin } from '../../lib/supabase.js';

export { approvalTitle };

export async function listApprovals(workspaceId: string, status?: string) {
  let query = getSupabaseAdmin()
    .from('approvals')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function createApproval(
  workspaceId: string,
  userId: string,
  request: ApprovalRequest
) {
  const id = randomUUID();
  const { data, error } = await getSupabaseAdmin()
    .from('approvals')
    .insert({
      id,
      workspace_id: workspaceId,
      approval_type: request.approvalType,
      subject_id: request.subjectId,
      subject_type: request.subjectType,
      title: request.title,
      summary: request.summary,
      metadata: request.metadata ?? {},
      requested_by: userId,
      status: 'pending',
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function resolveApproval(
  approvalId: string,
  workspaceId: string,
  userId: string,
  action: 'approve' | 'reject',
  notes?: string
) {
  const { data: approval } = await getSupabaseAdmin()
    .from('approvals')
    .select('*')
    .eq('id', approvalId)
    .eq('workspace_id', workspaceId)
    .single();

  if (!approval || approval.status !== 'pending') {
    throw new Error('Approval not found or already resolved');
  }

  const status = action === 'approve' ? 'approved' : 'rejected';

  const { data, error } = await getSupabaseAdmin()
    .from('approvals')
    .update({
      status,
      reviewed_by: userId,
      review_notes: notes,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', approvalId)
    .select()
    .single();
  if (error) throw error;

  if (approval.approval_type === 'campaign_launch' && action === 'approve') {
    await getSupabaseAdmin()
      .from('campaigns')
      .update({ status: 'active', started_at: new Date().toISOString() })
      .eq('id', approval.subject_id)
      .eq('workspace_id', workspaceId);
    await getSupabaseAdmin().from('campaign_timeline_events').insert({
      id: randomUUID(),
      campaign_id: approval.subject_id,
      workspace_id: workspaceId,
      event_type: 'campaign.launched',
      title: 'Campaign launched after approval',
      payload: { approvalId },
    });
  }

  if (approval.approval_type === 'email_draft') {
    await getSupabaseAdmin()
      .from('email_drafts')
      .update({ status: action === 'approve' ? 'approved' : 'rejected' })
      .eq('id', approval.subject_id);
  }

  if (approval.approval_type === 'content_draft') {
    await getSupabaseAdmin()
      .from('content_drafts')
      .update({ status: action === 'approve' ? 'approved' : 'rejected' })
      .eq('id', approval.subject_id);
  }

  return data;
}

export async function getPendingApprovalCount(workspaceId: string) {
  const { count, error } = await getSupabaseAdmin()
    .from('approvals')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('status', 'pending');
  if (error) throw error;
  return count ?? 0;
}

export async function createEmailDraft(
  workspaceId: string,
  userId: string,
  input: { subject: string; body: string; campaignId?: string }
) {
  const id = randomUUID();
  const { data, error } = await getSupabaseAdmin()
    .from('email_drafts')
    .insert({
      id,
      workspace_id: workspaceId,
      campaign_id: input.campaignId ?? null,
      subject: input.subject,
      body: input.body,
      status: 'draft',
      created_by: userId,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function submitEmailDraftForApproval(
  draftId: string,
  workspaceId: string,
  userId: string
) {
  const { data: draft } = await getSupabaseAdmin()
    .from('email_drafts')
    .select('*')
    .eq('id', draftId)
    .single();
  if (!draft) throw new Error('Draft not found');

  await getSupabaseAdmin()
    .from('email_drafts')
    .update({ status: 'pending_approval' })
    .eq('id', draftId);

  return createApproval(workspaceId, userId, {
    approvalType: 'email_draft',
    subjectId: draftId,
    subjectType: 'email_draft',
    title: approvalTitle('email_draft', draft.subject),
    summary: draft.body.slice(0, 200),
  });
}

export async function createContentDraft(
  workspaceId: string,
  userId: string,
  input: { title: string; body: string; campaignId?: string }
) {
  const id = randomUUID();
  const { data, error } = await getSupabaseAdmin()
    .from('content_drafts')
    .insert({
      id,
      workspace_id: workspaceId,
      campaign_id: input.campaignId ?? null,
      title: input.title,
      body: input.body,
      status: 'draft',
      created_by: userId,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function submitContentDraftForApproval(
  draftId: string,
  workspaceId: string,
  userId: string
) {
  const { data: draft } = await getSupabaseAdmin()
    .from('content_drafts')
    .select('*')
    .eq('id', draftId)
    .single();
  if (!draft) throw new Error('Draft not found');

  await getSupabaseAdmin()
    .from('content_drafts')
    .update({ status: 'pending_approval' })
    .eq('id', draftId);

  return createApproval(workspaceId, userId, {
    approvalType: 'content_draft',
    subjectId: draftId,
    subjectType: 'content_draft',
    title: approvalTitle('content_draft', draft.title),
    summary: draft.body.slice(0, 200),
  });
}

export async function listDrafts(workspaceId: string) {
  const [emails, content] = await Promise.all([
    getSupabaseAdmin().from('email_drafts').select('*').eq('workspace_id', workspaceId),
    getSupabaseAdmin().from('content_drafts').select('*').eq('workspace_id', workspaceId),
  ]);
  return { emailDrafts: emails.data ?? [], contentDrafts: content.data ?? [] };
}

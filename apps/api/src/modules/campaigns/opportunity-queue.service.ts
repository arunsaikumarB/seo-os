import { randomUUID } from 'node:crypto';
import { recommendOpportunities } from '@seo-os/campaign-engine';
import type { CampaignType } from '@seo-os/campaign-engine';
import {
  contentTypesForOpportunity,
  generateContent,
  buildPrefillPayload,
  estimateApprovalHours,
  estimateReviewHours,
  type ContentDraftType,
} from '@seo-os/backlink-builder';
import { AppError, isAppError } from '@seo-os/shared';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { getProjectById } from '../projects/project.service.js';
import { publishPlatformEvent } from '../platform/event-bus.service.js';
import { logger } from '../../lib/logger.js';

export async function listOpportunityQueue(
  workspaceId: string,
  filters?: {
    queueStatus?: string;
    campaignType?: string;
  }
) {
  let query = getSupabaseAdmin()
    .from('opportunities')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('priority', { ascending: false })
    .order('score', { ascending: false });

  if (filters?.queueStatus) query = query.eq('queue_status', filters.queueStatus);
  if (filters?.campaignType) query = query.eq('opportunity_type', filters.campaignType);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getOpportunityRecommendations(
  workspaceId: string,
  campaignType?: CampaignType
) {
  const opportunities = await listOpportunityQueue(workspaceId, {
    queueStatus: 'pending_review',
  });
  const typed = opportunities.map((o) => ({
    ...o,
    score: Number(o.score),
    opportunity_type: o.opportunity_type as string,
  }));
  return recommendOpportunities(typed, campaignType ?? 'guest_post', 10);
}

function inferAssistedMode(type: string): string {
  if (type === 'directory' || type === 'citation') return 'directory';
  if (type === 'profile') return 'profile';
  if (type === 'forum') return 'forum';
  if (type === 'qa_site') return 'qa';
  return 'manual';
}

type CreatedArtifacts = {
  aiDraftIds: string[];
  contentDraftId: string | null;
  submissionId: string | null;
  submissionCreated: boolean;
  historyId: string | null;
};

async function rollbackApproval(
  workspaceId: string,
  opportunityId: string,
  previous: Record<string, unknown>,
  created: CreatedArtifacts
) {
  logger.warn({ opportunityId, created }, 'Rolling back opportunity approval artifacts');

  await getSupabaseAdmin()
    .from('opportunities')
    .update({
      queue_status: previous.queue_status,
      status: previous.status,
      pipeline_stage: previous.pipeline_stage,
      automation_status: previous.automation_status,
      metadata: previous.metadata ?? {},
    })
    .eq('id', opportunityId)
    .eq('workspace_id', workspaceId);

  if (created.submissionCreated && created.submissionId) {
    await getSupabaseAdmin().from('backlink_submissions').delete().eq('id', created.submissionId);
  }
  if (created.aiDraftIds.length) {
    await getSupabaseAdmin().from('backlink_ai_drafts').delete().in('id', created.aiDraftIds);
  }
  if (created.contentDraftId) {
    await getSupabaseAdmin().from('content_drafts').delete().eq('id', created.contentDraftId);
  }
  if (created.historyId) {
    await getSupabaseAdmin().from('backlink_history').delete().eq('id', created.historyId);
  }
}

/**
 * Approve opportunity and hand off to the next workflow stages.
 * Creates/links draft + submission, marks campaign/execution ready, emits activity.
 * Rolls back on any downstream failure so items are never silently orphaned.
 */
export async function approveOpportunityWorkflow(
  opportunityId: string,
  workspaceId: string,
  userId: string,
  notes?: string,
  orgId?: string
) {
  const { data: opp, error: loadErr } = await getSupabaseAdmin()
    .from('opportunities')
    .select('*')
    .eq('id', opportunityId)
    .eq('workspace_id', workspaceId)
    .single();
  if (loadErr || !opp) {
    throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Opportunity not found');
  }

  const alreadyApproved = opp.queue_status === 'approved' && opp.status === 'approved';

  const previous = {
    queue_status: opp.queue_status,
    status: opp.status,
    pipeline_stage: opp.pipeline_stage,
    automation_status: opp.automation_status,
    metadata: opp.metadata ?? {},
  };

  const created: CreatedArtifacts = {
    aiDraftIds: [],
    contentDraftId: null,
    submissionId: null,
    submissionCreated: false,
    historyId: null,
  };

  try {
    const project = orgId ? await getProjectById(workspaceId, orgId) : null;
    const brand = {
      brandName: project?.name ?? 'our brand',
      projectDomain: project?.domain ?? '',
      industry: project?.industry ?? undefined,
    };
    const oppCtx = {
      title: String(opp.title),
      domain: (opp.domain as string | null) ?? null,
      opportunity_type: String(opp.opportunity_type),
      score: Number(opp.score ?? 0),
      website_name: (opp.website_name as string | null) ?? null,
    };

    // 1) AI / outreach drafts (backlink_ai_drafts) — linked by opportunity_id
    const { data: existingAiDrafts } = await getSupabaseAdmin()
      .from('backlink_ai_drafts')
      .select('id, draft_type')
      .eq('opportunity_id', opportunityId)
      .eq('workspace_id', workspaceId);

    let firstAiDraftId = existingAiDrafts?.[0]?.id as string | undefined;
    if (!existingAiDrafts?.length) {
      const types = contentTypesForOpportunity(String(opp.opportunity_type));
      for (const draftType of types) {
        const content = generateContent(draftType as ContentDraftType, oppCtx, brand);
        const draftId = randomUUID();
        const { error: draftErr } = await getSupabaseAdmin().from('backlink_ai_drafts').insert({
          id: draftId,
          workspace_id: workspaceId,
          opportunity_id: opportunityId,
          draft_type: draftType,
          title: `${draftType.replace(/_/g, ' ')} — ${opp.title}`,
          content,
          status: 'draft',
        });
        if (draftErr) throw draftErr;
        created.aiDraftIds.push(draftId);
        if (!firstAiDraftId) firstAiDraftId = draftId;
      }
    }

    // 2) Content Studio draft (content_drafts) — visible in Campaigns / Content Library
    const prevMeta = (opp.metadata as Record<string, unknown>) ?? {};
    let contentDraftId =
      typeof prevMeta.content_studio_draft_id === 'string'
        ? prevMeta.content_studio_draft_id
        : null;

    if (contentDraftId) {
      const { data: existingCd } = await getSupabaseAdmin()
        .from('content_drafts')
        .select('id')
        .eq('id', contentDraftId)
        .eq('workspace_id', workspaceId)
        .maybeSingle();
      if (!existingCd) contentDraftId = null;
    }

    if (!contentDraftId) {
      const emailBody =
        (await getSupabaseAdmin()
          .from('backlink_ai_drafts')
          .select('content')
          .eq('opportunity_id', opportunityId)
          .eq('draft_type', 'email')
          .limit(1)
          .maybeSingle()).data?.content ??
        generateContent('email', oppCtx, brand);
      contentDraftId = randomUUID();
      const contentRow = {
        id: contentDraftId,
        workspace_id: workspaceId,
        campaign_id: opp.campaign_id ?? null,
        title: `Approved outreach — ${opp.website_name || opp.domain || opp.title}`,
        body: String(emailBody),
        status: 'draft',
        created_by: userId,
      };
      let { error: cdErr } = await getSupabaseAdmin().from('content_drafts').insert(contentRow);
      // Retry without created_by if profile FK is missing in some environments
      if (cdErr) {
        ({ error: cdErr } = await getSupabaseAdmin()
          .from('content_drafts')
          .insert({ ...contentRow, created_by: null }));
      }
      if (cdErr) throw cdErr;
      created.contentDraftId = contentDraftId;
    }

    // 3) Submission Queue entry
    const { data: existingSub } = await getSupabaseAdmin()
      .from('backlink_submissions')
      .select('id, queue_stage, metadata')
      .eq('opportunity_id', opportunityId)
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let submissionId = existingSub?.id as string | undefined;
    if (submissionId) {
      const subMeta = {
        ...((existingSub?.metadata as Record<string, unknown>) ?? {}),
        draft_id: firstAiDraftId ?? null,
        content_studio_draft_id: contentDraftId,
        approved_from_opportunity_queue: true,
        approved_at: new Date().toISOString(),
        approved_by: userId,
      };
      const { error: subUpErr } = await getSupabaseAdmin()
        .from('backlink_submissions')
        .update({
          queue_stage: 'awaiting_review',
          tracking_status: 'awaiting_approval',
          status: 'prepared',
          metadata: subMeta,
        })
        .eq('id', submissionId);
      if (subUpErr) throw subUpErr;
    } else {
      submissionId = randomUUID();
      const { error: subInsErr } = await getSupabaseAdmin().from('backlink_submissions').insert({
        id: submissionId,
        workspace_id: workspaceId,
        opportunity_id: opportunityId,
        submission_type: String(opp.opportunity_type),
        assisted_mode: inferAssistedMode(String(opp.opportunity_type)),
        status: 'prepared',
        tracking_status: 'awaiting_approval',
        queue_stage: 'awaiting_review',
        estimated_review_hours: estimateReviewHours(String(opp.opportunity_type)),
        estimated_approval_hours: estimateApprovalHours(String(opp.opportunity_type)),
        prefill_payload: buildPrefillPayload({
          brandName: brand.brandName,
          projectDomain: brand.projectDomain,
          industry: brand.industry,
          opportunityTitle: String(opp.title),
          opportunityDomain: String(opp.domain ?? ''),
          opportunityType: String(opp.opportunity_type),
        }),
        metadata: {
          generated_by: 'opportunity_approval',
          draft_id: firstAiDraftId ?? null,
          content_studio_draft_id: contentDraftId,
          approved_from_opportunity_queue: true,
          approved_at: new Date().toISOString(),
          approved_by: userId,
        },
      });
      if (subInsErr) throw subInsErr;
      created.submissionId = submissionId;
      created.submissionCreated = true;
    }

    // 4) Update opportunity — approved + next-stage readiness
    const nextMeta = {
      ...prevMeta,
      reviewNotes: notes ?? prevMeta.reviewNotes ?? null,
      content_studio_draft_id: contentDraftId,
      ai_draft_id: firstAiDraftId ?? prevMeta.ai_draft_id ?? null,
      submission_id: submissionId,
      workflow: {
        ...(typeof prevMeta.workflow === 'object' && prevMeta.workflow
          ? (prevMeta.workflow as Record<string, unknown>)
          : {}),
        approved_at: new Date().toISOString(),
        approved_by: userId,
        destination_stage: 'submission_queue',
        campaign_eligible: true,
        execution_ready: true,
        submission_id: submissionId,
        content_studio_draft_id: contentDraftId,
      },
    };

    const { data: updated, error: updErr } = await getSupabaseAdmin()
      .from('opportunities')
      .update({
        queue_status: 'approved',
        status: 'approved',
        pipeline_stage: 'campaign_ready',
        automation_status: 'approved',
        campaign_lifecycle: 'Approved',
        campaign_step: 'approve',
        metadata: nextMeta,
        updated_at: new Date().toISOString(),
      })
      .eq('id', opportunityId)
      .eq('workspace_id', workspaceId)
      .select()
      .single();
    if (updErr || !updated) throw updErr ?? new Error('Failed to update opportunity');

    try {
      const { updateCampaignItem } = await import('./campaign-state.service.js');
      await updateCampaignItem(workspaceId, opportunityId, {
        currentStatus: 'Approved',
        approval: 'approved',
        reviewDecision: 'Approved',
        approvedBy: 'user',
        force: true,
      });
    } catch {
      /* CSM columns may not exist until migration 087 */
    }

    // 5) Activity / history (skip duplicate history on idempotent re-approve)
    if (!alreadyApproved) {
      const historyId = randomUUID();
      const { error: histErr } = await getSupabaseAdmin().from('backlink_history').insert({
        id: historyId,
        workspace_id: workspaceId,
        opportunity_id: opportunityId,
        event_type: 'opportunity.approved',
        title: 'Approved — moved to Submission Queue',
        actor_id: userId,
        metadata: {
          submissionId,
          contentDraftId,
          aiDraftId: firstAiDraftId ?? null,
          destination_stage: 'submission_queue',
          notes: notes ?? null,
        },
      });
      if (histErr) throw histErr;
      created.historyId = historyId;

      await publishPlatformEvent({
        workspaceId,
        orgId: orgId ?? null,
        sourceModule: 'campaigns',
        eventType: 'approval_granted',
        title: `Opportunity approved — ${opp.domain || opp.title}`,
        summary: `Moved to Submission Queue · draft linked · campaign/execution ready`,
        severity: 'approval',
        entityType: 'opportunity',
        entityId: opportunityId,
        actorId: userId,
        payload: {
          submissionId,
          contentDraftId,
          aiDraftId: firstAiDraftId ?? null,
          destination_stage: 'submission_queue',
          campaign_eligible: true,
          execution_ready: true,
        },
        audit: {
          action: 'opportunity.approve',
          resourceType: 'opportunity',
          resourceId: opportunityId,
          before: previous,
          after: {
            queue_status: 'approved',
            status: 'approved',
            pipeline_stage: 'campaign_ready',
            submission_id: submissionId,
          },
        },
      });
    }

    if (created.submissionCreated || created.aiDraftIds.length || created.contentDraftId) {
      await publishPlatformEvent({
        workspaceId,
        orgId: orgId ?? null,
        sourceModule: 'backlink_builder',
        eventType: 'submission_created',
        title: `Submission Queue updated — ${opp.domain || opp.title}`,
        severity: 'success',
        entityType: 'backlink_submission',
        entityId: submissionId,
        actorId: userId,
        payload: { opportunityId, created: created.submissionCreated },
      });
    }

    return {
      opportunity: updated,
      submissionId,
      contentDraftId,
      aiDraftId: firstAiDraftId ?? null,
      destination_stage: 'submission_queue' as const,
    };
  } catch (err) {
    // Only rollback if we had not already been approved (avoid wiping prior good state)
    if (!alreadyApproved) {
      await rollbackApproval(workspaceId, opportunityId, previous, created);
    } else {
      // Clean only newly created artifacts on repair attempts
      if (created.submissionCreated && created.submissionId) {
        await getSupabaseAdmin().from('backlink_submissions').delete().eq('id', created.submissionId);
      }
      if (created.aiDraftIds.length) {
        await getSupabaseAdmin().from('backlink_ai_drafts').delete().in('id', created.aiDraftIds);
      }
      if (created.contentDraftId) {
        await getSupabaseAdmin().from('content_drafts').delete().eq('id', created.contentDraftId);
      }
    }
    if (isAppError(err) && err.status === 404) throw err;
    const message = err instanceof Error ? err.message : 'Approval failed';
    logger.error({ err, opportunityId }, 'Opportunity approval failed — rolled back');
    throw new AppError(
      500,
      'INTERNAL_ERROR',
      `Could not complete approval handoff: ${message}. Opportunity left in previous state.`
    );
  }
}

export async function reviewOpportunity(
  opportunityId: string,
  workspaceId: string,
  userId: string,
  action: 'approve' | 'reject',
  notes?: string,
  orgId?: string
) {
  if (action === 'approve') {
    const result = await approveOpportunityWorkflow(
      opportunityId,
      workspaceId,
      userId,
      notes,
      orgId
    );
    return result.opportunity;
  }

  const { data: existing } = await getSupabaseAdmin()
    .from('opportunities')
    .select('metadata')
    .eq('id', opportunityId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  const meta = {
    ...((existing?.metadata as Record<string, unknown>) ?? {}),
    reviewNotes: notes ?? null,
    rejected_at: new Date().toISOString(),
    rejected_by: userId,
  };

  const { data, error } = await getSupabaseAdmin()
    .from('opportunities')
    .update({
      queue_status: 'rejected',
      status: 'dismissed',
      pipeline_stage: 'lost',
      automation_status: 'rejected',
      campaign_lifecycle: 'Rejected',
      campaign_step: 'approve',
      metadata: meta,
      updated_at: new Date().toISOString(),
    })
    .eq('id', opportunityId)
    .eq('workspace_id', workspaceId)
    .select()
    .single();
  if (error) throw error;
  try {
    const { updateCampaignItem } = await import('./campaign-state.service.js');
    await updateCampaignItem(workspaceId, opportunityId, {
      currentStatus: 'Rejected',
      approval: 'rejected',
      reviewDecision: 'Rejected',
      approvedBy: 'user',
      force: true,
    });
  } catch {
    /* optional */
  }

  await getSupabaseAdmin().from('backlink_history').insert({
    id: randomUUID(),
    workspace_id: workspaceId,
    opportunity_id: opportunityId,
    event_type: 'opportunity.rejected',
    title: 'Rejected from Opportunity Queue',
    actor_id: userId,
    metadata: { notes: notes ?? null },
  });

  await publishPlatformEvent({
    workspaceId,
    orgId: orgId ?? null,
    sourceModule: 'campaigns',
    eventType: 'approval_rejected',
    title: 'Opportunity rejected',
    severity: 'warning',
    entityType: 'opportunity',
    entityId: opportunityId,
    actorId: userId,
    payload: { notes: notes ?? null },
  });

  return data;
}

export async function bulkReviewOpportunities(
  workspaceId: string,
  userId: string,
  opportunityIds: string[],
  action: 'approve' | 'reject',
  orgId?: string
) {
  const results = [];
  const errors: Array<{ id: string; message: string }> = [];
  for (const id of opportunityIds) {
    try {
      results.push(await reviewOpportunity(id, workspaceId, userId, action, undefined, orgId));
    } catch (err) {
      errors.push({
        id,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
  if (errors.length && results.length === 0) {
    throw new AppError(
      500,
      'INTERNAL_ERROR',
      `All approvals failed: ${errors.map((e) => e.message).join('; ')}`
    );
  }
  return { results, errors };
}

export async function updateOpportunityPriority(
  opportunityId: string,
  workspaceId: string,
  priority: number
) {
  const { data, error } = await getSupabaseAdmin()
    .from('opportunities')
    .update({ priority })
    .eq('id', opportunityId)
    .eq('workspace_id', workspaceId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function enrichOpportunityRecommendations(workspaceId: string) {
  const { data: opps } = await getSupabaseAdmin()
    .from('opportunities')
    .select('id, score')
    .eq('workspace_id', workspaceId)
    .eq('queue_status', 'pending_review');

  for (const opp of opps ?? []) {
    const score = Number(opp.score);
    const recommendation =
      score >= 75
        ? 'Strong fit — approve for campaign'
        : score >= 60
          ? 'Moderate fit — review before approving'
          : 'Low priority — consider rejecting';
    await getSupabaseAdmin()
      .from('opportunities')
      .update({ ai_recommendation: recommendation })
      .eq('id', opp.id);
  }
}

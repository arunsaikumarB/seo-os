/**
 * Campaign State Manager (API) — sole write path + shared selectors for opportunity lifecycle.
 * Import · AI Review · Approve · Generate · Submit · Verification · Reports · Dashboard · Workflow
 * all read counts through getCampaignCounts().
 */
import {
  canTransitionCampaignLifecycle,
  computeCampaignCounts,
  currentStepForLifecycle,
  deriveCampaignLifecycle,
  furthestCampaignLifecycle,
  isCampaignLifecycleStatus,
  legacyFieldsForLifecycle,
  normalizeCampaignWebsiteUrl,
  toPublicExecutionStatus,
  type ApprovedBy,
  type CampaignCounts,
  type CampaignDetailStatus,
  type CampaignItemInput,
  type CampaignLifecycleStatus,
  type GenerationStatus,
  type ReviewDecision,
  type ReviewTier,
  type SubmissionStatus,
} from '@seo-os/backlink-builder';
import { getSupabaseAdmin } from '../../lib/supabase.js';

export type CampaignItemRow = CampaignItemInput & {
  campaignId: string | null;
  classificationLabel: string | null;
  raw: Record<string, unknown>;
};

function detailOf(v: unknown, fallback: CampaignDetailStatus = 'pending'): CampaignDetailStatus {
  const s = String(v ?? fallback);
  if (
    ['pending', 'generating', 'generated', 'failed', 'n/a', 'approved', 'rejected'].includes(s)
  ) {
    return s as CampaignDetailStatus;
  }
  return fallback;
}

function submissionOf(v: unknown): SubmissionStatus {
  const s = String(v ?? 'pending');
  if (
    ['pending', 'Running', 'Waiting Human', 'Completed', 'Failed', 'Skipped', 'Deleted', 'Retrying'].includes(
      s
    )
  ) {
    return s as SubmissionStatus;
  }
  return 'pending';
}

/** Load Campaign Items for a workspace (opportunities = Campaign Items). */
export async function listCampaignItems(
  workspaceId: string,
  opts?: { includeDeleted?: boolean }
): Promise<CampaignItemRow[]> {
  const { data: opps } = await getSupabaseAdmin()
    .from('opportunities')
    .select(
      'id, campaign_id, url, domain, website_name, title, opportunity_type, status, queue_status, pipeline_stage, automation_status, campaign_lifecycle, campaign_step, package_status, image_status, metadata_status, video_metadata_status, submission_status, verification_status, last_error, metadata, import_id, domain_analysis_id, confidence_score, review_tier, review_decision, approved_by, duplicate_of_id, generation_status, schema_status, quality_score, retry_count, package_approved_by, created_at, updated_at'
    )
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true })
    .limit(5000);

  const ids = (opps ?? []).map((o) => String(o.id));
  const packsByOpp = new Map<string, { status: string }>();
  const jobsByOpp = new Map<string, { status: string; disposition: string | null }>();

  if (ids.length) {
    const [{ data: packs }, { data: jobs }] = await Promise.all([
      getSupabaseAdmin()
        .from('content_packs')
        .select('opportunity_id, status')
        .eq('workspace_id', workspaceId)
        .in('opportunity_id', ids),
      getSupabaseAdmin()
        .from('execution_jobs')
        .select('opportunity_id, status, disposition, created_at')
        .eq('workspace_id', workspaceId)
        .in('opportunity_id', ids)
        .is('deleted_at', null)
        .order('created_at', { ascending: false }),
    ]);
    for (const p of packs ?? []) {
      if (p.opportunity_id) packsByOpp.set(String(p.opportunity_id), { status: String(p.status) });
    }
    for (const j of jobs ?? []) {
      const oid = j.opportunity_id ? String(j.opportunity_id) : '';
      if (oid && !jobsByOpp.has(oid)) {
        jobsByOpp.set(oid, {
          status: String(j.status),
          disposition: j.disposition != null ? String(j.disposition) : null,
        });
      }
    }
  }

  const items: CampaignItemRow[] = [];
  for (const o of opps ?? []) {
    const meta = (o.metadata as Record<string, unknown>) ?? {};
    const classification =
      typeof meta.classification === 'object' && meta.classification
        ? (meta.classification as Record<string, unknown>)
        : {};
    const pack = packsByOpp.get(String(o.id));
    const job = jobsByOpp.get(String(o.id));
    const execPub = job
      ? toPublicExecutionStatus(job.status, { disposition: job.disposition })
      : null;

    const derived = deriveCampaignLifecycle({
      campaignLifecycle: o.campaign_lifecycle != null ? String(o.campaign_lifecycle) : null,
      automationStatus: o.automation_status != null ? String(o.automation_status) : null,
      queueStatus: o.queue_status != null ? String(o.queue_status) : null,
      pipelineStage: o.pipeline_stage != null ? String(o.pipeline_stage) : null,
      opportunityStatus: o.status != null ? String(o.status) : null,
      hasClassification: Boolean(classification.id || classification.type),
      hasAnalysis: Boolean(o.domain_analysis_id),
      hasImport: Boolean(o.import_id),
      hasContentPack: Boolean(pack),
      contentPackReady: pack?.status === 'ready' || pack?.status === 'approved',
      executionPublicStatus: execPub,
      verificationStatus:
        o.verification_status != null ? String(o.verification_status) : null,
      automationDeleted: String(o.automation_status ?? '') === 'deleted',
    });

    if (!opts?.includeDeleted && derived === 'Deleted') continue;

    const websiteUrl =
      normalizeCampaignWebsiteUrl(String(o.url ?? '')) ??
      (o.domain ? `https://${String(o.domain).replace(/^www\./, '')}` : null);

    items.push({
      id: String(o.id),
      campaignId: o.campaign_id ? String(o.campaign_id) : null,
      websiteUrl,
      domain: o.domain != null ? String(o.domain) : null,
      currentStatus: derived,
      currentStep:
        (o.campaign_step != null ? String(o.campaign_step) : null) ??
        currentStepForLifecycle(derived),
      classification:
        classification.id != null
          ? String(classification.id)
          : o.opportunity_type != null
            ? String(o.opportunity_type)
            : null,
      classificationLabel:
        classification.displayName != null
          ? String(classification.displayName)
          : null,
      approval:
        derived === 'Rejected'
          ? 'rejected'
          : ['Approved', 'Package Generated', 'Ready', 'Submitting', 'Waiting Human', 'Retrying', 'Submitted', 'Verified', 'Completed'].includes(
                derived
              )
            ? 'approved'
            : 'pending',
      packageStatus: detailOf(o.package_status, pack ? 'generated' : 'pending'),
      imageStatus: detailOf(o.image_status, 'n/a'),
      metadataStatus: detailOf(o.metadata_status, 'n/a'),
      videoMetadataStatus: detailOf(o.video_metadata_status, 'n/a'),
      submissionStatus: submissionOf(
        o.submission_status ??
          (execPub === 'Running' || execPub === 'Queued' || execPub === 'Starting'
            ? 'Running'
            : execPub === 'Waiting Human'
              ? 'Waiting Human'
              : execPub === 'Submitted' || execPub === 'Completed'
                ? 'Completed'
                : execPub === 'Failed' || execPub === 'Failed to Start'
                  ? 'Failed'
                  : execPub === 'Skipped'
                    ? 'Skipped'
                    : execPub === 'Deleted'
                      ? 'Deleted'
                      : 'pending')
      ),
      verificationStatus:
        derived === 'Verified' || derived === 'Completed'
          ? 'verified'
          : o.verification_status === 'pending'
            ? 'pending'
            : o.verification_status === 'lost'
              ? 'failed'
              : 'n/a',
      lastError: o.last_error != null ? String(o.last_error) : null,
      createdAt: o.created_at != null ? String(o.created_at) : null,
      updatedAt: o.updated_at != null ? String(o.updated_at) : null,
      hidden: derived === 'Deleted',
      confidenceScore:
        o.confidence_score != null
          ? Number(o.confidence_score)
          : classification.confidence != null
            ? Number(classification.confidence)
            : null,
      reviewTier: (o.review_tier as ReviewTier | null) ?? null,
      reviewDecision: (o.review_decision as ReviewDecision | null) ?? null,
      approvedBy: (o.approved_by as ApprovedBy) ?? null,
      duplicateOfId: o.duplicate_of_id != null ? String(o.duplicate_of_id) : null,
      generationStatus: (o.generation_status as GenerationStatus | null) ?? null,
      schemaStatus: detailOf(o.schema_status, 'pending'),
      qualityScore: o.quality_score != null ? Number(o.quality_score) : null,
      retryCount: o.retry_count != null ? Number(o.retry_count) : 0,
      packageApprovedBy:
        o.package_approved_by === 'auto' || o.package_approved_by === 'user'
          ? o.package_approved_by
          : null,
      raw: o as Record<string, unknown>,
    });
  }

  return items;
}

/** Shared selector — every summary endpoint must call this. */
export async function getCampaignCounts(workspaceId: string): Promise<CampaignCounts> {
  const items = await listCampaignItems(workspaceId, { includeDeleted: true });
  return computeCampaignCounts(items);
}

export type UpdateCampaignItemPatch = {
  currentStatus?: CampaignLifecycleStatus;
  currentStep?: string | null;
  classification?: string | null;
  approval?: 'approved' | 'rejected' | 'pending' | null;
  packageStatus?: CampaignDetailStatus | null;
  imageStatus?: CampaignDetailStatus | null;
  metadataStatus?: CampaignDetailStatus | null;
  videoMetadataStatus?: CampaignDetailStatus | null;
  submissionStatus?: SubmissionStatus | null;
  verificationStatus?: 'pending' | 'verified' | 'failed' | 'n/a' | null;
  lastError?: string | null;
  confidenceScore?: number | null;
  reviewTier?: ReviewTier | null;
  reviewDecision?: ReviewDecision | null;
  approvedBy?: ApprovedBy;
  duplicateOfId?: string | null;
  generationStatus?: GenerationStatus | null;
  schemaStatus?: CampaignDetailStatus | null;
  qualityScore?: number | null;
  retryCount?: number | null;
  packageApprovedBy?: 'auto' | 'user' | null;
  /** Skip transition check (backfill only). */
  force?: boolean;
};

/**
 * Sole write path for Campaign Item lifecycle.
 * Validates transitions, dual-writes legacy columns, touches updated_at.
 */
export async function updateCampaignItem(
  workspaceId: string,
  itemId: string,
  patch: UpdateCampaignItemPatch
): Promise<CampaignItemRow | null> {
  const { data: row } = await getSupabaseAdmin()
    .from('opportunities')
    .select(
      'id, campaign_lifecycle, automation_status, queue_status, pipeline_stage, status, metadata, import_id, domain_analysis_id, package_status'
    )
    .eq('id', itemId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (!row) return null;

  const current = deriveCampaignLifecycle({
    campaignLifecycle: row.campaign_lifecycle != null ? String(row.campaign_lifecycle) : null,
    automationStatus: row.automation_status != null ? String(row.automation_status) : null,
    queueStatus: row.queue_status != null ? String(row.queue_status) : null,
    pipelineStage: row.pipeline_stage != null ? String(row.pipeline_stage) : null,
    opportunityStatus: row.status != null ? String(row.status) : null,
    hasImport: Boolean(row.import_id),
    hasAnalysis: Boolean(row.domain_analysis_id),
    hasContentPack: Boolean(row.package_status && row.package_status !== 'pending'),
    automationDeleted: String(row.automation_status ?? '') === 'deleted',
  });

  const nextStatus = patch.currentStatus ?? current;
  if (patch.currentStatus && !patch.force) {
    if (!canTransitionCampaignLifecycle(current, patch.currentStatus)) {
      const msg = `Illegal campaign lifecycle transition: ${current} → ${patch.currentStatus}`;
      console.error('[CSM]', msg, { workspaceId, itemId });
      await getSupabaseAdmin()
        .from('opportunities')
        .update({
          last_error: msg,
          updated_at: new Date().toISOString(),
        })
        .eq('id', itemId)
        .eq('workspace_id', workspaceId);
      throw Object.assign(new Error(msg), { status: 400, code: 'ILLEGAL_LIFECYCLE_TRANSITION' });
    }
  }

  const legacy = legacyFieldsForLifecycle(nextStatus);
  const update: Record<string, unknown> = {
    campaign_lifecycle: nextStatus,
    campaign_step: patch.currentStep ?? currentStepForLifecycle(nextStatus),
    updated_at: new Date().toISOString(),
    automation_status: legacy.automation_status,
  };
  if (legacy.queue_status) update.queue_status = legacy.queue_status;
  if (legacy.pipeline_stage) update.pipeline_stage = legacy.pipeline_stage;
  if (legacy.status) update.status = legacy.status;

  if (patch.packageStatus != null) update.package_status = patch.packageStatus;
  if (patch.imageStatus != null) update.image_status = patch.imageStatus;
  if (patch.metadataStatus != null) update.metadata_status = patch.metadataStatus;
  if (patch.videoMetadataStatus != null) update.video_metadata_status = patch.videoMetadataStatus;
  if (patch.submissionStatus != null) update.submission_status = patch.submissionStatus;
  if (patch.verificationStatus != null) {
    update.verification_status =
      patch.verificationStatus === 'failed'
        ? 'lost'
        : patch.verificationStatus === 'n/a'
          ? null
          : patch.verificationStatus;
  }
  if (patch.lastError !== undefined) update.last_error = patch.lastError;
  if (patch.confidenceScore !== undefined) update.confidence_score = patch.confidenceScore;
  if (patch.reviewTier !== undefined) update.review_tier = patch.reviewTier;
  if (patch.reviewDecision !== undefined) update.review_decision = patch.reviewDecision;
  if (patch.approvedBy !== undefined) update.approved_by = patch.approvedBy;
  if (patch.duplicateOfId !== undefined) update.duplicate_of_id = patch.duplicateOfId;
  if (patch.generationStatus !== undefined) update.generation_status = patch.generationStatus;
  if (patch.schemaStatus !== undefined) update.schema_status = patch.schemaStatus;
  if (patch.qualityScore !== undefined) update.quality_score = patch.qualityScore;
  if (patch.retryCount !== undefined) update.retry_count = patch.retryCount;
  if (patch.packageApprovedBy !== undefined)
    update.package_approved_by = patch.packageApprovedBy;
  if (patch.classification != null) {
    const meta = (row.metadata as Record<string, unknown>) ?? {};
    const prev =
      typeof meta.classification === 'object' && meta.classification
        ? (meta.classification as Record<string, unknown>)
        : {};
    update.metadata = {
      ...meta,
      classification: { ...prev, id: patch.classification },
    };
  }

  const { error } = await getSupabaseAdmin()
    .from('opportunities')
    .update(update)
    .eq('id', itemId)
    .eq('workspace_id', workspaceId);
  if (error) throw error;

  const items = await listCampaignItems(workspaceId, { includeDeleted: true });
  return items.find((i) => i.id === itemId) ?? null;
}

/** Sync lifecycle from execution job public status (write-back only — does not change BEE engine). */
export async function syncCampaignItemFromExecution(
  workspaceId: string,
  opportunityId: string | null | undefined,
  rawJobStatus: string,
  disposition?: string | null
) {
  if (!opportunityId) return;
  const pub = toPublicExecutionStatus(rawJobStatus, { disposition });
  let next: CampaignLifecycleStatus | null = null;
  let submission: SubmissionStatus | null = null;
  switch (pub) {
    case 'Deleted':
      next = 'Deleted';
      submission = 'Deleted';
      break;
    case 'Ignored':
      next = 'Ignored';
      break;
    case 'Skipped':
      next = 'Skipped';
      submission = 'Skipped';
      break;
    case 'Failed':
    case 'Failed to Start':
      next = 'Failed';
      submission = 'Failed';
      break;
    case 'Waiting Human':
      next = 'Waiting Human';
      submission = 'Waiting Human';
      break;
    case 'Running':
    case 'Starting':
    case 'Queued':
      next = 'Submitting';
      submission = 'Running';
      break;
    case 'Submitted':
    case 'Completed':
      next = 'Submitted';
      submission = 'Completed';
      break;
    case 'Verified':
    case 'Approved':
      next = 'Verified';
      submission = 'Completed';
      break;
    case 'Rejected':
      next = 'Rejected';
      break;
    default:
      break;
  }
  if (!next) return;
  try {
    await updateCampaignItem(workspaceId, opportunityId, {
      currentStatus: next,
      submissionStatus: submission ?? undefined,
      force: true, // execution evidence may jump stages
    });
  } catch (err) {
    console.error('[CSM] sync from execution failed', err);
  }
}

/**
 * Backfill campaign_lifecycle for all opportunities in a workspace.
 * Returns a migration report of conflicts / orphans.
 */
export async function backfillCampaignState(workspaceId: string) {
  const report: Array<{
    website: string;
    opportunityId: string;
    previous: string | null;
    chosen: CampaignLifecycleStatus;
    note?: string;
  }> = [];

  const items = await listCampaignItems(workspaceId, { includeDeleted: true });
  for (const item of items) {
    const prev =
      item.raw.campaign_lifecycle != null ? String(item.raw.campaign_lifecycle) : null;
    if (prev === item.currentStatus) continue;
    await updateCampaignItem(workspaceId, item.id, {
      currentStatus: item.currentStatus,
      packageStatus: item.packageStatus,
      imageStatus: item.imageStatus,
      metadataStatus: item.metadataStatus,
      videoMetadataStatus: item.videoMetadataStatus,
      submissionStatus: item.submissionStatus,
      verificationStatus: item.verificationStatus,
      force: true,
    });
    report.push({
      website: item.websiteUrl ?? item.domain ?? item.id,
      opportunityId: item.id,
      previous: prev,
      chosen: item.currentStatus,
      note: prev && prev !== item.currentStatus ? 'conflict_resolved_to_furthest' : 'initialized',
    });
  }

  // Orphans: execution jobs / packs without opportunity already covered via list.
  // Import rows with no opportunity — create Classified/Analyzed items
  const { data: orphanRows } = await getSupabaseAdmin()
    .from('backlink_import_rows')
    .select('id, normalized_url, normalized_domain, opportunity_id, status, import_id')
    .eq('workspace_id', workspaceId)
    .eq('status', 'valid')
    .is('opportunity_id', null)
    .limit(2000);

  for (const row of orphanRows ?? []) {
    const domain = String(row.normalized_domain ?? '');
    if (!domain) continue;
    const { data: existing } = await getSupabaseAdmin()
      .from('opportunities')
      .select('id')
      .eq('workspace_id', workspaceId)
      .ilike('domain', domain)
      .limit(1)
      .maybeSingle();
    if (existing) {
      report.push({
        website: domain,
        opportunityId: String(existing.id),
        previous: null,
        chosen: 'Imported',
        note: 'orphan_import_row_linked_existing',
      });
      continue;
    }
    const { randomUUID } = await import('node:crypto');
    const id = randomUUID();
    const url =
      normalizeCampaignWebsiteUrl(String(row.normalized_url ?? '')) ?? `https://${domain}`;
    await getSupabaseAdmin().from('opportunities').insert({
      id,
      workspace_id: workspaceId,
      opportunity_type: 'directory',
      title: domain,
      url,
      domain,
      score: 0,
      status: 'discovered',
      pipeline_stage: 'discovered',
      automation_status: 'imported',
      campaign_lifecycle: 'Imported',
      campaign_step: 'import',
      website_name: domain,
      import_id: row.import_id,
      discovery_source: 'import',
      queue_status: 'archived',
      metadata: { orphan_from_import_row: true, import_row_id: row.id },
    });
    await getSupabaseAdmin()
      .from('backlink_import_rows')
      .update({ opportunity_id: id })
      .eq('id', row.id);
    report.push({
      website: domain,
      opportunityId: id,
      previous: null,
      chosen: 'Imported',
      note: 'orphan_created',
    });
  }

  const counts = await getCampaignCounts(workspaceId);
  return { report, counts, itemCount: (await listCampaignItems(workspaceId, { includeDeleted: true })).length };
}

export function projectAutomationSummaryFromCounts(counts: CampaignCounts) {
  return {
    importedWebsites: counts.imported,
    totalImports: counts.imported,
    analyzedWebsites: counts.analyzed,
    qualifiedOpportunities: counts.classified,
    pendingApproval: counts.byStatus.Classified,
    submitted: counts.submitted,
    verified: counts.verified,
    rejected: counts.rejected,
    waiting: counts.waiting,
    // Keep keys present for response shape compat
    contentGenerated: counts.packageGenerated,
    published: counts.byStatus.Completed,
    accepted: counts.verified,
    statusBreakdown: Object.fromEntries(
      Object.entries(counts.byStatus).map(([k, v]) => [k.toLowerCase().replace(/\s+/g, '_'), v])
    ),
  };
}

export function projectDashboardFromCounts(counts: CampaignCounts) {
  return {
    totalOpportunities: counts.imported,
    discovered: counts.byStatus.Imported + counts.byStatus.Analyzed,
    qualified: counts.byStatus.Classified,
    approved: counts.byStatus.Approved,
    campaign_ready: counts.byStatus.Ready + counts.byStatus['Package Generated'] + counts.byStatus.Approved,
    outreach_running: counts.submitting + counts.waiting + counts.retrying,
    won: counts.submitted,
    lost: counts.rejected + counts.skipped + counts.ignored,
    verified: counts.verified,
    pending: counts.byStatus.Submitted, // awaiting verification
    outreach_ready: counts.ready + counts.byStatus['Package Generated'] + counts.byStatus.Approved,
  };
}

export { furthestCampaignLifecycle, isCampaignLifecycleStatus };

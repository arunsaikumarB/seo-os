/**
 * Phase 3 — Content generation pipeline.
 * All lifecycle / generation_status writes go through CSM updateCampaignItem.
 */
import {
  CONTENT_GEN_DEFAULT_CONCURRENCY,
  CONTENT_GEN_MAX_RETRIES,
  assertPackageAssetsComplete,
  computeGenerationProgress,
  qualityFailureReason,
  tierFromQualityScore,
  type CampaignDetailStatus,
  type GenerationStatus,
} from '@seo-os/backlink-builder';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { enqueueJob, QUEUES } from '../../jobs/boss.js';
import { logger } from '../../lib/logger.js';
import {
  listCampaignItems,
  updateCampaignItem,
  type CampaignItemRow,
} from './campaign-state.service.js';
import { createContentPack, createMediaBrief } from '../backlinks/v11.service.js';

export type ContentGenStage =
  | 'all'
  | 'images'
  | 'metadata'
  | 'video_metadata';

export type ContentGenBulkAction =
  | 'generate_all'
  | 'generate_selected'
  | 'retry_failed'
  | 'retry_missing_images'
  | 'retry_missing_metadata'
  | 'retry_missing_videos'
  | 'approve_selected'
  | 'approve_all'
  | 'reject_selected'
  | 'delete_packages'
  | 'export_packages';

const DEFAULT_AVG = {
  avgDurationMs: 45_000,
  avgTokens: 15_000,
  avgImages: 3,
  avgCostUsd: 0.08,
  samples: 0,
};

function contentGenConcurrency(): number {
  const raw = Number(process.env.CONTENT_GEN_CONCURRENCY);
  if (Number.isFinite(raw) && raw >= 1 && raw <= 16) return Math.floor(raw);
  return CONTENT_GEN_DEFAULT_CONCURRENCY;
}

function formatDuration(ms: number): string {
  const secs = Math.max(0, Math.round(ms / 1000));
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

async function getStats(workspaceId: string) {
  const { data } = await getSupabaseAdmin()
    .from('content_generation_stats')
    .select('*')
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (!data) return { ...DEFAULT_AVG, isEstimate: true as const };
  return {
    avgDurationMs: Number(data.avg_duration_ms ?? DEFAULT_AVG.avgDurationMs),
    avgTokens: Number(data.avg_tokens ?? DEFAULT_AVG.avgTokens),
    avgImages: Number(data.avg_images ?? DEFAULT_AVG.avgImages),
    avgCostUsd: Number(data.avg_cost_usd ?? DEFAULT_AVG.avgCostUsd),
    samples: Number(data.samples ?? 0),
    isEstimate: Number(data.samples ?? 0) < 1,
  };
}

async function recordSample(
  workspaceId: string,
  sample: { durationMs: number; tokens?: number; images?: number; costUsd?: number }
) {
  const prev = await getStats(workspaceId);
  const n = prev.samples + 1;
  const blend = (old: number, next: number) => (old * prev.samples + next) / n;
  const row = {
    workspace_id: workspaceId,
    avg_duration_ms: blend(prev.avgDurationMs, sample.durationMs),
    avg_tokens: blend(prev.avgTokens, sample.tokens ?? prev.avgTokens),
    avg_images: blend(prev.avgImages, sample.images ?? prev.avgImages),
    avg_cost_usd: blend(prev.avgCostUsd, sample.costUsd ?? prev.avgCostUsd),
    samples: n,
    updated_at: new Date().toISOString(),
  };
  await getSupabaseAdmin().from('content_generation_stats').upsert(row, {
    onConflict: 'workspace_id',
  });
}

function isEnqueueSkip(status: GenerationStatus | null | undefined): boolean {
  return status === 'Queued' || status === 'Generating' || status === 'Completed';
}

async function enqueueItemJob(
  workspaceId: string,
  opportunityId: string,
  stage: ContentGenStage = 'all',
  opts?: { startAfter?: number; manualRetry?: boolean }
): Promise<string | null> {
  return enqueueJob(
    QUEUES.LOW,
    'content_generate',
    {
      type: 'content_generate',
      workspaceId,
      opportunityId,
      stage,
      manualRetry: Boolean(opts?.manualRetry),
    },
    {
      singletonKey: `content-gen-${opportunityId}-${stage}`,
      startAfter: opts?.startAfter,
      retryLimit: 0,
    }
  );
}

export async function getContentGenerationBoard(workspaceId: string) {
  const items = await listCampaignItems(workspaceId, { includeDeleted: false });
  const progress = computeGenerationProgress(items);
  const stats = await getStats(workspaceId);
  const concurrency = contentGenConcurrency();

  const approvedPlain = items.filter(
    (i) =>
      i.currentStatus === 'Approved' &&
      (i.generationStatus == null ||
        i.generationStatus === 'Failed' ||
        i.generationStatus === 'Needs Review')
  );
  const generatingItems = items
    .filter((i) => i.generationStatus === 'Generating')
    .map((i) => ({
      id: i.id,
      website: i.websiteUrl ?? i.domain ?? i.id,
      stage: currentStageLabel(i),
    }));

  const remaining = progress.queued + progress.generating;
  const etaMs =
    progress.completed + progress.failed + progress.needsReview >= 3
      ? (remaining * stats.avgDurationMs) / concurrency
      : null;

  const websitesForEstimate = Math.max(
    progress.approved,
    approvedPlain.length +
      progress.queued +
      progress.generating +
      progress.completed +
      progress.needsReview +
      progress.failed
  );
  const countForCard = progress.active
    ? progress.queued + progress.generating + progress.completed + progress.failed + progress.needsReview
    : items.filter((i) => i.currentStatus === 'Approved').length;

  const estimatePrefix = stats.isEstimate ? '~estimate ' : '';

  const reviewQueue = items
    .filter(
      (i) => i.generationStatus === 'Needs Review' || i.generationStatus === 'Failed'
    )
    .map(toReviewRow);

  const generationAudit = {
    packages: assetAudit(items, (i) => i.packageStatus),
    images: assetAudit(items, (i) => i.imageStatus),
    metadata: assetAudit(items, (i) => i.metadataStatus),
    videoMetadata: assetAudit(items, (i) => i.videoMetadataStatus),
    schema: assetAudit(items, (i) => i.schemaStatus),
  };

  const orphans = await findOrphanAssets(workspaceId, items);

  return {
    progress,
    estimates: {
      websites: countForCard,
      durationLabel: `${estimatePrefix}${formatDuration(
        (Math.max(countForCard, 1) * stats.avgDurationMs) / concurrency
      )}`,
      tokensLabel: `${estimatePrefix}~${Math.round(
        stats.avgTokens * Math.max(countForCard, 1)
      ).toLocaleString()}`,
      imagesLabel: `${estimatePrefix}${Math.round(stats.avgImages * Math.max(countForCard, 1))}`,
      costLabel: `${estimatePrefix}$${(stats.avgCostUsd * Math.max(countForCard, 1)).toFixed(2)}`,
      isDefaultEstimate: stats.isEstimate,
      samples: stats.samples,
      concurrency,
    },
    eta:
      progress.active && etaMs != null
        ? formatDuration(etaMs)
        : progress.active
          ? 'estimating…'
          : null,
    current: generatingItems,
    reviewQueue,
    generationAudit,
    orphans,
    metricsSource: 'campaign_state' as const,
    dashboardCard: {
      title: progress.active ? 'AI is generating content' : 'Content generation',
      approved: progress.approved,
      completed: progress.completed,
      generating: progress.generating,
      waiting: progress.waiting,
      failed: progress.failed,
      needsReview: progress.needsReview,
      eta:
        progress.active && etaMs != null
          ? formatDuration(etaMs)
          : progress.active
            ? 'estimating…'
            : null,
    },
    websitesForEstimate,
  };
}

function assetAudit(
  items: CampaignItemRow[],
  pick: (i: CampaignItemRow) => CampaignDetailStatus | null | undefined
) {
  let generated = 0;
  let missingFailed = 0;
  for (const i of items) {
    if (i.currentStatus === 'Deleted') continue;
    const s = pick(i);
    if (s === 'generated' || s === 'approved') generated++;
    else if (s === 'failed' || s === 'pending' || s === 'generating' || !s) missingFailed++;
  }
  return { generated, missingFailed };
}

function currentStageLabel(i: CampaignItemRow): string {
  if (i.schemaStatus === 'generating') return 'Generating Schema';
  if (i.videoMetadataStatus === 'generating') return 'Generating Video Metadata';
  if (i.imageStatus === 'generating') return 'Generating Images';
  if (i.metadataStatus === 'generating') return 'Generating Metadata';
  if (i.packageStatus === 'generating') return 'Generating Article';
  return 'Generating';
}

function toReviewRow(i: CampaignItemRow) {
  return {
    id: i.id,
    website: i.websiteUrl ?? i.domain ?? i.id,
    generationStatus: i.generationStatus,
    qualityScore: i.qualityScore,
    packageStatus: i.packageStatus,
    imageStatus: i.imageStatus,
    metadataStatus: i.metadataStatus,
    videoMetadataStatus: i.videoMetadataStatus,
    schemaStatus: i.schemaStatus,
    lastError: i.lastError,
    retryCount: i.retryCount ?? 0,
    currentStatus: i.currentStatus,
  };
}

async function findOrphanAssets(workspaceId: string, items: CampaignItemRow[]) {
  const ids = new Set(items.map((i) => i.id));
  const orphans: Array<{ table: string; id: string; opportunityId: string | null }> = [];

  const { data: packs } = await getSupabaseAdmin()
    .from('content_packs')
    .select('id, opportunity_id')
    .eq('workspace_id', workspaceId)
    .limit(2000);
  for (const p of packs ?? []) {
    const oid = p.opportunity_id != null ? String(p.opportunity_id) : null;
    if (!oid || !ids.has(oid)) {
      orphans.push({ table: 'content_packs', id: String(p.id), opportunityId: oid });
    }
  }

  const { data: briefs } = await getSupabaseAdmin()
    .from('media_asset_briefs')
    .select('id, opportunity_id')
    .eq('workspace_id', workspaceId)
    .limit(2000);
  for (const b of briefs ?? []) {
    const oid = b.opportunity_id != null ? String(b.opportunity_id) : null;
    if (!oid || !ids.has(oid)) {
      orphans.push({ table: 'media_asset_briefs', id: String(b.id), opportunityId: oid });
    }
  }

  const { data: images } = await getSupabaseAdmin()
    .from('image_assets')
    .select('id, opportunity_id')
    .eq('workspace_id', workspaceId)
    .not('opportunity_id', 'is', null)
    .limit(2000);
  for (const img of images ?? []) {
    const oid = img.opportunity_id != null ? String(img.opportunity_id) : null;
    if (oid && !ids.has(oid)) {
      orphans.push({ table: 'image_assets', id: String(img.id), opportunityId: oid });
    }
  }

  return { count: orphans.length, items: orphans.slice(0, 50) };
}

export async function enqueueContentGeneration(
  workspaceId: string,
  opts: {
    itemIds?: string[];
    stage?: ContentGenStage;
    manualRetry?: boolean;
    onlyFailed?: boolean;
  } = {}
) {
  const items = await listCampaignItems(workspaceId, { includeDeleted: false });
  const stage = opts.stage ?? 'all';
  let queued = 0;
  let skipped = 0;
  const skipReasons: string[] = [];

  const targets = items.filter((i) => {
    if (opts.itemIds?.length) return opts.itemIds.includes(i.id);
    if (opts.onlyFailed) return i.generationStatus === 'Failed';
    return i.currentStatus === 'Approved';
  });

  const inlineJobs: Array<{
    opportunityId: string;
    stage: ContentGenStage;
    manualRetry?: boolean;
  }> = [];

  for (const item of targets) {
    if (item.currentStatus === 'Deleted') {
      skipped++;
      skipReasons.push(`${item.websiteUrl ?? item.id}: deleted`);
      continue;
    }
    if (stage === 'all' && isEnqueueSkip(item.generationStatus) && !opts.manualRetry) {
      skipped++;
      skipReasons.push(
        `${item.websiteUrl ?? item.id}: already ${item.generationStatus}`
      );
      continue;
    }
    if (stage === 'images' && item.imageStatus !== 'failed') {
      skipped++;
      skipReasons.push(`${item.websiteUrl ?? item.id}: image_status != failed`);
      continue;
    }
    if (stage === 'metadata' && item.metadataStatus !== 'failed') {
      skipped++;
      skipReasons.push(`${item.websiteUrl ?? item.id}: metadata_status != failed`);
      continue;
    }
    if (stage === 'video_metadata' && item.videoMetadataStatus !== 'failed') {
      skipped++;
      skipReasons.push(`${item.websiteUrl ?? item.id}: video_metadata_status != failed`);
      continue;
    }

    const patch: Parameters<typeof updateCampaignItem>[2] = {
      generationStatus: 'Queued',
      force: true,
    };
    if (opts.manualRetry || opts.onlyFailed) {
      patch.retryCount = 0;
      patch.lastError = opts.manualRetry
        ? 'manual retry requested'
        : item.lastError;
      if (item.currentStatus === 'Failed') {
        patch.currentStatus = 'Approved';
      }
    }
    if (stage === 'all') {
      patch.packageStatus = 'pending';
      patch.imageStatus = 'pending';
      patch.metadataStatus = 'pending';
      patch.videoMetadataStatus = 'pending';
      patch.schemaStatus = 'pending';
      patch.qualityScore = null;
      patch.packageApprovedBy = null;
    } else if (stage === 'images') {
      patch.imageStatus = 'pending';
    } else if (stage === 'metadata') {
      patch.metadataStatus = 'pending';
    } else if (stage === 'video_metadata') {
      patch.videoMetadataStatus = 'pending';
    }

    await updateCampaignItem(workspaceId, item.id, patch);
    const jobId = await enqueueItemJob(workspaceId, item.id, stage, {
      manualRetry: opts.manualRetry,
    });
    if (!jobId) {
      inlineJobs.push({
        opportunityId: item.id,
        stage,
        manualRetry: opts.manualRetry,
      });
    }
    queued++;
  }

  if (inlineJobs.length) {
    const concurrency = contentGenConcurrency();
    void (async () => {
      let cursor = 0;
      const workers = Array.from({ length: Math.min(concurrency, inlineJobs.length) }, async () => {
        while (cursor < inlineJobs.length) {
          const idx = cursor++;
          const j = inlineJobs[idx]!;
          try {
            await processContentGenerationJob({
              workspaceId,
              opportunityId: j.opportunityId,
              stage: j.stage,
              manualRetry: j.manualRetry,
            });
          } catch (err) {
            logger.warn({ err, opportunityId: j.opportunityId }, 'inline content_generate failed');
          }
        }
      });
      await Promise.all(workers);
    })();
  }

  return {
    queued,
    skipped,
    skipReasons: skipReasons.slice(0, 40),
    message: `${queued} queued, ${skipped} skipped`,
  };
}

export async function bulkContentGenerationAction(
  workspaceId: string,
  action: ContentGenBulkAction,
  itemIds: string[] = []
) {
  switch (action) {
    case 'generate_all':
      return enqueueContentGeneration(workspaceId, { stage: 'all' });
    case 'generate_selected':
      return enqueueContentGeneration(workspaceId, { itemIds, stage: 'all' });
    case 'retry_failed':
      return enqueueContentGeneration(workspaceId, {
        onlyFailed: true,
        stage: 'all',
        manualRetry: true,
      });
    case 'retry_missing_images':
      return enqueueContentGeneration(workspaceId, {
        itemIds: itemIds.length
          ? itemIds
          : (
              await listCampaignItems(workspaceId, { includeDeleted: false })
            )
              .filter((i) => i.imageStatus === 'failed')
              .map((i) => i.id),
        stage: 'images',
        manualRetry: true,
      });
    case 'retry_missing_metadata':
      return enqueueContentGeneration(workspaceId, {
        itemIds: itemIds.length
          ? itemIds
          : (
              await listCampaignItems(workspaceId, { includeDeleted: false })
            )
              .filter((i) => i.metadataStatus === 'failed')
              .map((i) => i.id),
        stage: 'metadata',
        manualRetry: true,
      });
    case 'retry_missing_videos':
      return enqueueContentGeneration(workspaceId, {
        itemIds: itemIds.length
          ? itemIds
          : (
              await listCampaignItems(workspaceId, { includeDeleted: false })
            )
              .filter((i) => i.videoMetadataStatus === 'failed')
              .map((i) => i.id),
        stage: 'video_metadata',
        manualRetry: true,
      });
    case 'approve_selected':
    case 'approve_all':
      return approvePackages(
        workspaceId,
        action === 'approve_all'
          ? (
              await listCampaignItems(workspaceId, { includeDeleted: false })
            )
              .filter((i) => i.generationStatus === 'Needs Review')
              .map((i) => i.id)
          : itemIds
      );
    case 'reject_selected':
      return rejectPackages(workspaceId, itemIds);
    case 'delete_packages':
      return deletePackages(workspaceId, itemIds);
    case 'export_packages':
      return exportPackages(workspaceId, itemIds);
    default:
      return { queued: 0, skipped: 0, skipReasons: ['unknown action'], message: 'unknown' };
  }
}

async function approvePackages(workspaceId: string, itemIds: string[]) {
  let succeeded = 0;
  let skipped = 0;
  const skipReasons: string[] = [];
  const items = await listCampaignItems(workspaceId, { includeDeleted: false });
  const byId = new Map(items.map((i) => [i.id, i]));

  for (const id of itemIds) {
    const item = byId.get(id);
    if (!item) {
      skipped++;
      skipReasons.push(`${id}: not found`);
      continue;
    }
    if (item.generationStatus === 'Failed') {
      skipped++;
      skipReasons.push(`${item.websiteUrl ?? id}: Failed — approve skipped`);
      continue;
    }
    if (item.generationStatus === 'Completed' && item.currentStatus === 'Ready') {
      // Clear stale quality last_error left from Needs Review → user approve path
      if (item.lastError && /quality needs review/i.test(item.lastError)) {
        await updateCampaignItem(workspaceId, id, {
          lastError: null,
          force: true,
        });
      }
      succeeded++;
      continue;
    }
    try {
      assertPackageAssetsComplete(item);
      const { resolveHandoffBlockerAfterApprove } = await import(
        './generation-handoff.service.js'
      );
      await resolveHandoffBlockerAfterApprove(workspaceId, id, item.domain);
      const { data: packs } = await getSupabaseAdmin()
        .from('content_packs')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('opportunity_id', id)
        .order('updated_at', { ascending: false })
        .limit(1);
      if (packs?.[0]) {
        await getSupabaseAdmin()
          .from('content_packs')
          .update({ status: 'ready', updated_at: new Date().toISOString() })
          .eq('id', packs[0].id);
      }
      succeeded++;
    } catch (err) {
      skipped++;
      skipReasons.push(
        `${item.websiteUrl ?? id}: ${err instanceof Error ? err.message : 'approve failed'}`
      );
    }
  }

  // Production Validation: Ready packages must become execution jobs (or verified terminal)
  try {
    const { ensureExecutionJobsForReady } = await import(
      '../browser-execution/execution-pipeline.service.js'
    );
    await ensureExecutionJobsForReady({
      workspaceId,
      startImmediately: true,
    });
  } catch (err) {
    logger.error({ err, workspaceId }, 'ensureExecutionJobsForReady after approvePackages failed');
  }

  return {
    queued: 0,
    skipped,
    succeeded,
    skipReasons: skipReasons.slice(0, 40),
    message: `${succeeded} approved, ${skipped} skipped`,
  };
}

async function rejectPackages(workspaceId: string, itemIds: string[]) {
  let succeeded = 0;
  let skipped = 0;
  const skipReasons: string[] = [];
  for (const id of itemIds) {
    try {
      await updateCampaignItem(workspaceId, id, {
        currentStatus: 'Approved',
        generationStatus: null,
        packageStatus: 'pending',
        imageStatus: 'pending',
        metadataStatus: 'pending',
        videoMetadataStatus: 'pending',
        schemaStatus: 'pending',
        qualityScore: null,
        packageApprovedBy: null,
        lastError: 'package rejected by user',
        force: true,
      });
      await getSupabaseAdmin()
        .from('content_packs')
        .update({ status: 'rejected', updated_at: new Date().toISOString() })
        .eq('workspace_id', workspaceId)
        .eq('opportunity_id', id);
      succeeded++;
    } catch (err) {
      skipped++;
      skipReasons.push(`${id}: ${err instanceof Error ? err.message : 'reject failed'}`);
    }
  }
  return {
    queued: 0,
    succeeded,
    skipped,
    skipReasons,
    message: `${succeeded} rejected, ${skipped} skipped`,
  };
}

async function deletePackages(workspaceId: string, itemIds: string[]) {
  let succeeded = 0;
  let skipped = 0;
  const skipReasons: string[] = [];

  for (const id of itemIds) {
    try {
      await getSupabaseAdmin()
        .from('content_packs')
        .delete()
        .eq('workspace_id', workspaceId)
        .eq('opportunity_id', id);
      await getSupabaseAdmin()
        .from('media_asset_briefs')
        .delete()
        .eq('workspace_id', workspaceId)
        .eq('opportunity_id', id);
      await getSupabaseAdmin()
        .from('image_assets')
        .delete()
        .eq('workspace_id', workspaceId)
        .eq('opportunity_id', id);

      await updateCampaignItem(workspaceId, id, {
        currentStatus: 'Approved',
        generationStatus: null,
        packageStatus: 'pending',
        imageStatus: 'pending',
        metadataStatus: 'pending',
        videoMetadataStatus: 'pending',
        schemaStatus: 'pending',
        qualityScore: null,
        retryCount: 0,
        packageApprovedBy: null,
        lastError: null,
        force: true,
      });
      succeeded++;
    } catch (err) {
      skipped++;
      skipReasons.push(`${id}: ${err instanceof Error ? err.message : 'delete failed'}`);
    }
  }
  return {
    queued: 0,
    succeeded,
    skipped,
    skipReasons,
    message: `${succeeded} deleted, ${skipped} skipped`,
  };
}

async function exportPackages(workspaceId: string, itemIds: string[]) {
  let q = getSupabaseAdmin()
    .from('content_packs')
    .select('*, opportunities:opportunity_id(id, title, domain, opportunity_type)')
    .eq('workspace_id', workspaceId)
    .eq('status', 'ready')
    .order('updated_at', { ascending: false })
    .limit(500);
  if (itemIds.length) {
    q = q.in('opportunity_id', itemIds);
  }
  const { data } = await q;
  return {
    packages: data ?? [],
    message: `${(data ?? []).length} packages`,
    succeeded: (data ?? []).length,
    skipped: 0,
    skipReasons: [] as string[],
  };
}

/**
 * Process one Campaign Item through the generation pipeline (or a partial stage).
 */
export async function processContentGenerationJob(job: {
  workspaceId: string;
  opportunityId: string;
  stage?: ContentGenStage;
  manualRetry?: boolean;
  interrupted?: boolean;
}) {
  const { workspaceId, opportunityId } = job;
  const stage: ContentGenStage = job.stage ?? 'all';
  const started = Date.now();

  const items = await listCampaignItems(workspaceId, { includeDeleted: false });
  const item = items.find((i) => i.id === opportunityId);
  if (!item) {
    logger.warn({ opportunityId }, 'content_generate: item not found');
    return;
  }

  const retryCount = job.interrupted ? (item.retryCount ?? 0) : (item.retryCount ?? 0) + 1;

  await updateCampaignItem(workspaceId, opportunityId, {
    generationStatus: 'Generating',
    retryCount: job.interrupted ? item.retryCount ?? 0 : retryCount,
    currentStep: 'content-generation',
    force: true,
  });

  try {
    if (stage === 'all' || stage === 'metadata') {
      await updateCampaignItem(workspaceId, opportunityId, {
        packageStatus: 'generating',
        metadataStatus: 'generating',
        force: true,
      });
      await createContentPack(workspaceId, opportunityId, String(item.classification ?? 'guest_post'));
      await updateCampaignItem(workspaceId, opportunityId, {
        packageStatus: 'generated',
        metadataStatus: 'generated',
        force: true,
      });
    }

    if (stage === 'all' || stage === 'images') {
      await updateCampaignItem(workspaceId, opportunityId, {
        imageStatus: 'generating',
        force: true,
      });
      await createMediaBrief(workspaceId, opportunityId, 'image');
      try {
        const { enqueueImageGenerate } = await import(
          '../image-intelligence/iie.service.js'
        );
        await enqueueImageGenerate({
          workspaceId,
          opportunityId,
          imageType: 'featured',
          count: 1,
        });
      } catch (err) {
        logger.debug(
          { err, opportunityId },
          'Image pixel enqueue skipped — metadata brief still counts'
        );
      }
      await updateCampaignItem(workspaceId, opportunityId, {
        imageStatus: 'generated',
        force: true,
      });
    }

    if (stage === 'all' || stage === 'video_metadata') {
      await updateCampaignItem(workspaceId, opportunityId, {
        videoMetadataStatus: 'generating',
        force: true,
      });
      await createMediaBrief(workspaceId, opportunityId, 'video');
      await updateCampaignItem(workspaceId, opportunityId, {
        videoMetadataStatus: 'generated',
        force: true,
      });
    }

    if (stage === 'all' || stage === 'images' || stage === 'metadata' || stage === 'video_metadata') {
      await updateCampaignItem(workspaceId, opportunityId, {
        schemaStatus: 'generating',
        force: true,
      });
      const { data: packRow } = await getSupabaseAdmin()
        .from('content_packs')
        .select('id, pack')
        .eq('workspace_id', workspaceId)
        .eq('opportunity_id', opportunityId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (packRow?.pack && typeof packRow.pack === 'object') {
        const pack = { ...(packRow.pack as Record<string, unknown>) };
        if (!pack.schemaJsonLd && !pack.schema) {
          pack.schemaJsonLd = {
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: pack.seoTitle ?? pack.title,
            description: pack.metaDescription,
          };
          await getSupabaseAdmin()
            .from('content_packs')
            .update({ pack, updated_at: new Date().toISOString() })
            .eq('id', packRow.id);
        }
      }
      await updateCampaignItem(workspaceId, opportunityId, {
        schemaStatus: 'generated',
        force: true,
      });
    }

    await finalizeQuality(workspaceId, opportunityId, started);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const attempt = job.interrupted ? item.retryCount ?? 0 : retryCount;
    const isRateLimit = /rate.?limit|429|throttl/i.test(msg);

    if (attempt < CONTENT_GEN_MAX_RETRIES) {
      await updateCampaignItem(workspaceId, opportunityId, {
        generationStatus: 'Queued',
        lastError: `attempt ${attempt}/${CONTENT_GEN_MAX_RETRIES}: ${msg}`,
        force: true,
      });
      const backoffSec = isRateLimit
        ? Math.min(120, 15 * attempt)
        : Math.min(60, 5 * attempt);
      await enqueueItemJob(workspaceId, opportunityId, stage, {
        startAfter: backoffSec,
      });
      return;
    }

    await updateCampaignItem(workspaceId, opportunityId, {
      generationStatus: 'Failed',
      currentStatus: 'Failed',
      lastError: `stage=${stage} attempt=${attempt}: ${msg}`,
      force: true,
    });
  }
}

async function finalizeQuality(
  workspaceId: string,
  opportunityId: string,
  startedAt: number
) {
  const items = await listCampaignItems(workspaceId, { includeDeleted: false });
  const item = items.find((i) => i.id === opportunityId);
  if (!item) return;

  assertPackageAssetsComplete(item);

  const { data: packRow } = await getSupabaseAdmin()
    .from('content_packs')
    .select('id, pack')
    .eq('workspace_id', workspaceId)
    .eq('opportunity_id', opportunityId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const quality = (packRow?.pack as { quality?: { overall?: number; recommendations?: string[] } })
    ?.quality;
  const score = typeof quality?.overall === 'number' ? quality.overall : 0;
  const recommendations = quality?.recommendations ?? [];
  const tier = tierFromQualityScore(score);
  const reason = qualityFailureReason(score, recommendations);

  await recordSample(workspaceId, {
    durationMs: Date.now() - startedAt,
    images: 1,
  });

  if (tier === 'Completed') {
    const { completePackageHandoff } = await import('./generation-handoff.service.js');
    await completePackageHandoff({
      workspaceId,
      opportunityId,
      qualityScore: score,
      packageApprovedBy: 'auto',
      domain: item.domain,
    });
    if (packRow?.id) {
      await getSupabaseAdmin()
        .from('content_packs')
        .update({ status: 'ready', updated_at: new Date().toISOString() })
        .eq('id', packRow.id);
    }
    try {
      const { ensureExecutionJobsForReady } = await import(
        '../browser-execution/execution-pipeline.service.js'
      );
      await ensureExecutionJobsForReady({
        workspaceId,
        startImmediately: true,
      });
    } catch (err) {
      logger.error({ err, opportunityId }, 'ensureExecutionJobsForReady after quality Completed');
    }
    return;
  }

  if (tier === 'Needs Review') {
    const { completePackageHandoff } = await import('./generation-handoff.service.js');
    await completePackageHandoff({
      workspaceId,
      opportunityId,
      qualityScore: score,
      packageApprovedBy: null,
      domain: item.domain,
      forceBlocker: 'needs_review',
    });
    await updateCampaignItem(workspaceId, opportunityId, {
      lastError: reason,
      force: true,
    });
    if (packRow?.id) {
      await getSupabaseAdmin()
        .from('content_packs')
        .update({ status: 'needs_review', updated_at: new Date().toISOString() })
        .eq('id', packRow.id);
    }
    return;
  }

  // quality < 70 — counts as failure / retry
  const attempt = item.retryCount ?? 0;
  if (attempt < CONTENT_GEN_MAX_RETRIES) {
    await updateCampaignItem(workspaceId, opportunityId, {
      qualityScore: score,
      generationStatus: 'Queued',
      lastError: reason,
      force: true,
    });
    await enqueueItemJob(workspaceId, opportunityId, 'all', {
      startAfter: Math.min(60, 5 * Math.max(1, attempt)),
    });
    return;
  }

  const { completePackageHandoff } = await import('./generation-handoff.service.js');
  await completePackageHandoff({
    workspaceId,
    opportunityId,
    qualityScore: score,
    domain: item.domain,
    forceBlocker: 'quality_failed',
  });
  await updateCampaignItem(workspaceId, opportunityId, {
    lastError: reason,
    force: true,
  });
  if (packRow?.id) {
    await getSupabaseAdmin()
      .from('content_packs')
      .update({ status: 'failed', updated_at: new Date().toISOString() })
      .eq('id', packRow.id);
  }
}

/** Re-queue items stuck in Generating after process restart (does not consume a retry). */
export async function resumeInterruptedContentGeneration(workspaceId?: string) {
  const db = getSupabaseAdmin();
  let q = db
    .from('opportunities')
    .select('id, workspace_id')
    .eq('generation_status', 'Generating')
    .limit(500);
  if (workspaceId) q = q.eq('workspace_id', workspaceId);
  const { data } = await q;
  let resumed = 0;
  for (const row of data ?? []) {
    const ws = String(row.workspace_id);
    const id = String(row.id);
    await updateCampaignItem(ws, id, {
      generationStatus: 'Queued',
      lastError: 'resumed after interruption',
      force: true,
    });
    await enqueueJob(
      QUEUES.LOW,
      'content_generate',
      {
        type: 'content_generate',
        workspaceId: ws,
        opportunityId: id,
        stage: 'all',
        interrupted: true,
      },
      {
        singletonKey: `content-gen-${id}-all`,
        retryLimit: 0,
      }
    );
    resumed++;
  }
  return { resumed };
}

export async function handleContentGenerateJobs(
  jobs: Array<{ id: string; data: Record<string, unknown> }>
) {
  for (const job of jobs) {
    if (String(job.data.type ?? '') !== 'content_generate') continue;
    await processContentGenerationJob({
      workspaceId: String(job.data.workspaceId),
      opportunityId: String(job.data.opportunityId),
      stage: (job.data.stage as ContentGenStage) ?? 'all',
      manualRetry: Boolean(job.data.manualRetry),
      interrupted: Boolean(job.data.interrupted),
    });
  }
}

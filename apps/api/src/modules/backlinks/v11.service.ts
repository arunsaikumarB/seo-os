import { randomUUID } from 'node:crypto';
import {
  buildBrowserActionPlan,
  buildIntelligentContentPlan,
  buildPrefillPayload,
  canTransitionQueueStage,
  detectSubmissionRequirements,
  generateContentPack,
  generateImageBrief,
  generateVideoBrief,
  queueStageToAutomationStatus,
  queueStageToTrackingStatus,
  recommendBacklinkTypes,
  discoverKeywordCandidates,
  clusterKeywordsByTopic,
  type QueueStage,
} from '@seo-os/backlink-builder';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { getProjectById, getProjectByWorkspaceId, refreshBrandProfile } from '../projects/project.service.js';
import { publishPlatformEvent, fireAndForget } from '../platform/event-bus.service.js';
import { enqueueJob, QUEUES } from '../../jobs/boss.js';
import { runVerificationCheck } from './automation.service.js';
import { logger } from '../../lib/logger.js';
import {
  analyzeOpportunityForContent,
  rememberSiteRequirements,
} from './content-intelligence.service.js';

export { analyzeOpportunityForContent };

const BRAND_PROFILE_STALE_MS = 7 * 24 * 60 * 60 * 1000;

const OPENING_ANGLES = [
  'Lead with the problem the product solves for this audience',
  'Lead with a concrete capability from the website features list',
  'Lead with who the product is for (buyer/role)',
  'Lead with a tangible outcome or workflow benefit',
  'Lead with how it fits this niche/directory category',
];

function hashToIndex(seed: string, modulo: number): number {
  if (modulo <= 0) return 0;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % modulo;
}

function pickFeatureEmphasis(
  brand: Awaited<ReturnType<typeof brandFor>>,
  opportunityId: string
): { featureEmphasis: string | null; openingAngle: string } {
  const pool = [
    ...(brand.keyFeatures ?? []),
    ...(brand.primaryTopics ?? []),
    brand.tagline ? String(brand.tagline) : '',
  ].filter((t) => String(t).trim().length >= 8);
  const featureEmphasis =
    pool.length > 0 ? pool[hashToIndex(opportunityId, pool.length)]! : null;
  const openingAngle = OPENING_ANGLES[hashToIndex(opportunityId + ':angle', OPENING_ANGLES.length)]!;
  return { featureEmphasis, openingAngle };
}

async function brandFor(workspaceId: string, orgId?: string) {
  const project = orgId
    ? await getProjectById(workspaceId, orgId)
    : await getProjectByWorkspaceId(workspaceId);
  if (!project?.name) {
    throw new Error(
      `Workspace brand missing for ${workspaceId} — cannot generate content without project name`
    );
  }
  const profile = (project.brandProfile ?? {}) as Record<string, unknown>;
  const topics = Array.isArray(profile.primaryTopics)
    ? (profile.primaryTopics as string[])
    : [];
  const features = Array.isArray(profile.keyFeatures)
    ? (profile.keyFeatures as string[])
    : [];
  const tagline = profile.tagline ? String(profile.tagline) : undefined;
  return {
    brandName: project.companyName || project.name,
    projectDomain: project.domain ?? undefined,
    projectUrl: project.url ?? undefined,
    industry: project.industry ?? undefined,
    brandVoice: profile.tone ? String(profile.tone) : undefined,
    tagline,
    primaryTopics: topics,
    keyFeatures: features,
    knowledgeSnippets: [tagline, ...topics, ...features].filter(Boolean).slice(0, 8) as string[],
    contactEmail: project.contactEmail ?? undefined,
    contactName: project.contactName ?? undefined,
    contactPhone: project.contactPhone ?? undefined,
    companyName: project.companyName || project.name,
    crawledAt: profile.crawledAt ? String(profile.crawledAt) : null,
  };
}

/** Phase 12 — re-crawl project website when brand_profile is empty or stale. */
async function ensureBrandProfileForGeneration(workspaceId: string, orgId?: string) {
  let brand = await brandFor(workspaceId, orgId);
  const hasFacts =
    (brand.keyFeatures?.length ?? 0) > 0 ||
    (brand.primaryTopics?.length ?? 0) > 0 ||
    Boolean(brand.tagline);
  const crawledAt = brand.crawledAt ? Date.parse(brand.crawledAt) : NaN;
  const stale =
    !hasFacts ||
    !Number.isFinite(crawledAt) ||
    Date.now() - crawledAt > BRAND_PROFILE_STALE_MS;

  if (stale) {
    logger.info(
      { workspaceId, hasFacts, crawledAt: brand.crawledAt },
      'Phase 12: refreshing brand_profile before content generation'
    );
    await refreshBrandProfile(workspaceId);
    brand = await brandFor(workspaceId, orgId);
  }
  return brand;
}

export async function detectAndSaveRequirements(
  workspaceId: string,
  opportunityId: string
) {
  const { data: opp } = await getSupabaseAdmin()
    .from('opportunities')
    .select('*')
    .eq('id', opportunityId)
    .eq('workspace_id', workspaceId)
    .single();
  if (!opp) throw new Error('Opportunity not found');

  let htmlSnippet: string | undefined;
  try {
    const res = await fetch(String(opp.url ?? `https://${opp.domain}`), {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'BacklinkAgent-SubmissionAssistant/1.1' },
    });
    if (res.ok) htmlSnippet = (await res.text()).slice(0, 80_000);
  } catch {
    /* estimated fallback */
  }

  const detected = detectSubmissionRequirements(String(opp.opportunity_type), {
    htmlSnippet,
    url: String(opp.url ?? ''),
  });

  const row = {
    id: randomUUID(),
    workspace_id: workspaceId,
    opportunity_id: opportunityId,
    detected_fields: detected.detectedFields,
    required_fields: detected.requiredFields,
    categories: detected.categories,
    media_requirements: detected.mediaRequirements,
    business_details: detected.businessDetails,
    login_required: detected.loginRequired,
    captcha_required: detected.captchaRequired,
    email_verify_required: detected.emailVerifyRequired,
    metrics_source: detected.metricsSource,
    updated_at: new Date().toISOString(),
  };

  await getSupabaseAdmin()
    .from('submission_requirements')
    .upsert(row, { onConflict: 'opportunity_id' });

  return { ...detected, opportunityId };
}

export async function getRequirements(workspaceId: string, opportunityId: string) {
  const { data } = await getSupabaseAdmin()
    .from('submission_requirements')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('opportunity_id', opportunityId)
    .maybeSingle();
  if (data) return data;
  return detectAndSaveRequirements(workspaceId, opportunityId);
}

export async function getSubmissionPreview(workspaceId: string, submissionId: string, orgId?: string) {
  const { data: sub } = await getSupabaseAdmin()
    .from('backlink_submissions')
    .select('*, opportunities:opportunity_id(*)')
    .eq('id', submissionId)
    .eq('workspace_id', workspaceId)
    .single();
  if (!sub) throw new Error('Submission not found');

  const opp = sub.opportunities as Record<string, unknown>;
  const brand = await brandFor(workspaceId, orgId);
  const requirements = await getRequirements(workspaceId, String(opp.id));

  let contentPack = null;
  if (sub.content_pack_id) {
    const { data } = await getSupabaseAdmin()
      .from('content_packs')
      .select('*')
      .eq('id', sub.content_pack_id)
      .maybeSingle();
    contentPack = data;
  }

  const prefill =
    (sub.prefill_payload as Record<string, unknown>) &&
    Object.keys(sub.prefill_payload as object).length
      ? (sub.prefill_payload as Record<string, unknown>)
      : buildPrefillPayload({
          brandName: brand.brandName,
          projectDomain: brand.projectDomain,
          industry: brand.industry,
          opportunityTitle: String(opp.title ?? ''),
          opportunityDomain: String(opp.domain ?? ''),
          opportunityType: String(opp.opportunity_type ?? ''),
        });

  return {
    submission: sub,
    opportunity: opp,
    requirements,
    contentPack,
    prefill,
    blockers: {
      loginRequired: Boolean((requirements as { login_required?: boolean }).login_required),
      captchaRequired: Boolean((requirements as { captcha_required?: boolean }).captcha_required),
      emailVerifyRequired: Boolean(
        (requirements as { email_verify_required?: boolean }).email_verify_required
      ),
    },
  };
}

export async function updateSubmissionPreview(
  workspaceId: string,
  submissionId: string,
  prefill: Record<string, unknown>
) {
  const { data, error } = await getSupabaseAdmin()
    .from('backlink_submissions')
    .update({ prefill_payload: prefill })
    .eq('id', submissionId)
    .eq('workspace_id', workspaceId)
    .select('*')
    .single();
  if (error || !data) throw new Error('Submission not found');
  return data;
}

async function recordStageEvent(input: {
  workspaceId: string;
  submissionId: string;
  opportunityId?: string;
  fromStage: string | null;
  toStage: string;
  actorId?: string;
  note?: string;
}) {
  await getSupabaseAdmin().from('backlink_submission_events').insert({
    id: randomUUID(),
    workspace_id: input.workspaceId,
    submission_id: input.submissionId,
    opportunity_id: input.opportunityId ?? null,
    from_stage: input.fromStage,
    to_stage: input.toStage,
    actor_id: input.actorId ?? null,
    note: input.note ?? null,
  });
}

export async function transitionSubmissionStage(
  workspaceId: string,
  submissionId: string,
  toStage: QueueStage,
  opts: { actorId?: string; note?: string } = {}
) {
  const { data: sub } = await getSupabaseAdmin()
    .from('backlink_submissions')
    .select('*')
    .eq('id', submissionId)
    .eq('workspace_id', workspaceId)
    .single();
  if (!sub) throw new Error('Submission not found');

  const fromStage = (sub.queue_stage as QueueStage | null) ?? 'prepared';
  if (!canTransitionQueueStage(fromStage, toStage)) {
    throw Object.assign(new Error(`Invalid transition ${fromStage} → ${toStage}`), { status: 400 });
  }

  const patch: Record<string, unknown> = {
    queue_stage: toStage,
    tracking_status: queueStageToTrackingStatus(toStage),
  };
  if (toStage === 'approved') patch.approved_at = new Date().toISOString();
  if (toStage === 'submitted') patch.submitted_at = new Date().toISOString();
  if (toStage === 'verified') patch.verified_at = new Date().toISOString();
  if (['submitted', 'pending', 'accepted', 'rejected', 'prepared'].includes(toStage)) {
    patch.status =
      toStage === 'pending'
        ? 'waiting'
        : toStage === 'prepared'
          ? 'prepared'
          : toStage === 'accepted'
            ? 'accepted'
            : toStage === 'rejected'
              ? 'rejected'
              : 'submitted';
  }

  const { data, error } = await getSupabaseAdmin()
    .from('backlink_submissions')
    .update(patch)
    .eq('id', submissionId)
    .select('*')
    .single();
  if (error || !data) throw new Error('Failed to update submission');

  await getSupabaseAdmin()
    .from('opportunities')
    .update({ automation_status: queueStageToAutomationStatus(toStage) })
    .eq('id', data.opportunity_id);

  await recordStageEvent({
    workspaceId,
    submissionId,
    opportunityId: data.opportunity_id,
    fromStage,
    toStage,
    actorId: opts.actorId,
    note: opts.note,
  });

  return data;
}

export async function approveSubmission(
  workspaceId: string,
  submissionId: string,
  actorId?: string
) {
  return transitionSubmissionStage(workspaceId, submissionId, 'approved', {
    actorId,
    note: 'User approved submission preview',
  });
}

export async function getQueueBoard(workspaceId: string, view: 'kanban' | 'timeline' = 'kanban') {
  const { data: submissions } = await getSupabaseAdmin()
    .from('backlink_submissions')
    .select(
      'id, queue_stage, tracking_status, status, estimated_review_hours, estimated_approval_hours, created_at, updated_at, opportunities:opportunity_id(id, title, domain, opportunity_type, priority, score)'
    )
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(300);

  const columns: Record<string, unknown[]> = {};
  for (const s of submissions ?? []) {
    const stage = String(s.queue_stage ?? 'discovered');
    columns[stage] = columns[stage] ?? [];
    columns[stage].push(s);
  }

  if (view === 'timeline') {
    const { data: events } = await getSupabaseAdmin()
      .from('backlink_submission_events')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(200);
    return { view, columns, events: events ?? [] };
  }

  return { view, columns, stages: Object.keys(columns) };
}

export async function getOpportunityHistory(workspaceId: string, opportunityId: string) {
  const { data: subs } = await getSupabaseAdmin()
    .from('backlink_submissions')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('opportunity_id', opportunityId);
  const ids = (subs ?? []).map((s) => s.id);
  if (!ids.length) return [];
  const { data } = await getSupabaseAdmin()
    .from('backlink_submission_events')
    .select('*')
    .in('submission_id', ids)
    .order('created_at', { ascending: false });
  return data ?? [];
}

export async function createContentPack(
  workspaceId: string,
  opportunityId: string,
  backlinkType: string,
  orgId?: string
) {
  const { data: opp } = await getSupabaseAdmin()
    .from('opportunities')
    .select('*')
    .eq('id', opportunityId)
    .eq('workspace_id', workspaceId)
    .single();
  if (!opp) throw new Error('Opportunity not found');

  // Always auto-detect — ignore manual type override from the client
  const intelligence = await analyzeOpportunityForContent(workspaceId, opportunityId);
  const plan = intelligence.plan;
  const storageType = plan.storageType || backlinkType || String(opp.opportunity_type);

  const brand = await ensureBrandProfileForGeneration(workspaceId, orgId);
  const { featureEmphasis, openingAngle } = pickFeatureEmphasis(brand, opportunityId);
  const { generateLiveContentPack } = await import(
    '../campaigns/llm-content-generation.js'
  );
  const {
    textSimilarity,
    CONTENT_SIMILARITY_THRESHOLD,
    CONTENT_SIMILARITY_MAX_ATTEMPTS,
  } = await import('@seo-os/backlink-builder');

  // Sibling descriptions — force unique copy per site (per-item packs, never shared blob)
  const { data: siblingPacks } = await getSupabaseAdmin()
    .from('content_packs')
    .select('opportunity_id, pack, updated_at')
    .eq('workspace_id', workspaceId)
    .neq('opportunity_id', opportunityId)
    .order('updated_at', { ascending: false })
    .limit(80);
  const avoidTexts = (siblingPacks ?? [])
    .map((row) => {
      const p = (row.pack as Record<string, unknown> | null) ?? {};
      return String(p.longDescription ?? p.shortDescription ?? p.metaDescription ?? '').trim();
    })
    .filter((t) => t.length >= 40);

  let pack: ReturnType<typeof generateContentPack> & Record<string, unknown> = null as never;
  let contentTooSimilar = false;
  let closest = 0;
  for (let attempt = 1; attempt <= CONTENT_SIMILARITY_MAX_ATTEMPTS; attempt++) {
    pack = (await generateLiveContentPack({
      workspaceId,
      storageType,
      opp: {
        title: String(opp.title),
        domain: opp.domain as string | null,
        opportunity_type: storageType,
        score: Number(opp.score ?? 0),
        website_name: opp.website_name as string | null,
      },
      brand,
      classificationId: plan.detectedType,
      classificationLabel: plan.detectedTypeLabel,
      reason: plan.reason,
      avoidTexts,
      uniquenessAttempt: attempt,
      featureEmphasis,
      openingAngle,
    })) as ReturnType<typeof generateContentPack> & Record<string, unknown>;

    const candidate = String(
      pack.longDescription ?? pack.shortDescription ?? pack.metaDescription ?? ''
    );
    let pairMax = 0;
    const tooClose = avoidTexts.some((prev) => {
      const score = textSimilarity(candidate, prev);
      if (score > pairMax) pairMax = score;
      return score >= CONTENT_SIMILARITY_THRESHOLD;
    });
    closest = Math.max(closest, pairMax);
    if (!tooClose) {
      contentTooSimilar = false;
      break;
    }
    contentTooSimilar = true;
    // Explicit "make this different from" seed for the next attempt
    avoidTexts.unshift(candidate);
    logger.info(
      {
        workspaceId,
        opportunityId,
        attempt,
        similarity: pairMax,
        threshold: CONTENT_SIMILARITY_THRESHOLD,
        featureEmphasis,
      },
      'Phase 12: description too similar — regenerating'
    );
  }
  pack.featureEmphasis = featureEmphasis;
  pack.openingAngle = openingAngle;
  pack.maxSiblingSimilarity = closest;
  if (contentTooSimilar) {
    pack.contentTooSimilar = true;
    pack.contentFlags = [
      ...((pack.contentFlags as string[]) ?? []),
      'content_too_similar',
    ];
  }

  // Align estimates from live intelligence
  pack.estimatedApprovalProbability = intelligence.estimatedApprovalProbability;
  pack.estimatedReviewHours = intelligence.estimatedReviewHours;
  pack.requiredFields = plan.requirements.requiredFields;

  const id = randomUUID();
  const { data, error } = await getSupabaseAdmin()
    .from('content_packs')
    .insert({
      id,
      workspace_id: workspaceId,
      opportunity_id: opportunityId,
      backlink_type: storageType,
      pack,
      status: 'draft',
    })
    .select('*')
    .single();
  if (error) throw error;

  if (opportunityId) {
    try {
      const { updateCampaignItem } = await import('../campaigns/campaign-state.service.js');
      await updateCampaignItem(workspaceId, opportunityId, {
        packageStatus: 'generated',
        metadataStatus: 'generated',
        force: true,
      });
    } catch {
      /* CSM optional until migration */
    }
  }

  const domain = String(opp.domain ?? '')
    .toLowerCase()
    .replace(/^www\./, '');
  if (domain) {
    await rememberSiteRequirements({
      workspaceId,
      domain,
      storageType,
      classificationId: plan.detectedType,
      requirements: plan.requirements,
    }).catch(() => undefined);
  }

  return {
    ...data,
    intelligence: {
      mode: plan.mode,
      modeLabel: plan.modeLabel,
      detectedType: plan.detectedType,
      detectedTypeLabel: plan.detectedTypeLabel,
      sections: plan.sections,
      openImageStudio: plan.openImageStudio,
      openVideoStudio: plan.openVideoStudio,
      requiredAssets: intelligence.requiredAssets,
      estimatedApprovalProbability: intelligence.estimatedApprovalProbability,
      estimatedReviewHours: intelligence.estimatedReviewHours,
      quality: pack.quality,
    },
  };
}

/**
 * Phase 12 — after a generation batch (or on demand), re-check all packs pairwise.
 * Concurrent jobs can miss siblings; this pass regenerates later duplicates and logs
 * the campaign max pairwise similarity (must be < 0.80 when clean).
 */
export async function enforceWorkspaceContentUniqueness(workspaceId: string): Promise<{
  maxPairwiseSimilarity: number;
  regenerated: number;
  flagged: number;
  packCount: number;
}> {
  const {
    textSimilarity,
    maxPairwiseSimilarity,
    CONTENT_SIMILARITY_THRESHOLD,
    CONTENT_SIMILARITY_MAX_ATTEMPTS,
  } = await import('@seo-os/backlink-builder');
  const { generateLiveContentPack } = await import('../campaigns/llm-content-generation.js');

  const { data: rows } = await getSupabaseAdmin()
    .from('content_packs')
    .select('id, opportunity_id, pack, backlink_type, updated_at')
    .eq('workspace_id', workspaceId)
    .order('updated_at', { ascending: true })
    .limit(200);

  const packs = (rows ?? []).map((r) => {
    const p = (r.pack as Record<string, unknown> | null) ?? {};
    const text = String(
      p.longDescription ?? p.shortDescription ?? p.metaDescription ?? ''
    ).trim();
    return {
      id: String(r.id),
      opportunityId: String(r.opportunity_id),
      pack: p,
      backlinkType: String(r.backlink_type ?? 'directory'),
      text,
      updatedAt: String(r.updated_at ?? ''),
    };
  });

  const texts = packs.map((p) => p.text).filter((t) => t.length >= 20);
  let maxSim = maxPairwiseSimilarity(texts);
  let regenerated = 0;
  let flagged = 0;

  // Resolve colliding pairs: regenerate the later pack
  const ordered = [...packs].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  for (let i = 0; i < ordered.length; i++) {
    const later = ordered[i]!;
    if (later.text.length < 40) continue;
    const earlierTexts = ordered
      .slice(0, i)
      .map((p) => p.text)
      .filter((t) => t.length >= 40);
    const conflict = earlierTexts.find(
      (prev) => textSimilarity(later.text, prev) >= CONTENT_SIMILARITY_THRESHOLD
    );
    if (!conflict) continue;

    const brand = await ensureBrandProfileForGeneration(workspaceId);
    const { featureEmphasis, openingAngle } = pickFeatureEmphasis(brand, later.opportunityId);
    const { data: opp } = await getSupabaseAdmin()
      .from('opportunities')
      .select('title, domain, website_name, score, opportunity_type')
      .eq('id', later.opportunityId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    if (!opp) continue;

    const avoidTexts = [...earlierTexts];
    let nextPack = { ...later.pack };
    let stillClose = true;
    for (let attempt = 1; attempt <= CONTENT_SIMILARITY_MAX_ATTEMPTS; attempt++) {
      nextPack = (await generateLiveContentPack({
        workspaceId,
        storageType: later.backlinkType,
        opp: {
          title: String(opp.title),
          domain: opp.domain as string | null,
          opportunity_type: later.backlinkType,
          score: Number(opp.score ?? 0),
          website_name: opp.website_name as string | null,
        },
        brand,
        avoidTexts,
        uniquenessAttempt: attempt,
        featureEmphasis,
        openingAngle,
      })) as Record<string, unknown>;
      const candidate = String(
        nextPack.longDescription ?? nextPack.shortDescription ?? ''
      ).trim();
      stillClose = avoidTexts.some(
        (prev) => textSimilarity(candidate, prev) >= CONTENT_SIMILARITY_THRESHOLD
      );
      if (!stillClose) break;
      avoidTexts.unshift(candidate);
    }

    regenerated++;
    if (stillClose) {
      flagged++;
      nextPack.contentTooSimilar = true;
      nextPack.contentFlags = [
        ...((nextPack.contentFlags as string[]) ?? []),
        'content_too_similar',
      ];
    } else {
      nextPack.contentTooSimilar = false;
    }
    nextPack.featureEmphasis = featureEmphasis;
    nextPack.openingAngle = openingAngle;

    await getSupabaseAdmin()
      .from('content_packs')
      .update({ pack: nextPack, updated_at: new Date().toISOString() })
      .eq('id', later.id);

    later.pack = nextPack;
    later.text = String(
      nextPack.longDescription ?? nextPack.shortDescription ?? ''
    ).trim();
  }

  maxSim = maxPairwiseSimilarity(ordered.map((p) => p.text));
  logger.info(
    {
      workspaceId,
      packCount: packs.length,
      maxPairwiseSimilarity: Number(maxSim.toFixed(4)),
      threshold: CONTENT_SIMILARITY_THRESHOLD,
      regenerated,
      flagged,
      uniqueOk: maxSim < CONTENT_SIMILARITY_THRESHOLD,
    },
    'Phase 12 campaign content uniqueness'
  );

  return {
    maxPairwiseSimilarity: maxSim,
    regenerated,
    flagged,
    packCount: packs.length,
  };
}

export async function updateContentPack(
  workspaceId: string,
  packId: string,
  pack: Record<string, unknown>,
  status?: string
) {
  const patch: Record<string, unknown> = {
    pack,
    updated_at: new Date().toISOString(),
  };
  if (status) patch.status = status;
  const { data, error } = await getSupabaseAdmin()
    .from('content_packs')
    .update(patch)
    .eq('id', packId)
    .eq('workspace_id', workspaceId)
    .select('*')
    .single();
  if (error || !data) throw new Error('Content pack not found');

  if (status === 'ready' && data.opportunity_id) {
    try {
      const { updateCampaignItem } = await import('../campaigns/campaign-state.service.js');
      await updateCampaignItem(workspaceId, String(data.opportunity_id), {
        currentStatus: 'Ready',
        packageStatus: 'generated',
        force: true,
      });
    } catch {
      /* CSM optional */
    }
    const { data: opp } = await getSupabaseAdmin()
      .from('opportunities')
      .select('domain, opportunity_type, metadata')
      .eq('id', data.opportunity_id)
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    const domain = String(opp?.domain ?? '')
      .toLowerCase()
      .replace(/^www\./, '');
    if (domain) {
      const meta = (opp?.metadata ?? {}) as Record<string, unknown>;
      const ci = (meta.contentIntelligence ?? {}) as Record<string, unknown>;
      const plan = buildIntelligentContentPlan({
        classificationId: (ci.detectedType as string) ?? null,
        opportunityType: String(data.backlink_type || opp?.opportunity_type || 'guest_post'),
        domain,
      });
      await rememberSiteRequirements({
        workspaceId,
        domain,
        storageType: plan.storageType,
        classificationId: plan.detectedType,
        requirements: {
          requiredFields: Array.isArray(pack.requiredFields)
            ? (pack.requiredFields as string[])
            : plan.requirements.requiredFields,
        },
        success: true,
      }).catch(() => undefined);
    }
  }

  return data;
}

export async function listContentPacks(workspaceId: string) {
  const { data } = await getSupabaseAdmin()
    .from('content_packs')
    .select('*, opportunities:opportunity_id(id, title, domain, opportunity_type)')
    .eq('workspace_id', workspaceId)
    .order('updated_at', { ascending: false })
    .limit(100);
  return data ?? [];
}

export async function createMediaBrief(
  workspaceId: string,
  opportunityId: string,
  kind: 'image' | 'video',
  orgId?: string
) {
  const { data: opp } = await getSupabaseAdmin()
    .from('opportunities')
    .select('*')
    .eq('id', opportunityId)
    .eq('workspace_id', workspaceId)
    .single();
  if (!opp) throw new Error('Opportunity not found');
  const brand = await brandFor(workspaceId, orgId);
  const ctx = {
    title: String(opp.title),
    domain: opp.domain as string | null,
    opportunity_type: String(opp.opportunity_type),
    score: Number(opp.score ?? 0),
    website_name: opp.website_name as string | null,
  };
  // Phase 5.6 — never invent example.com template briefs; pixel path is IIE / honest n/a
  const { isGenerationMockEnabled } = await import('@seo-os/backlink-builder');
  const brief = isGenerationMockEnabled()
    ? kind === 'image'
      ? generateImageBrief(ctx, brand)
      : generateVideoBrief(ctx, brand)
    : {
        suggestions: [],
        generationStatus: kind === 'image' ? 'pending_provider' : 'n/a',
        metricsSource: 'live',
        note:
          kind === 'image'
            ? 'Image pixels via configured image provider only — no fabricated metadata.'
            : 'Video render not configured — metadata deferred.',
        brand: brand.brandName,
        projectDomain: brand.projectDomain,
      };
  const { data, error } = await getSupabaseAdmin()
    .from('media_asset_briefs')
    .insert({
      id: randomUUID(),
      workspace_id: workspaceId,
      opportunity_id: opportunityId,
      kind,
      brief,
      review_status: 'queued',
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function reviewMediaBrief(
  workspaceId: string,
  briefId: string,
  reviewStatus: 'approved' | 'rejected'
) {
  const { data, error } = await getSupabaseAdmin()
    .from('media_asset_briefs')
    .update({ review_status: reviewStatus, updated_at: new Date().toISOString() })
    .eq('id', briefId)
    .eq('workspace_id', workspaceId)
    .select('*')
    .single();
  if (error || !data) throw new Error('Media brief not found');
  return data;
}

export async function listMediaBriefs(workspaceId: string, kind?: 'image' | 'video') {
  let q = getSupabaseAdmin()
    .from('media_asset_briefs')
    .select('*, opportunities:opportunity_id(id, title, domain)')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (kind) q = q.eq('kind', kind);
  const { data } = await q;
  return data ?? [];
}

export async function setPrimaryKeywords(workspaceId: string, keywords: string[]) {
  const saved = [];
  for (const kw of keywords) {
    const keyword = kw.trim().toLowerCase();
    if (!keyword) continue;
    const { data } = await getSupabaseAdmin()
      .from('keywords')
      .upsert(
        {
          id: randomUUID(),
          workspace_id: workspaceId,
          keyword,
          is_primary: true,
          discovery_source: 'manual',
          priority_score: 90,
          metadata: { metrics_source: 'user', type: 'primary' },
        },
        { onConflict: 'workspace_id,keyword' }
      )
      .select('*')
      .single();
    if (data) {
      await getSupabaseAdmin()
        .from('keywords')
        .update({ is_primary: true })
        .eq('id', data.id);
      saved.push(data);
    }
  }
  return saved;
}

export async function discoverKeywordsV11(
  workspaceId: string,
  primaryKeywords: string[],
  industry?: string
) {
  const candidates = discoverKeywordCandidates(primaryKeywords, industry);
  const clusters = clusterKeywordsByTopic(candidates);
  let inserted = 0;
  for (const c of candidates) {
    const { data: existing } = await getSupabaseAdmin()
      .from('keywords')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('keyword', c.keyword)
      .maybeSingle();
    if (existing) continue;
    await getSupabaseAdmin().from('keywords').insert({
      id: randomUUID(),
      workspace_id: workspaceId,
      keyword: c.keyword,
      is_primary: c.type === 'primary',
      search_intent: c.estimatedIntent,
      topic_group: c.topicCluster,
      priority_score: Math.round(100 - c.estimatedDifficulty * 0.5),
      discovery_source: 'ai_discover',
      metadata: {
        type: c.type,
        metrics_source: c.metricsSource,
        search_volume: c.estimatedVolume,
        difficulty: c.estimatedDifficulty,
        competition: c.estimatedCompetition,
        metrics_labels: {
          search_volume: 'Estimated',
          difficulty: 'Estimated',
          competition: 'Estimated',
          intent: 'Estimated',
        },
      },
    });
    inserted++;
  }
  return {
    candidates,
    clusters: Object.fromEntries([...clusters.entries()].map(([k, v]) => [k, v.map((x) => x.keyword)])),
    inserted,
    metricsSource: 'estimated' as const,
  };
}

export async function generateTypeRecommendations(workspaceId: string, orgId?: string) {
  const brand = await brandFor(workspaceId, orgId);
  const { data: kws } = await getSupabaseAdmin()
    .from('keywords')
    .select('keyword, is_primary')
    .eq('workspace_id', workspaceId)
    .eq('is_primary', true)
    .limit(20);
  const recs = recommendBacklinkTypes({
    industry: brand.industry,
    primaryKeywords: (kws ?? []).map((k) => k.keyword),
  });
  await getSupabaseAdmin().from('backlink_type_recommendations').delete().eq('workspace_id', workspaceId);
  for (const r of recs) {
    await getSupabaseAdmin().from('backlink_type_recommendations').insert({
      id: randomUUID(),
      workspace_id: workspaceId,
      recommendation_type: r.type,
      score: r.score,
      rationale: r.rationale,
      metrics_source: r.metricsSource,
    });
  }
  return recs;
}

export async function listTypeRecommendations(workspaceId: string) {
  const { data } = await getSupabaseAdmin()
    .from('backlink_type_recommendations')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('score', { ascending: false });
  if (data?.length) return data;
  return generateTypeRecommendations(workspaceId);
}

export async function listBacklinkChecks(workspaceId: string, backlinkId: string) {
  const { data } = await getSupabaseAdmin()
    .from('backlink_checks')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('backlink_id', backlinkId)
    .order('checked_at', { ascending: false })
    .limit(50);
  return data ?? [];
}

export async function createBrowserPlan(
  workspaceId: string,
  opportunityId: string,
  orgId?: string
) {
  const { data: opp } = await getSupabaseAdmin()
    .from('opportunities')
    .select('*')
    .eq('id', opportunityId)
    .eq('workspace_id', workspaceId)
    .single();
  if (!opp) throw new Error('Opportunity not found');

  const brand = await brandFor(workspaceId, orgId);
  const requirements = await getRequirements(workspaceId, opportunityId);
  const prefill = buildPrefillPayload({
    brandName: brand.brandName,
    projectDomain: brand.projectDomain,
    industry: brand.industry,
    opportunityTitle: String(opp.title),
    opportunityDomain: String(opp.domain ?? ''),
    opportunityType: String(opp.opportunity_type),
  });

  let htmlSnippet: string | undefined;
  const url = String(opp.url ?? `https://${opp.domain}`);
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'BacklinkAgent-BrowserAssistant/1.1' },
    });
    if (res.ok) htmlSnippet = (await res.text()).slice(0, 100_000);
  } catch {
    /* estimated */
  }

  const plan = buildBrowserActionPlan({
    url,
    opportunityType: String(opp.opportunity_type),
    prefill,
    htmlSnippet,
    loginRequired: Boolean((requirements as { login_required?: boolean }).login_required),
    captchaRequired: Boolean((requirements as { captcha_required?: boolean }).captcha_required),
    emailVerifyRequired: Boolean(
      (requirements as { email_verify_required?: boolean }).email_verify_required
    ),
  });

  const id = randomUUID();
  const { data, error } = await getSupabaseAdmin()
    .from('browser_action_plans')
    .insert({
      id,
      workspace_id: workspaceId,
      opportunity_id: opportunityId,
      plan_steps: plan.steps,
      blockers: plan.blockers,
      detected_form: plan.detectedForm,
      status: plan.blockers.length ? 'blocked' : 'ready',
      mode: 'action_plan',
      metrics_source: plan.metricsSource,
    })
    .select('*')
    .single();
  if (error) throw error;

  await getSupabaseAdmin()
    .from('backlink_submissions')
    .update({ browser_plan_id: id })
    .eq('workspace_id', workspaceId)
    .eq('opportunity_id', opportunityId);

  return data;
}

export async function getBrowserPlan(workspaceId: string, planId: string) {
  const { data } = await getSupabaseAdmin()
    .from('browser_action_plans')
    .select('*')
    .eq('id', planId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  return data;
}

export async function startBrowserAssist(
  workspaceId: string,
  planId: string,
  assistFillEnabled: boolean
) {
  if (!assistFillEnabled) {
    throw Object.assign(
      new Error('Assisted fill requires feature flag v11_browser_assist_fill'),
      { status: 403, code: 'FEATURE_DISABLED' }
    );
  }
  const plan = await getBrowserPlan(workspaceId, planId);
  if (!plan) throw new Error('Plan not found');

  const jobId = await enqueueJob(
    QUEUES.PLAYWRIGHT,
    'browser_assist_fill',
    {
      type: 'browser_assist_fill',
      workspaceId,
      planId,
      opportunityId: plan.opportunity_id,
    },
    { singletonKey: `assist-${planId}`, retryLimit: 1 }
  );

  const sessionId = randomUUID();
  const pauseReason =
    (plan.blockers as Array<{ type: string }> | null)?.[0]?.type ?? 'user_confirmation';

  const { data } = await getSupabaseAdmin()
    .from('browser_assist_sessions')
    .insert({
      id: sessionId,
      workspace_id: workspaceId,
      opportunity_id: plan.opportunity_id,
      plan_id: planId,
      playwright_job_id: jobId,
      status: jobId ? 'running' : 'paused',
      pause_reason: pauseReason,
      snapshot_refs: [],
    })
    .select('*')
    .single();

  await getSupabaseAdmin()
    .from('browser_action_plans')
    .update({ mode: 'assisted_fill', status: 'in_progress' })
    .eq('id', planId);

  return {
    session: data,
    message:
      'Assisted fill queued. Session will pause for login, CAPTCHA, or email verification — never bypassed.',
    pausePoints: plan.blockers,
  };
}

export async function getWorkforceStrip(workspaceId: string) {
  const { data: runs } = await getSupabaseAdmin()
    .from('agent_runs')
    .select('id, agent_type, status, error, created_at, completed_at, input, output')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(40);

  const list = runs ?? [];
  const current = list.find((r) => r.status === 'running' || r.status === 'queued');
  return {
    currentAgent: current?.agent_type ?? null,
    task: current ? ((current.input as { task?: string } | null)?.task ?? current.agent_type) : null,
    progress: current?.status === 'running' ? 50 : current?.status === 'queued' ? 10 : 0,
    queue: list.filter((r) => r.status === 'queued' || r.status === 'pending').length,
    errors: list.filter((r) => r.status === 'failed').slice(0, 5),
    completedJobs: list.filter((r) => r.status === 'completed').slice(0, 10),
    recent: list.slice(0, 15),
  };
}

export async function enqueueReverifyAccepted(workspaceId: string) {
  const { data: links } = await getSupabaseAdmin()
    .from('backlinks')
    .select('id')
    .eq('workspace_id', workspaceId)
    .in('verification_status', ['verified', 'pending'])
    .limit(50);

  const queued = [];
  for (const bl of links ?? []) {
    const jobId = await enqueueJob(
      QUEUES.CRAWL,
      'backlink_verify',
      { type: 'backlink_verify', workspaceId, backlinkId: bl.id },
      { singletonKey: `reverify-${bl.id}`, retryLimit: 1 }
    );
    if (!jobId) {
      const result = await runVerificationCheck(workspaceId, bl.id);
      if (result.outcome === 'broken' || result.outcome === 'unreachable') {
        fireAndForget(
          publishPlatformEvent({
            workspaceId,
            sourceModule: 'backlink_builder',
            eventType: 'backlink_lost',
            title: 'Backlink disappeared or unreachable',
            severity: 'warning',
            entityType: 'backlink',
            entityId: bl.id,
            payload: { outcome: result.outcome },
          })
        );
      }
    }
    queued.push(bl.id);
  }
  logger.info({ workspaceId, count: queued.length }, 'Re-verification sweep queued');
  return { queued: queued.length };
}

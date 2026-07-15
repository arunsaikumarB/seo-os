/**
 * Content Studio intelligence — auto-detect mode, requirements learning, analytics.
 * Persists learned submission requirements in workspace_settings.memory_config.
 */

import {
  buildIntelligentContentPlan,
  detectSubmissionRequirements,
  scoreContentPackQuality,
  type ContentStudioMode,
  type SubmissionRequirementsResult,
} from '@seo-os/backlink-builder';
import { getSupabaseAdmin } from '../../lib/supabase.js';

const LEARNING_KEY = 'content_requirement_learning';

export type LearnedSiteRequirements = {
  domain: string;
  storageType: string;
  classificationId?: string;
  requiredFields: string[];
  imageDimensions?: string[];
  acceptedFormats?: string[];
  contentLengthHints?: { minWords?: number; maxWords?: number };
  anchorRules?: string[];
  approvalHours?: number | null;
  moderatorNotes?: string | null;
  successCount: number;
  failCount: number;
  updatedAt: string;
};

export async function loadContentRequirementLearning(
  workspaceId: string
): Promise<LearnedSiteRequirements[]> {
  const { data } = await getSupabaseAdmin()
    .from('workspace_settings')
    .select('memory_config')
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  const cfg = (data?.memory_config ?? {}) as Record<string, unknown>;
  const rows = cfg[LEARNING_KEY];
  return Array.isArray(rows) ? (rows as LearnedSiteRequirements[]) : [];
}

export async function saveContentRequirementLearning(
  workspaceId: string,
  rows: LearnedSiteRequirements[]
) {
  const { data: existing } = await getSupabaseAdmin()
    .from('workspace_settings')
    .select('id, memory_config')
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  const memory_config = {
    ...((existing?.memory_config ?? {}) as Record<string, unknown>),
    [LEARNING_KEY]: rows.slice(0, 500),
  };

  if (existing) {
    await getSupabaseAdmin()
      .from('workspace_settings')
      .update({ memory_config })
      .eq('workspace_id', workspaceId);
  } else {
    await getSupabaseAdmin().from('workspace_settings').insert({
      workspace_id: workspaceId,
      memory_config,
    });
  }
}

export async function rememberSiteRequirements(params: {
  workspaceId: string;
  domain: string;
  storageType: string;
  classificationId?: string;
  requirements: Partial<SubmissionRequirementsResult>;
  approvalHours?: number | null;
  moderatorNotes?: string | null;
  success?: boolean;
}) {
  const domain = params.domain.toLowerCase().replace(/^www\./, '');
  const learning = await loadContentRequirementLearning(params.workspaceId);
  const existing = learning.find((r) => r.domain === domain);
  const next: LearnedSiteRequirements = {
    domain,
    storageType: params.storageType,
    classificationId: params.classificationId ?? existing?.classificationId,
    requiredFields: [
      ...new Set([
        ...(existing?.requiredFields ?? []),
        ...(params.requirements.requiredFields ?? []),
      ]),
    ],
    imageDimensions:
      params.requirements.imageDimensions ?? existing?.imageDimensions,
    acceptedFormats:
      params.requirements.acceptedFormats ?? existing?.acceptedFormats,
    contentLengthHints:
      params.requirements.contentLengthHints ?? existing?.contentLengthHints,
    anchorRules: params.requirements.anchorRules ?? existing?.anchorRules,
    approvalHours: params.approvalHours ?? existing?.approvalHours ?? null,
    moderatorNotes: params.moderatorNotes ?? existing?.moderatorNotes ?? null,
    successCount: (existing?.successCount ?? 0) + (params.success === true ? 1 : 0),
    failCount: (existing?.failCount ?? 0) + (params.success === false ? 1 : 0),
    updatedAt: new Date().toISOString(),
  };
  const rows = existing
    ? learning.map((r) => (r.domain === domain ? next : r))
    : [next, ...learning];
  await saveContentRequirementLearning(params.workspaceId, rows);
  return next;
}

export async function analyzeOpportunityForContent(
  workspaceId: string,
  opportunityId: string,
  opts: { refreshLive?: boolean } = {}
) {
  const { data: opp } = await getSupabaseAdmin()
    .from('opportunities')
    .select('*')
    .eq('id', opportunityId)
    .eq('workspace_id', workspaceId)
    .single();
  if (!opp) throw Object.assign(new Error('Opportunity not found'), { status: 404 });

  const meta = (opp.metadata ?? {}) as Record<string, unknown>;
  const classification = (meta.classification ?? {}) as Record<string, unknown>;
  const classificationId =
    (classification.id as string) ||
    (classification.type as string) ||
    (classification.classificationId as string) ||
    null;
  const classificationLabel =
    (classification.displayName as string) ||
    (classification.label as string) ||
    (classification.typeLabel as string) ||
    null;
  const workflowQueue =
    (classification.workflowQueue as string) ||
    (classification.queue as string) ||
    (meta.workflowQueue as string) ||
    null;
  const confidence = Number(classification.confidence ?? 0);
  const reason = String(classification.reason ?? classification.summary ?? '');

  const domain = String(opp.domain ?? '')
    .toLowerCase()
    .replace(/^www\./, '');
  const learning = await loadContentRequirementLearning(workspaceId);
  const learned = learning.find((r) => r.domain === domain) ?? null;

  let htmlSnippet: string | undefined;
  if (opts.refreshLive || !classificationId) {
    try {
      const res = await fetch(String(opp.url ?? `https://${opp.domain}`), {
        signal: AbortSignal.timeout(8000),
        headers: { 'User-Agent': 'SEO-OS-ContentStudio/1.2' },
      });
      if (res.ok) htmlSnippet = (await res.text()).slice(0, 80_000);
    } catch {
      /* estimated */
    }
  } else if (meta.websiteSignals && typeof meta.websiteSignals === 'object') {
    const signals = meta.websiteSignals as Record<string, unknown>;
    if (typeof signals.rawSnippet === 'string') htmlSnippet = signals.rawSnippet;
    else if (Array.isArray(signals.navLabels)) {
      htmlSnippet = (signals.navLabels as string[]).join(' ');
    }
  }

  const storageHint =
    learned?.storageType ||
    (classification.storageType as string) ||
    String(opp.opportunity_type);

  const liveReqs = detectSubmissionRequirements(storageHint, {
    htmlSnippet,
    url: String(opp.url ?? ''),
  });

  const plan = buildIntelligentContentPlan({
    classificationId: classificationId || learned?.classificationId || null,
    classificationLabel,
    opportunityType: storageHint,
    workflowQueue,
    confidence: confidence || (learned ? 70 : 0),
    reason:
      reason ||
      (learned
        ? `Reused learned requirements for ${domain}`
        : `Detecting submission package for ${opp.website_name ?? domain}`),
    domain,
    websiteName: opp.website_name as string | null,
    learnedRequirements: learned
      ? {
          requiredFields: learned.requiredFields,
          imageDimensions: learned.imageDimensions,
          acceptedFormats: learned.acceptedFormats,
          contentLengthHints: learned.contentLengthHints,
          anchorRules: learned.anchorRules,
        }
      : null,
  });

  // Merge live HTML heuristics
  plan.requirements.requiredFields = [
    ...new Set([...plan.requirements.requiredFields, ...liveReqs.requiredFields]),
  ];
  if (liveReqs.metricsSource === 'live') {
    plan.requirements.metricsSource = 'live';
    plan.requirements.loginRequired =
      plan.requirements.loginRequired || liveReqs.loginRequired;
    plan.requirements.captchaRequired =
      plan.requirements.captchaRequired || liveReqs.captchaRequired;
  }

  const { data: packs } = await getSupabaseAdmin()
    .from('content_packs')
    .select('id, pack, status, updated_at')
    .eq('workspace_id', workspaceId)
    .eq('opportunity_id', opportunityId)
    .order('updated_at', { ascending: false })
    .limit(1);
  const latestPack = packs?.[0] ?? null;
  const packPayload = (latestPack?.pack ?? null) as Record<string, unknown> | null;
  const quality = packPayload
    ? scoreContentPackQuality(packPayload)
    : null;

  const imagesReady = Boolean(
    packPayload &&
      (Array.isArray(packPayload.imageMetadata)
        ? packPayload.imageMetadata.length > 0
        : packPayload.suggestedImages)
  );
  const videoReady = Boolean(
    packPayload &&
      Array.isArray(packPayload.videoMetadata) &&
      packPayload.videoMetadata.length > 0
  );
  const submissionReady =
    latestPack?.status === 'ready' ||
    (quality != null && quality.overall >= 70 && Boolean(latestPack));

  const estimatedApprovalProbability = Math.min(
    94,
    50 +
      Math.round((plan.confidence || 40) * 0.3) +
      Math.round(Number(opp.score ?? 50) * 0.15) +
      (learned?.successCount ? Math.min(10, learned.successCount * 2) : 0)
  );
  const estimatedReviewHours =
    learned?.approvalHours ??
    (plan.mode === 'directory' ? 24 : plan.mode === 'guest_post' ? 72 : 48);

  // Persist refreshed live requirements on opportunity metadata (no schema change)
  const requirementsMemory = {
    ...plan.requirements,
    learnedFromDomain: Boolean(learned),
    analyzedAt: new Date().toISOString(),
  };
  await getSupabaseAdmin()
    .from('opportunities')
    .update({
      metadata: {
        ...meta,
        contentIntelligence: {
          mode: plan.mode,
          modeLabel: plan.modeLabel,
          detectedType: plan.detectedType,
          detectedTypeLabel: plan.detectedTypeLabel,
          storageType: plan.storageType,
          confidence: plan.confidence,
          reason: plan.reason,
          sections: plan.sections,
          openImageStudio: plan.openImageStudio,
          openVideoStudio: plan.openVideoStudio,
          requirements: requirementsMemory,
          estimatedApprovalProbability,
          estimatedReviewHours,
        },
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', opportunityId)
    .eq('workspace_id', workspaceId);

  if (domain && plan.requirements.requiredFields.length) {
    await rememberSiteRequirements({
      workspaceId,
      domain,
      storageType: plan.storageType,
      classificationId: plan.detectedType,
      requirements: plan.requirements,
    });
  }

  return {
    opportunityId,
    domain: opp.domain,
    websiteName: opp.website_name,
    plan,
    quality,
    latestPackId: latestPack?.id ?? null,
    packStatus: latestPack?.status ?? null,
    imagesReady,
    videoReady,
    submissionReady,
    estimatedApprovalProbability,
    estimatedReviewHours,
    reusedLearning: Boolean(learned),
    requiredAssets: {
      fields: plan.requirements.requiredFields,
      images: plan.requirements.mediaRequirements.images,
      videos: plan.requirements.mediaRequirements.videos,
      imageNotes: plan.requirements.mediaRequirements.imageNotes,
      videoNotes: plan.requirements.mediaRequirements.videoNotes,
    },
  };
}

export async function getContentIntelligenceAnalytics(workspaceId: string) {
  const [{ data: packs }, learning, { count: oppCount }] = await Promise.all([
    getSupabaseAdmin()
      .from('content_packs')
      .select('id, pack, status, backlink_type')
      .eq('workspace_id', workspaceId)
      .limit(200),
    loadContentRequirementLearning(workspaceId),
    getSupabaseAdmin()
      .from('opportunities')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId),
  ]);

  let qualitySum = 0;
  let seoSum = 0;
  let scored = 0;
  let imagesReady = 0;
  let videoReady = 0;
  let submissionReady = 0;
  const modeCounts: Partial<Record<ContentStudioMode, number>> = {};

  for (const row of packs ?? []) {
    const pack = (row.pack ?? {}) as Record<string, unknown>;
    const q =
      pack.quality && typeof pack.quality === 'object'
        ? (pack.quality as { overall?: number; seoScore?: number })
        : scoreContentPackQuality(pack);
    if (q.overall != null) {
      qualitySum += Number(q.overall);
      seoSum += Number(q.seoScore ?? q.overall);
      scored += 1;
    }
    if (Array.isArray(pack.imageMetadata) && pack.imageMetadata.length) imagesReady += 1;
    if (Array.isArray(pack.videoMetadata) && pack.videoMetadata.length) videoReady += 1;
    if (row.status === 'ready' || Number(q.overall) >= 70) submissionReady += 1;
    const mode = String(pack.studioMode ?? row.backlink_type ?? 'generic') as ContentStudioMode;
    modeCounts[mode] = (modeCounts[mode] ?? 0) + 1;
  }

  const avgQuality = scored ? Math.round(qualitySum / scored) : null;
  const avgSeo = scored ? Math.round(seoSum / scored) : null;
  const successSites = learning.filter((l) => l.successCount > 0).length;
  const avgApproval =
    learning.length && learning.some((l) => l.approvalHours != null)
      ? Math.round(
          learning
            .filter((l) => l.approvalHours != null)
            .reduce((a, l) => a + Number(l.approvalHours), 0) /
            learning.filter((l) => l.approvalHours != null).length
        )
      : 48;

  return {
    packs: packs?.length ?? 0,
    opportunities: oppCount ?? 0,
    learnedSites: learning.length,
    successfulLearnedSites: successSites,
    avgQualityScore: avgQuality,
    avgSeoScore: avgSeo,
    imagesReady,
    videoReady,
    submissionReady,
    modeCounts,
    estimatedApprovalProbability: avgQuality != null ? Math.min(92, 45 + Math.round(avgQuality * 0.4)) : 60,
    estimatedReviewHours: avgApproval,
  };
}

import { randomUUID } from 'node:crypto';
import {
  IMAGE_TYPES,
  buildDomainStyleProfile,
  buildImageMetadata,
  buildImagePrompt,
  buildSubmissionPackage,
  scoreImageQuality,
  type ImageType,
} from '@seo-os/backlink-builder';
import { createImageProviderRegistry } from '@seo-os/providers';
import { DEFAULT_FEATURE_FLAGS } from '@seo-os/shared';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { enqueueJob, QUEUES } from '../../jobs/boss.js';

const registry = createImageProviderRegistry('flux');

function requireIie() {
  if (!DEFAULT_FEATURE_FLAGS.v13_image_generation) {
    throw Object.assign(
      new Error('Image generation is disabled — enable v13_image_generation and configure a provider'),
      { status: 403, code: 'AUTH_FORBIDDEN' }
    );
  }
}

function providerAllowed(key: string): boolean {
  if (key === 'flux') return DEFAULT_FEATURE_FLAGS.v13_flux !== false;
  if (key === 'sdxl') return DEFAULT_FEATURE_FLAGS.v13_sdxl !== false;
  if (key === 'comfy') return DEFAULT_FEATURE_FLAGS.v13_comfy !== false;
  // Future registry providers (OpenAI Images, Firefly, Gemini, …) follow master flag
  return DEFAULT_FEATURE_FLAGS.v13_image_generation === true;
}

export async function listImageProviders() {
  return registry.providers().map((p) => ({
    ...p,
    flagEnabled: providerAllowed(p.key),
  }));
}

export async function getOrCreateStyleProfile(workspaceId: string) {
  const { data: ws } = await getSupabaseAdmin()
    .from('workspaces')
    .select('id, name, domain, industry')
    .eq('id', workspaceId)
    .single();
  if (!ws) throw Object.assign(new Error('Workspace not found'), { status: 404 });

  const domain = String(ws.domain ?? 'example.com');
  const { data: existing } = await getSupabaseAdmin()
    .from('domain_style_profiles')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('domain', domain)
    .is('deleted_at', null)
    .maybeSingle();
  if (existing) return existing;

  const style = buildDomainStyleProfile({
    domain,
    brandName: String(ws.name ?? 'Brand'),
    industry: (ws.industry as string) ?? undefined,
  });

  const row = {
    id: randomUUID(),
    workspace_id: workspaceId,
    domain,
    brand_colors: style.brandColors,
    fonts: style.fonts,
    mood: style.mood,
    photography_style: style.photographyStyle,
    illustration_style: style.illustrationStyle,
    lighting: style.lighting,
    theme: style.theme,
    industry: style.industry,
    audience: style.audience,
    brand_tone: style.brandTone,
    products: style.products,
    services: style.services,
    keywords: style.keywords,
    competitors: style.competitors,
    logo_url: style.logoUrl ?? null,
    metrics_source: style.metricsSource,
    confidence: style.confidence,
  };
  const { data, error } = await getSupabaseAdmin()
    .from('domain_style_profiles')
    .insert(row)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function enqueueImageGenerate(params: {
  workspaceId: string;
  opportunityId?: string;
  campaignId?: string;
  imageType: string;
  count?: number;
  width?: number;
  height?: number;
  providerKey?: string;
  customPrompt?: string;
  userId?: string;
}) {
  requireIie();
  const count = Math.min(Math.max(params.count ?? 1, 1), 6);
  const styleRow = await getOrCreateStyleProfile(params.workspaceId);
  const { data: ws } = await getSupabaseAdmin()
    .from('workspaces')
    .select('name, domain, industry')
    .eq('id', params.workspaceId)
    .single();

  let topic: string | undefined;
  let backlinkType: string | undefined;
  if (params.opportunityId) {
    const { data: opp } = await getSupabaseAdmin()
      .from('opportunities')
      .select('title, opportunity_type')
      .eq('id', params.opportunityId)
      .maybeSingle();
    topic = opp?.title ? String(opp.title) : undefined;
    backlinkType = opp?.opportunity_type ? String(opp.opportunity_type) : undefined;
  }

  const style = buildDomainStyleProfile({
    domain: String(ws?.domain ?? styleRow.domain),
    brandName: String(ws?.name ?? 'Brand'),
    industry: (ws?.industry as string) ?? styleRow.industry ?? undefined,
  });

  const providerKey = params.providerKey ?? 'flux';
  if (!providerAllowed(providerKey)) {
    throw Object.assign(new Error(`Provider ${providerKey} is flag-disabled`), { status: 403 });
  }

  const jobs = [];
  for (let i = 0; i < count; i++) {
    const promptPack = buildImagePrompt({
      imageType: params.imageType,
      style,
      topic,
      backlinkType,
      brandName: String(ws?.name ?? 'Brand'),
      customPrompt: params.customPrompt,
    });
    if (params.width) promptPack.width = params.width;
    if (params.height) promptPack.height = params.height;

    const promptId = randomUUID();
    await getSupabaseAdmin().from('image_prompt_library').insert({
      id: promptId,
      workspace_id: params.workspaceId,
      image_type: params.imageType,
      industry: style.industry,
      backlink_type: backlinkType ?? null,
      prompt_template: promptPack.prompt,
      assembled_prompt: promptPack.prompt,
      negative_prompt: promptPack.negativePrompt,
      style_tags: [style.mood, style.photographyStyle],
      aspect_ratio: promptPack.aspectRatio,
      recommended_provider: promptPack.recommendedProvider,
      source: 'agent',
    });

    const assetId = randomUUID();
    await getSupabaseAdmin().from('image_assets').insert({
      id: assetId,
      workspace_id: params.workspaceId,
      opportunity_id: params.opportunityId ?? null,
      campaign_id: params.campaignId ?? null,
      image_type: params.imageType,
      width: promptPack.width,
      height: promptPack.height,
      provider_key: providerKey,
      prompt_id: promptId,
      prompt_library_id: promptId,
      status: 'generating',
      settings: promptPack.qualitySettings,
      created_by: params.userId ?? null,
    });

    // Bridge to V1.1 media_asset_briefs when opportunity present
    if (params.opportunityId) {
      const briefId = randomUUID();
      await getSupabaseAdmin().from('media_asset_briefs').insert({
        id: briefId,
        workspace_id: params.workspaceId,
        opportunity_id: params.opportunityId,
        kind: 'image',
        brief: {
          imageType: params.imageType,
          prompt: promptPack.prompt,
          assetId,
          source: 'image_intelligence',
        },
        review_status: 'queued',
      });
      await getSupabaseAdmin().from('image_assets').update({ brief_id: briefId }).eq('id', assetId);
    }

    const jobId = randomUUID();
    await getSupabaseAdmin().from('image_generation_jobs').insert({
      id: jobId,
      workspace_id: params.workspaceId,
      asset_id: assetId,
      opportunity_id: params.opportunityId ?? null,
      job_type: 'generate',
      provider_key: providerKey,
      status: 'queued',
      input: {
        prompt: promptPack.prompt,
        negativePrompt: promptPack.negativePrompt,
        width: promptPack.width,
        height: promptPack.height,
        imageType: params.imageType,
        brandName: ws?.name,
        topic,
      },
      created_by: params.userId ?? null,
    });

    await enqueueJob(
      QUEUES.LOW,
      'image_generate',
      {
        type: 'image_generate',
        jobId,
        workspaceId: params.workspaceId,
        assetId,
      },
      { singletonKey: `img-gen-${assetId}`, retryLimit: 2 }
    );

    jobs.push({ jobId, assetId, promptId });
  }

  return { jobs, imageTypes: IMAGE_TYPES };
}

export async function listImages(workspaceId: string, status?: string) {
  let q = getSupabaseAdmin()
    .from('image_assets')
    .select('*, image_metadata(*)')
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(100);
  if (status) q = q.eq('status', status);
  const { data } = await q;
  return data ?? [];
}

export async function listImageJobs(workspaceId: string) {
  const { data } = await getSupabaseAdmin()
    .from('image_generation_jobs')
    .select('*')
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(50);
  return data ?? [];
}

export type ReadinessCheckKey =
  | 'opportunity'
  | 'brief'
  | 'project'
  | 'provider_configured'
  | 'provider_healthy'
  | 'feature_flag'
  | 'storage'
  | 'worker'
  | 'credentials';

export type ReadinessCheck = {
  key: ReadinessCheckKey;
  label: string;
  ok: boolean;
  reason: string;
  fixLabel?: string;
  fixHref?: string;
};

/**
 * Image generation readiness — never silently fails. Explains why Generate is blocked.
 * Supports every registered provider (no hardcoding to a single vendor).
 */
export async function getImageGenerationReadiness(params: {
  workspaceId: string;
  opportunityId?: string;
  projectId?: string;
}) {
  const workspaceId = params.workspaceId;
  const opportunityId = params.opportunityId;

  const { data: project } = await getSupabaseAdmin()
    .from('workspaces')
    .select('id, name, domain')
    .eq('id', workspaceId)
    .maybeSingle();

  let opportunityOk = Boolean(opportunityId);
  let opportunityLabel = 'No opportunity selected';
  if (opportunityId) {
    const { data: opp } = await getSupabaseAdmin()
      .from('opportunities')
      .select('id, title, domain, website_name')
      .eq('id', opportunityId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    opportunityOk = Boolean(opp);
    opportunityLabel = opp
      ? `Selected: ${opp.website_name || opp.domain || opp.title}`
      : 'Opportunity not found in this project';
  }

  let briefOk = false;
  let briefLabel = 'Waiting for Image Brief — Generate Brief First';
  let briefId: string | null = null;
  if (opportunityId) {
    const { data: briefs } = await getSupabaseAdmin()
      .from('media_asset_briefs')
      .select('id, review_status, brief, created_at')
      .eq('workspace_id', workspaceId)
      .eq('opportunity_id', opportunityId)
      .eq('kind', 'image')
      .order('created_at', { ascending: false })
      .limit(1);
    const brief = briefs?.[0];
    if (brief) {
      briefOk = true;
      briefId = String(brief.id);
      briefLabel = `Brief ready (${brief.review_status})`;
    }
  }

  const flagOk = DEFAULT_FEATURE_FLAGS.v13_image_generation === true;
  const pifImageOk = DEFAULT_FEATURE_FLAGS.provider_image !== false;

  const providerDescriptors = registry.providers();
  const providerStates = await Promise.all(
    providerDescriptors.map(async (p) => {
      const allowed = providerAllowed(p.key);
      let health: { status: string; message?: string; latencyMs?: number } = {
        status: 'down',
        message: 'unavailable',
      };
      try {
        health = await registry.get(p.key).health();
      } catch (err) {
        health = {
          status: 'down',
          message: err instanceof Error ? err.message : 'health failed',
        };
      }
      const caps = registry.get(p.key).capabilities();
      const urlEnvKey = `IMAGE_${p.key.toUpperCase().replace(/-/g, '_')}_URL`;
      const envConfigured =
        Boolean(process.env[urlEnvKey]) ||
        Boolean(caps.freeDefault) ||
        // Legacy env aliases used in Railway/docs
        (p.key === 'flux' && Boolean(process.env.IMAGE_FLUX_URL)) ||
        (p.key === 'sdxl' && Boolean(process.env.IMAGE_SDXL_URL)) ||
        (p.key === 'comfy' && Boolean(process.env.IMAGE_COMFY_URL));
      const draftMode = health.status === 'unconfigured' && caps.freeDefault === true;
      const healthyEnough =
        health.status === 'healthy' ||
        health.status === 'degraded' ||
        draftMode;
      return {
        key: p.key,
        displayName: p.displayName,
        flagEnabled: allowed,
        configured: envConfigured,
        healthy: healthyEnough,
        draftMode,
        health,
        freeDefault: caps.freeDefault === true,
      };
    })
  );

  const usableProviders = providerStates.filter((p) => p.flagEnabled && p.configured);
  const healthyProviders = usableProviders.filter((p) => p.healthy);
  const defaultProvider =
    healthyProviders.find((p) => p.key === (process.env.IMAGE_PROVIDER_DEFAULT ?? 'flux')) ??
    healthyProviders[0] ??
    usableProviders[0] ??
    null;

  const providerConfiguredOk = usableProviders.length > 0;
  const providerHealthyOk = healthyProviders.length > 0;
  const credentialsOk =
    Boolean(defaultProvider) &&
    (defaultProvider!.draftMode ||
      Boolean(process.env.IMAGE_PROVIDER_API_KEY) ||
      defaultProvider!.health.status === 'healthy' ||
      defaultProvider!.health.status === 'degraded' ||
      defaultProvider!.freeDefault);

  let storageOk = false;
  let storageLabel = 'Storage bucket missing';
  try {
    const { data: buckets, error } = await getSupabaseAdmin().storage.listBuckets();
    if (error) {
      storageLabel = `Storage check failed: ${error.message}`;
    } else {
      const hit = (buckets ?? []).find((b) => b.name === 'image-intelligence');
      storageOk = Boolean(hit);
      storageLabel = hit
        ? 'Bucket image-intelligence ready'
        : 'Storage Bucket Missing — create bucket image-intelligence';
    }
  } catch (err) {
    storageLabel = err instanceof Error ? err.message : 'Storage unreachable';
  }

  let workerOk = false;
  let workerLabel = 'Worker unavailable';
  try {
    const { getBoss } = await import('../../jobs/boss.js');
    const { getEnv } = await import('../../config/env.js');
    const env = getEnv();
    if (!env.ENABLE_WORKERS) {
      workerLabel = 'Workers disabled (ENABLE_WORKERS=false)';
    } else {
      const boss = await getBoss();
      workerOk = Boolean(boss);
      workerLabel = boss ? 'LOW queue worker available' : 'Queue boss not initialized';
    }
  } catch (err) {
    workerLabel = err instanceof Error ? err.message : 'Worker check failed';
  }

  const checks: ReadinessCheck[] = [
    {
      key: 'opportunity',
      label: 'Opportunity Selected',
      ok: opportunityOk,
      reason: opportunityLabel,
      fixLabel: opportunityOk ? undefined : 'Open Opportunity Queue',
      fixHref: opportunityOk ? undefined : 'campaigns/queue',
    },
    {
      key: 'brief',
      label: 'Image Brief Generated',
      ok: briefOk,
      reason: briefLabel,
      fixLabel: briefOk ? undefined : 'Generate Brief First',
    },
    {
      key: 'project',
      label: 'Project Exists',
      ok: Boolean(project),
      reason: project ? `Project: ${project.name}` : 'Project/workspace not found',
    },
    {
      key: 'provider_configured',
      label: 'Provider Configured',
      ok: providerConfiguredOk,
      reason: providerConfiguredOk
        ? `Configured: ${usableProviders.map((p) => p.displayName).join(', ')}`
        : 'No Image Generation Provider Configured',
      fixLabel: providerConfiguredOk ? undefined : 'Configure Provider',
      fixHref: providerConfiguredOk ? undefined : 'providers',
    },
    {
      key: 'provider_healthy',
      label: 'Provider Healthy',
      ok: providerHealthyOk,
      reason: providerHealthyOk
        ? healthyProviders
            .map(
              (p) =>
                `${p.displayName}: ${p.draftMode ? 'draft mode' : p.health.status}${
                  p.health.latencyMs != null ? ` (${p.health.latencyMs}ms)` : ''
                }`
            )
            .join(' · ')
        : 'Provider Offline or unconfigured',
      fixLabel: providerHealthyOk ? undefined : 'Retry Health Check',
      fixHref: providerHealthyOk ? undefined : 'providers',
    },
    {
      key: 'feature_flag',
      label: 'Feature Enabled',
      ok: flagOk && pifImageOk,
      reason: !flagOk
        ? 'Feature Flag Disabled (v13_image_generation)'
        : !pifImageOk
          ? 'Provider image flag disabled (provider_image)'
          : 'v13_image_generation enabled',
      fixLabel: flagOk && pifImageOk ? undefined : 'Enable Image Generation',
      fixHref: flagOk && pifImageOk ? undefined : 'diagnostics',
    },
    {
      key: 'storage',
      label: 'Storage Ready',
      ok: storageOk,
      reason: storageLabel,
      fixLabel: storageOk ? undefined : 'Create Storage',
      fixHref: storageOk ? undefined : 'diagnostics',
    },
    {
      key: 'worker',
      label: 'Worker Ready',
      ok: workerOk,
      reason: workerLabel,
      fixLabel: workerOk ? undefined : 'Check Workers',
      fixHref: workerOk ? undefined : 'diagnostics',
    },
    {
      key: 'credentials',
      label: 'Provider Credentials Valid',
      ok: credentialsOk,
      reason: credentialsOk
        ? defaultProvider?.draftMode
          ? `${defaultProvider.displayName} local draft mode (set IMAGE_*_URL for live raster)`
          : `${defaultProvider?.displayName ?? 'Provider'} credentials OK`
        : 'Provider credentials missing or invalid',
      fixLabel: credentialsOk ? undefined : 'Open Provider Settings',
      fixHref: credentialsOk ? undefined : 'providers',
    },
  ];

  const imageGenerationReady = checks.every((c) => c.ok);
  const failed = checks.filter((c) => !c.ok);
  const primaryBlocker = failed[0] ?? null;
  const readinessScore = Math.round(
    (checks.filter((c) => c.ok).length / Math.max(checks.length, 1)) * 100
  );

  const activeJobs = (await listImageJobs(workspaceId)).filter((j) =>
    ['queued', 'running'].includes(String(j.status))
  );

  return {
    imageGenerationReady,
    overallStatus: imageGenerationReady ? ('READY' as const) : ('NOT READY' as const),
    readinessScore,
    checks,
    primaryBlocker,
    providers: providerStates,
    defaultProviderKey: defaultProvider?.key ?? null,
    briefId,
    opportunityId: opportunityId ?? null,
    activeJobs: activeJobs.length,
    generationStatus: imageGenerationReady
      ? 'ready'
      : primaryBlocker?.key === 'feature_flag'
        ? 'feature_disabled'
        : primaryBlocker?.key === 'brief'
          ? 'waiting_for_brief'
          : primaryBlocker?.key === 'provider_configured' || primaryBlocker?.key === 'provider_healthy'
            ? 'provider_not_ready'
            : 'blocked',
  };
}

export async function getImageGenerationDiagnostics(workspaceId: string) {
  const readiness = await getImageGenerationReadiness({ workspaceId });
  const stats = await getImageStatistics(workspaceId).catch(() => null);
  const jobs = await listImageJobs(workspaceId);
  return {
    ...readiness,
    currentProvider: readiness.defaultProviderKey,
    statistics: stats,
    recentJobs: jobs.slice(0, 10),
    flags: {
      v13_image_generation: DEFAULT_FEATURE_FLAGS.v13_image_generation,
      v13_flux: DEFAULT_FEATURE_FLAGS.v13_flux,
      v13_sdxl: DEFAULT_FEATURE_FLAGS.v13_sdxl,
      v13_comfy: DEFAULT_FEATURE_FLAGS.v13_comfy,
      provider_image: DEFAULT_FEATURE_FLAGS.provider_image,
    },
    apiStatus: 'ok',
  };
}

export async function getImageStatistics(workspaceId: string) {
  const assets = await listImages(workspaceId);
  const counts = {
    generated: assets.length,
    queued: 0,
    approved: 0,
    submitted: 0,
    verified: 0,
    rejected: 0,
    failed: 0,
  };
  const providers: Record<string, number> = {};
  for (const a of assets) {
    const s = String(a.status);
    if (s === 'generating' || s === 'scored') counts.queued++;
    else if (s === 'approved' || s === 'ready') counts.approved++;
    else if (s === 'submitted' || s === 'pending') counts.submitted++;
    else if (s === 'verified') counts.verified++;
    else if (s === 'rejected') counts.rejected++;
    else if (s === 'failed') counts.failed++;
    providers[String(a.provider_key)] = (providers[String(a.provider_key)] ?? 0) + 1;
  }
  const bestProvider =
    Object.entries(providers).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'flux';

  const day = new Date().toISOString().slice(0, 10);
  await getSupabaseAdmin().from('image_statistics').upsert(
    {
      workspace_id: workspaceId,
      day,
      generated: counts.generated,
      queued: counts.queued,
      approved: counts.approved,
      submitted: counts.submitted,
      verified: counts.verified,
      rejected: counts.rejected,
      failed: counts.failed,
      best_provider: bestProvider,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'workspace_id,day' }
  );

  const providerHealth = await Promise.all(
    registry.providers().map(async (p) => {
      try {
        const h = await registry.get(p.key).health();
        return { key: p.key, ...h };
      } catch {
        return { key: p.key, status: 'down' as const, message: 'error' };
      }
    })
  );

  return {
    ...counts,
    bestProvider,
    bestStyle: 'editorial',
    todaysImages: counts.generated,
    providerHealth,
    metricsSource: 'live' as const,
  };
}

export async function prepareImageSubmission(params: {
  workspaceId: string;
  assetId: string;
  siteKey?: string;
  userId?: string;
}) {
  requireIie();
  const { data: asset } = await getSupabaseAdmin()
    .from('image_assets')
    .select('*, image_metadata(*)')
    .eq('id', params.assetId)
    .eq('workspace_id', params.workspaceId)
    .single();
  if (!asset) throw Object.assign(new Error('Asset not found'), { status: 404 });
  if (!['approved', 'ready', 'scored'].includes(String(asset.status))) {
    throw Object.assign(new Error('Asset must pass quality and be approved/ready'), { status: 400 });
  }

  const metaRow = Array.isArray(asset.image_metadata)
    ? asset.image_metadata[0]
    : asset.image_metadata;
  const metadata =
    metaRow ??
    buildImageMetadata({
      brandName: 'Brand',
      imageType: String(asset.image_type),
      width: Number(asset.width ?? 1200),
      height: Number(asset.height ?? 630),
    });

  let maxBytes: number | undefined;
  if (params.siteKey) {
    const { data: req } = await getSupabaseAdmin()
      .from('image_submission_requirements')
      .select('*')
      .eq('site_key', params.siteKey)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();
    maxBytes = req?.max_bytes ?? undefined;
  }

  const pkg = buildSubmissionPackage({
    metadata: metadata as ReturnType<typeof buildImageMetadata>,
    width: Number(asset.width ?? 1200),
    height: Number(asset.height ?? 630),
    mimeType: String(asset.mime_type ?? 'image/png'),
    siteKey: params.siteKey,
    maxBytes,
  });

  const id = randomUUID();
  await getSupabaseAdmin().from('image_submission_history').insert({
    id,
    workspace_id: params.workspaceId,
    asset_id: params.assetId,
    site_key: params.siteKey ?? null,
    status: 'ready',
    checklist: pkg.checklist,
    package: pkg,
    created_by: params.userId ?? null,
  });
  await getSupabaseAdmin()
    .from('image_assets')
    .update({ status: 'queued_submission', updated_at: new Date().toISOString() })
    .eq('id', params.assetId);

  return { id, package: pkg };
}

export async function reviewImageAsset(
  workspaceId: string,
  assetId: string,
  status: 'approved' | 'rejected',
  reason?: string
) {
  await getSupabaseAdmin()
    .from('image_assets')
    .update({
      status: status === 'approved' ? 'ready' : 'rejected',
      rejected_reason: reason ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', assetId)
    .eq('workspace_id', workspaceId);

  await getSupabaseAdmin().from('image_learning').insert({
    id: randomUUID(),
    workspace_id: workspaceId,
    asset_id: assetId,
    signal: status,
    weight: status === 'approved' ? 1 : -1,
  });

  await enqueueJob(QUEUES.LOW, 'image_learning', {
    type: 'image_learning',
    workspaceId,
    assetId,
    signal: status,
  });

  return { assetId, status };
}

export async function enqueueImageTransform(params: {
  workspaceId: string;
  assetId: string;
  jobType: 'variation' | 'upscale' | 'remove_background' | 'regenerate';
  userId?: string;
}) {
  requireIie();
  const { data: asset } = await getSupabaseAdmin()
    .from('image_assets')
    .select('*')
    .eq('id', params.assetId)
    .eq('workspace_id', params.workspaceId)
    .single();
  if (!asset) throw Object.assign(new Error('Asset not found'), { status: 404 });

  const jobId = randomUUID();
  await getSupabaseAdmin().from('image_generation_jobs').insert({
    id: jobId,
    workspace_id: params.workspaceId,
    asset_id: params.assetId,
    job_type: params.jobType === 'regenerate' ? 'regenerate' : params.jobType,
    provider_key: asset.provider_key,
    status: 'queued',
    input: { sourceAssetId: params.assetId },
    created_by: params.userId ?? null,
  });

  await enqueueJob(
    QUEUES.LOW,
    'image_generate',
    {
      type: 'image_generate',
      jobId,
      workspaceId: params.workspaceId,
      assetId: params.assetId,
      transform: params.jobType,
    },
    { singletonKey: `img-${params.jobType}-${params.assetId}-${jobId.slice(0, 8)}` }
  );

  return { jobId };
}

export async function replayImage(workspaceId: string, assetId: string, userId?: string) {
  const { data: asset } = await getSupabaseAdmin()
    .from('image_assets')
    .select('*')
    .eq('id', assetId)
    .eq('workspace_id', workspaceId)
    .single();
  if (!asset) throw Object.assign(new Error('Asset not found'), { status: 404 });
  return enqueueImageGenerate({
    workspaceId,
    opportunityId: asset.opportunity_id ?? undefined,
    imageType: String(asset.image_type),
    providerKey: String(asset.provider_key),
    width: asset.width ?? undefined,
    height: asset.height ?? undefined,
    userId,
  });
}

export { scoreImageQuality, buildImageMetadata, IMAGE_TYPES };
export type { ImageType };

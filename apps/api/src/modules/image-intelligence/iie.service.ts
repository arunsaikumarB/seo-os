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
  if (key === 'flux') return DEFAULT_FEATURE_FLAGS.v13_flux;
  if (key === 'sdxl') return DEFAULT_FEATURE_FLAGS.v13_sdxl;
  if (key === 'comfy') return DEFAULT_FEATURE_FLAGS.v13_comfy;
  return false;
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

import { randomUUID } from 'node:crypto';
import { buildImageMetadata, scoreImageQuality } from '@seo-os/backlink-builder';
import { createImageProviderRegistry } from '@seo-os/providers';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { logger } from '../../lib/logger.js';

const registry = createImageProviderRegistry('flux');

async function uploadAsset(
  workspaceId: string,
  assetId: string,
  folder: string,
  bytes: Buffer,
  mimeType: string
): Promise<string> {
  const ext = mimeType.includes('svg') ? 'svg' : mimeType.includes('webp') ? 'webp' : 'png';
  const path = `projects/${workspaceId}/blog/images/${folder}/${assetId}.${ext}`;
  try {
    await getSupabaseAdmin().storage.from('image-intelligence').upload(path, bytes, {
      contentType: mimeType,
      upsert: true,
    });
  } catch (err) {
    logger.debug({ err, path }, 'IIE storage upload skipped (bucket may be missing)');
  }
  return path;
}

export async function handleImageJobs(
  jobs: Array<{ id: string; data: Record<string, unknown> }>
): Promise<void> {
  for (const job of jobs) {
    const type = String(job.data.type ?? '');
    if (type === 'image_learning') {
      await handleLearning(job.data);
      continue;
    }
    if (type === 'image_cleanup' || type === 'image_statistics') {
      await refreshStats(String(job.data.workspaceId ?? ''));
      continue;
    }
    if (type !== 'image_generate') continue;

    const jobId = String(job.data.jobId ?? '');
    const workspaceId = String(job.data.workspaceId ?? '');
    const assetId = String(job.data.assetId ?? '');
    const transform = job.data.transform ? String(job.data.transform) : 'generate';

    try {
      await getSupabaseAdmin()
        .from('image_generation_jobs')
        .update({ status: 'running', started_at: new Date().toISOString(), attempts: 1 })
        .eq('id', jobId);

      const { data: genJob } = await getSupabaseAdmin()
        .from('image_generation_jobs')
        .select('*')
        .eq('id', jobId)
        .single();
      const { data: asset } = await getSupabaseAdmin()
        .from('image_assets')
        .select('*')
        .eq('id', assetId)
        .single();
      if (!genJob || !asset) throw new Error('Job or asset missing');

      const provider = registry.get(String(genJob.provider_key ?? 'flux'));
      const input = (genJob.input ?? {}) as Record<string, unknown>;
      const width = Number(input.width ?? asset.width ?? 1200);
      const height = Number(input.height ?? asset.height ?? 630);
      const prompt = String(input.prompt ?? 'professional brand visual');

      let result;
      if (transform === 'variation' && provider.variation) {
        result = await provider.variation({
          prompt: `${prompt}, variation`,
          negativePrompt: String(input.negativePrompt ?? ''),
          width,
          height,
          imageType: String(asset.image_type),
          workspaceId,
        });
      } else if (transform === 'upscale' && provider.upscale) {
        throw new Error('Upscale requires provider support and source bytes');
      } else if (transform === 'remove_background' && provider.removeBackground) {
        throw new Error('Remove background requires provider support and source bytes');
      } else {
        result = await provider.generate({
          prompt,
          negativePrompt: String(input.negativePrompt ?? ''),
          width,
          height,
          imageType: String(asset.image_type),
          workspaceId,
          seed: Number(input.seed ?? Date.now() % 1e9),
        });
      }

      const brandName = String(input.brandName ?? 'Brand');
      const metadata = buildImageMetadata({
        brandName,
        imageType: String(asset.image_type),
        topic: input.topic ? String(input.topic) : undefined,
        width: result.width,
        height: result.height,
      });

      const scores = scoreImageQuality({
        width: result.width,
        height: result.height,
        mimeType: result.mimeType,
        byteLength: result.bytes.length,
        imageType: String(asset.image_type),
        hasMetadata: true,
        providerMode: String(result.providerMeta?.mode ?? 'live'),
      });

      const folder = scores.pass ? 'generated' : 'rejected';
      const storagePath = await uploadAsset(
        workspaceId,
        assetId,
        folder,
        result.bytes,
        result.mimeType
      );

      await getSupabaseAdmin().from('image_metadata').upsert(
        {
          asset_id: assetId,
          workspace_id: workspaceId,
          seo_filename: metadata.seoFilename,
          image_title: metadata.imageTitle,
          alt_text: metadata.altText,
          caption: metadata.caption,
          description: metadata.description,
          keywords: metadata.keywords,
          tags: metadata.tags,
          categories: metadata.categories,
          og_metadata: metadata.ogMetadata,
          twitter_metadata: metadata.twitterMetadata,
          structured_data: metadata.structuredData,
          exif_suggestions: metadata.exifSuggestions,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'asset_id' }
      );

      await getSupabaseAdmin()
        .from('image_assets')
        .update({
          status: scores.pass ? 'scored' : 'rejected',
          width: result.width,
          height: result.height,
          mime_type: result.mimeType,
          storage_path: storagePath,
          quality_scores: scores,
          rejected_reason: scores.rejectReason ?? null,
          seed: result.seed ?? null,
          settings: { ...(asset.settings as object), providerMeta: result.providerMeta },
          updated_at: new Date().toISOString(),
        })
        .eq('id', assetId);

      // Auto-approve high quality into ready
      if (scores.pass && scores.overall >= 75) {
        await getSupabaseAdmin()
          .from('image_assets')
          .update({ status: 'ready', updated_at: new Date().toISOString() })
          .eq('id', assetId);
        await uploadAsset(workspaceId, assetId, 'approved', result.bytes, result.mimeType);
      }

      await getSupabaseAdmin()
        .from('image_generation_jobs')
        .update({
          status: 'completed',
          finished_at: new Date().toISOString(),
          result: { storagePath, scores, mimeType: result.mimeType },
        })
        .eq('id', jobId);

      await refreshStats(workspaceId);
      logger.info({ jobId, assetId, pass: scores.pass }, 'IIE generate completed');
    } catch (err) {
      logger.error({ err, jobId }, 'IIE generate failed');
      await getSupabaseAdmin()
        .from('image_generation_jobs')
        .update({
          status: 'failed',
          error_message: err instanceof Error ? err.message : 'failed',
          finished_at: new Date().toISOString(),
        })
        .eq('id', jobId);
      await getSupabaseAdmin()
        .from('image_assets')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', assetId);
    }
  }
}

async function handleLearning(data: Record<string, unknown>) {
  const workspaceId = String(data.workspaceId ?? '');
  const assetId = String(data.assetId ?? '');
  const signal = String(data.signal ?? '');
  const { data: asset } = await getSupabaseAdmin()
    .from('image_assets')
    .select('provider_key, image_type, prompt_library_id')
    .eq('id', assetId)
    .maybeSingle();
  if (!asset?.prompt_library_id) return;

  const { data: prompt } = await getSupabaseAdmin()
    .from('image_prompt_library')
    .select('performance')
    .eq('id', asset.prompt_library_id)
    .maybeSingle();
  const perf = (prompt?.performance as Record<string, number>) ?? {};
  const key = signal === 'approved' ? 'approvals' : 'rejections';
  perf[key] = (perf[key] ?? 0) + 1;
  await getSupabaseAdmin()
    .from('image_prompt_library')
    .update({
      performance: perf,
      source: 'learned',
      updated_at: new Date().toISOString(),
    })
    .eq('id', asset.prompt_library_id);

  await getSupabaseAdmin().from('image_learning').insert({
    id: randomUUID(),
    workspace_id: workspaceId,
    asset_id: assetId,
    signal: signal === 'approved' ? 'approved' : 'rejected',
    provider_key: asset.provider_key,
    image_type: asset.image_type,
  });
}

async function refreshStats(workspaceId: string) {
  if (!workspaceId) return;
  const { data: assets } = await getSupabaseAdmin()
    .from('image_assets')
    .select('status, provider_key')
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null);
  const day = new Date().toISOString().slice(0, 10);
  const counts = { generated: 0, approved: 0, rejected: 0, submitted: 0, verified: 0, failed: 0, queued: 0 };
  for (const a of assets ?? []) {
    counts.generated++;
    const s = String(a.status);
    if (s === 'ready' || s === 'approved') counts.approved++;
    else if (s === 'rejected') counts.rejected++;
    else if (s === 'submitted' || s === 'pending' || s === 'queued_submission') counts.submitted++;
    else if (s === 'verified') counts.verified++;
    else if (s === 'failed') counts.failed++;
    else if (s === 'generating' || s === 'scored') counts.queued++;
  }
  await getSupabaseAdmin().from('image_statistics').upsert(
    {
      workspace_id: workspaceId,
      day,
      ...counts,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'workspace_id,day' }
  );
}

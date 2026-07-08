import { randomUUID } from 'node:crypto';
import {
  discoverSitemapUrls,
  extractMetadataFromHtml,
  detectTechStack,
  buildBrandProfile,
} from '@seo-os/seo-intelligence';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { logResearchEvent } from './research.service.js';
import { enqueueJob, QUEUES } from '../../jobs/boss.js';
import { getEnv } from '../../config/env.js';

export async function listScans(workspaceId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from('website_scans')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) throw error;
  return data ?? [];
}

export async function getScan(scanId: string, workspaceId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from('website_scans')
    .select('*')
    .eq('id', scanId)
    .eq('workspace_id', workspaceId)
    .single();

  if (error) return null;
  return data;
}

export async function getScanPages(scanId: string, workspaceId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from('website_pages')
    .select('*')
    .eq('scan_id', scanId)
    .eq('workspace_id', workspaceId)
    .order('path');

  if (error) throw error;
  return data ?? [];
}

export async function startWebsiteScan(workspaceId: string, userId: string, targetUrl: string) {
  const id = randomUUID();
  const { data, error } = await getSupabaseAdmin()
    .from('website_scans')
    .insert({
      id,
      workspace_id: workspaceId,
      target_url: targetUrl,
      status: 'queued',
      phase: 'init',
      created_by: userId,
    })
    .select()
    .single();

  if (error) throw error;

  await logResearchEvent(workspaceId, {
    eventType: 'website_scan.queued',
    phase: 'init',
    title: 'Website scan queued',
    payload: { scanId: id, targetUrl },
  });

  if (getEnv().ENABLE_WORKERS) {
    await enqueueJob(QUEUES.LOW, 'intelligence.scan', { scanId: id, workspaceId });
  } else {
    await executeWebsiteScan(id, workspaceId);
  }

  return data;
}

export async function executeWebsiteScan(scanId: string, workspaceId: string) {
  const supabase = getSupabaseAdmin();
  const { data: scan } = await supabase
    .from('website_scans')
    .select('*')
    .eq('id', scanId)
    .single();

  if (!scan) throw new Error('Scan not found');

  const updatePhase = async (phase: string, extra?: Record<string, unknown>) => {
    await supabase.from('website_scans').update({ phase, ...extra }).eq('id', scanId);
    await logResearchEvent(workspaceId, {
      eventType: 'website_scan.progress',
      phase,
      title: `Website scan: ${phase.replace(/_/g, ' ')}`,
      payload: { scanId },
    });
  };

  try {
    await supabase
      .from('website_scans')
      .update({ status: 'running', started_at: new Date().toISOString() })
      .eq('id', scanId);

    await updatePhase('sitemap_discovery');
    const pageUrls = await discoverSitemapUrls(scan.target_url, 50);
    const sitemapUrl = pageUrls.length > 1 ? `${new URL(scan.target_url).origin}/sitemap.xml` : null;

    await updatePhase('page_discovery', { pages_discovered: pageUrls.length, sitemap_url: sitemapUrl });

    const pages: Array<Record<string, unknown>> = [];
    let techStack: Record<string, unknown> = {};
    let brandProfile: Record<string, unknown> = {};

    for (let i = 0; i < pageUrls.length; i++) {
      const url = pageUrls[i];
      try {
        const res = await fetch(url, {
          signal: AbortSignal.timeout(12000),
          headers: { 'User-Agent': 'SEO-OS-Scanner/1.0' },
        });
        if (!res.ok) continue;
        const html = await res.text();
        const headers: Record<string, string> = {};
        res.headers.forEach((v, k) => {
          headers[k] = v;
        });

        const meta = extractMetadataFromHtml(url, html);
        pages.push({
          id: randomUUID(),
          scan_id: scanId,
          workspace_id: workspaceId,
          url: meta.url,
          path: meta.path,
          title: meta.title,
          meta_description: meta.metaDescription,
          h1: meta.h1,
          schema_types: meta.schemaTypes,
          word_count: meta.wordCount,
          discovered_via: i === 0 ? 'homepage' : 'sitemap',
        });

        if (i === 0) {
          techStack = detectTechStack(html, headers) as unknown as Record<string, unknown>;
          brandProfile = buildBrandProfile(meta, html) as unknown as Record<string, unknown>;
        }
      } catch {
        continue;
      }
    }

    await updatePhase('metadata_extraction', { pages_analyzed: pages.length });

    if (pages.length > 0) {
      await supabase.from('website_pages').delete().eq('scan_id', scanId);
      await supabase.from('website_pages').insert(pages);
    }

    await updatePhase('brand_profile');
    await updatePhase('content_inventory');

    const contentInventory = {
      totalPages: pages.length,
      withSchema: pages.filter((p) => (p.schema_types as string[])?.length > 0).length,
      avgWordCount:
        pages.length > 0
          ? Math.round(
              pages.reduce((s, p) => s + (p.word_count as number), 0) / pages.length
            )
          : 0,
    };

    await supabase
      .from('website_scans')
      .update({
        status: 'completed',
        phase: 'complete',
        pages_discovered: pageUrls.length,
        pages_analyzed: pages.length,
        brand_profile: brandProfile,
        tech_stack: techStack,
        content_inventory: contentInventory,
        completed_at: new Date().toISOString(),
      })
      .eq('id', scanId);

    await logResearchEvent(workspaceId, {
      eventType: 'website_scan.completed',
      phase: 'complete',
      title: `Website scan complete — ${pages.length} pages analyzed`,
      payload: { scanId, pages: pages.length },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Scan failed';
    await supabase
      .from('website_scans')
      .update({ status: 'failed', error: message, completed_at: new Date().toISOString() })
      .eq('id', scanId);
    await logResearchEvent(workspaceId, {
      eventType: 'website_scan.failed',
      title: 'Website scan failed',
      payload: { scanId, error: message },
    });
    throw err;
  }
}

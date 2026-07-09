import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { logResearchEvent } from './research.service.js';
import { enqueueJob, QUEUES } from '../../jobs/boss.js';
import { getEnv } from '../../config/env.js';
import { executeBrowserIntelligenceScan } from './browser-intelligence.service.js';

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
    await enqueueJob(
      QUEUES.CRAWL,
      'browser.intelligence.scan',
      { scanId: id, workspaceId },
      { singletonKey: id }
    );
  } else {
    await executeBrowserIntelligenceScan(id, workspaceId);
  }

  return data;
}

export async function executeWebsiteScan(scanId: string, workspaceId: string, orgId?: string) {
  return executeBrowserIntelligenceScan(scanId, workspaceId, orgId);
}

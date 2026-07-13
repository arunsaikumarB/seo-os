/**
 * BEE session persistence + reuse helpers.
 * Stores encrypted Playwright storage state; never stores passwords/OTP.
 */
import { encryptJson, decryptJson } from '@seo-os/integrations';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { logger } from '../../lib/logger.js';
import {
  getSessionRuntime,
  type BrowserExecutionService,
} from './browser-runtime.service.js';

function encKey(): string | undefined {
  return process.env.ENCRYPTION_KEY;
}

export async function persistSessionStorageState(sessionId: string): Promise<boolean> {
  const runtime = getSessionRuntime(sessionId);
  try {
    const state = await runtime.exportStorageState();
    if (!state || typeof state !== 'object') return false;
    const enc = encryptJson(state as Record<string, unknown>, encKey());
    await getSupabaseAdmin()
      .from('browser_sessions')
      .update({
        storage_state_enc: enc,
        cookies_ref: { savedAt: new Date().toISOString() },
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId);
    return true;
  } catch (err) {
    logger.warn({ err, sessionId }, 'Failed to persist browser storage state');
    return false;
  }
}

export async function loadStorageStateFromSession(
  sessionRow: { storage_state_enc?: unknown }
): Promise<unknown | null> {
  const enc = sessionRow.storage_state_enc as
    | { ciphertext: string; iv: string; authTag?: string | null }
    | null
    | undefined;
  if (!enc?.ciphertext || !enc?.iv) return null;
  try {
    return decryptJson(enc, encKey());
  } catch (err) {
    logger.warn({ err }, 'Failed to decrypt browser storage state');
    return null;
  }
}

export async function findReusableSession(
  workspaceId: string,
  siteDomain: string
): Promise<Record<string, unknown> | null> {
  const { data } = await getSupabaseAdmin()
    .from('browser_sessions')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('site_domain', siteDomain)
    .is('deleted_at', null)
    .not('storage_state_enc', 'is', null)
    .in('status', ['closed', 'idle', 'paused'])
    .order('updated_at', { ascending: false })
    .limit(5);
  const now = Date.now();
  for (const row of data ?? []) {
    const expires = row.session_expires_at ? new Date(String(row.session_expires_at)).getTime() : null;
    if (expires && expires < now) continue;
    if (row.storage_state_enc) return row as Record<string, unknown>;
  }
  return null;
}

export async function markSessionAuth(sessionId: string, authDetected: boolean): Promise<void> {
  await getSupabaseAdmin()
    .from('browser_sessions')
    .update({
      auth_detected: authDetected,
      last_reuse_at: new Date().toISOString(),
      session_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId);
}

export async function launchWithOptionalReuse(
  runtime: BrowserExecutionService,
  opts: {
    mode: 'headed' | 'headless';
    storageState?: unknown | null;
  }
): Promise<{ reused: boolean }> {
  await runtime.launch({
    mode: opts.mode,
    storageState: opts.storageState ?? undefined,
  });
  return { reused: Boolean(opts.storageState) };
}

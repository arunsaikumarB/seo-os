import type { Request, Response } from 'express';
import { getEnv } from '../config/env.js';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { getBoss } from '../jobs/boss.js';

export function healthHandler(_req: Request, res: Response): void {
  res.status(200).json({ status: 'ok', service: 'seo-os-api' });
}

export async function readyHandler(_req: Request, res: Response): Promise<void> {
  const checks: Record<string, string> = { api: 'ok' };

  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('organizations').select('id').limit(1);
    checks.database = error ? 'degraded' : 'ok';
  } catch {
    checks.database = 'down';
  }

  try {
    const env = getEnv();
    if (env.ENABLE_WORKERS) {
      const boss = await getBoss();
      checks.queue = boss ? 'ok' : 'down';
    } else {
      checks.queue = 'disabled';
    }
  } catch {
    checks.queue = 'down';
  }

  const allOk = Object.values(checks).every((v) => v === 'ok' || v === 'disabled');
  res.status(allOk ? 200 : 503).json({ status: allOk ? 'ready' : 'not_ready', checks });
}

export function versionHandler(_req: Request, res: Response): void {
  res.json({ version: '0.0.0-sprint0', api: 'v1' });
}

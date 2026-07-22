/**
 * Recover failed_to_start / stuck queued jobs by enqueueing bee_execute retry_start
 * into shared pg-boss so the Railway API worker runs startJob with healthy Chromium.
 *
 * Usage:
 *   $env:ENV_FILE="$env:TEMP\seo-os-api.env"
 *   node apps/api/scripts/recover-execution-starts.mjs
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv(p) {
  const env = {};
  try {
    for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
      const i = line.indexOf('=');
      if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  } catch {
    /* ignore */
  }
  return env;
}

Object.assign(process.env, loadEnv(process.env.ENV_FILE || resolve(__dirname, '../.env')));

const WORKSPACE_ID =
  process.env.VALIDATION_WORKSPACE_ID || 'db9f83a2-f1db-4a9a-9afb-348402fd4d84';

async function main() {
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const bossMod = await import(pathToFileURL(resolve(__dirname, '../dist/jobs/boss.js')).href);
  const { getBoss, ensureRequiredQueues, enqueueJob, QUEUES, areQueuesInitialized } = bossMod;

  console.log('starting pg-boss…');
  await getBoss();
  await ensureRequiredQueues();
  console.log('queuesInitialized', areQueuesInitialized());

  const { data: jobs, error } = await sb
    .from('execution_jobs')
    .select('id, status, disposition, opportunity_id, site_domain, error_message')
    .eq('workspace_id', WORKSPACE_ID)
    .is('deleted_at', null);
  if (error) throw error;

  const targets = (jobs || []).filter((j) => {
    if (j.status === 'skipped') return false;
    if (j.status === 'queued') return true;
    if (j.status === 'waiting_infrastructure') return true;
    if (j.status === 'failed' && j.disposition === 'failed_to_start') return true;
    return false;
  });

  console.log('recover targets', targets.length);

  for (const j of targets) {
    const { error: uErr } = await sb
      .from('execution_jobs')
      .update({
        status: 'queued',
        disposition: null,
        error_code: null,
        error_message: null,
        finished_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', j.id)
      .eq('workspace_id', WORKSPACE_ID);
    if (uErr) {
      console.error('reset failed', j.id, uErr.message);
      continue;
    }

    if (j.opportunity_id) {
      await sb
        .from('opportunities')
        .update({
          campaign_lifecycle: 'Ready',
          submission_status: 'Ready',
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', j.opportunity_id)
        .eq('workspace_id', WORKSPACE_ID);
    }

    const enqId = await enqueueJob(
      QUEUES.PLAYWRIGHT,
      'bee_execute',
      {
        type: 'bee_execute',
        jobId: j.id,
        workspaceId: WORKSPACE_ID,
        action: 'retry_start',
      },
      { singletonKey: `bee-retry-start-${j.id}-${Date.now()}`, retryLimit: 2 }
    );
    console.log('enqueued retry_start', {
      jobId: j.id,
      domain: j.site_domain,
      prev: `${j.status}:${j.disposition || ''}`,
      enqId,
    });
  }

  // Wait briefly then snapshot
  await new Promise((r) => setTimeout(r, 8000));
  const { data: after } = await sb
    .from('execution_jobs')
    .select('status, disposition')
    .eq('workspace_id', WORKSPACE_ID)
    .is('deleted_at', null);
  const counts = {};
  for (const j of after || []) {
    const k = `${j.status}${j.disposition ? ':' + j.disposition : ''}`;
    counts[k] = (counts[k] || 0) + 1;
  }
  console.log('after counts', counts);

  await bossMod.stopBoss?.();
}

main().catch((e) => {
  console.error('RECOVER_FAILED', e);
  process.exit(1);
});

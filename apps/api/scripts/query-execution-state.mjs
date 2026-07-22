/**
 * Snapshot execution_jobs + opportunity lifecycle for Chefgaa (or VALIDATION_WORKSPACE_ID).
 */
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

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

const env = { ...loadEnv(process.env.ENV_FILE || ''), ...process.env };
const ws = env.VALIDATION_WORKSPACE_ID || 'db9f83a2-f1db-4a9a-9afb-348402fd4d84';
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: jobs, error: je } = await sb
  .from('execution_jobs')
  .select('id,status,disposition,error_message,opportunity_id,site_domain,created_at')
  .eq('workspace_id', ws)
  .is('deleted_at', null)
  .order('created_at', { ascending: false })
  .limit(50);
if (je) throw je;

const counts = {};
for (const j of jobs || []) {
  const k = `${j.status}${j.disposition ? ':' + j.disposition : ''}`;
  counts[k] = (counts[k] || 0) + 1;
}
console.log(JSON.stringify({ totalJobs: (jobs || []).length, counts }, null, 2));

const { data: opps, error: oe } = await sb
  .from('opportunities')
  .select('id,website_name,domain,campaign_lifecycle,pipeline_stage,automation_status')
  .eq('workspace_id', ws)
  .not('automation_status', 'in', '("deleted","ignored")')
  .or(
    'campaign_lifecycle.eq.Ready,campaign_lifecycle.eq.Submitting,campaign_lifecycle.eq.Waiting Human,campaign_lifecycle.eq.Failed,pipeline_stage.eq.campaign_ready'
  );
if (oe) throw oe;

const life = {};
for (const o of opps || []) {
  const k = o.campaign_lifecycle || 'null';
  life[k] = (life[k] || 0) + 1;
}
console.log(JSON.stringify({ oppCount: (opps || []).length, life }, null, 2));

const byOpp = new Map();
for (const j of jobs || []) {
  if (!byOpp.has(j.opportunity_id)) byOpp.set(j.opportunity_id, j);
}

const rows = (opps || []).map((o) => {
  const j = byOpp.get(o.id);
  return {
    site: o.website_name || o.domain,
    life: o.campaign_lifecycle,
    job: j ? `${j.status}${j.disposition ? ':' + j.disposition : ''}` : 'NO_JOB',
    err: j?.error_message?.slice?.(0, 100) || null,
  };
});
console.log(JSON.stringify(rows, null, 2));

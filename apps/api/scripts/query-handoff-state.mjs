import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = {};
for (const line of readFileSync(process.env.ENV_FILE, 'utf8').split(/\r?\n/)) {
  const i = line.indexOf('=');
  if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const ws = 'db9f83a2-f1db-4a9a-9afb-348402fd4d84';
const { data, error } = await sb
  .from('opportunities')
  .select(
    'id,website_name,campaign_lifecycle,generation_status,pipeline_stage,queue_status,package_status,package_approved_by,automation_status,metadata'
  )
  .eq('workspace_id', ws)
  .not('automation_status', 'in', '("deleted","ignored")');
if (error) throw error;
const life = {};
const gen = {};
const stage = {};
for (const o of data || []) {
  life[o.campaign_lifecycle || 'null'] = (life[o.campaign_lifecycle || 'null'] || 0) + 1;
  gen[o.generation_status || 'null'] = (gen[o.generation_status || 'null'] || 0) + 1;
  stage[o.pipeline_stage || 'null'] = (stage[o.pipeline_stage || 'null'] || 0) + 1;
}
const stranded = (data || []).filter(
  (o) =>
    o.campaign_lifecycle === 'Package Generated' ||
    (o.generation_status === 'Completed' &&
      !['Ready', 'Submitting', 'Waiting Human', 'Retrying', 'Submitted', 'Verified', 'Completed', 'Failed', 'Skipped', 'Deleted'].includes(
        o.campaign_lifecycle || ''
      ))
);
console.log(JSON.stringify({ n: (data || []).length, life, gen, stage, stranded: stranded.length }, null, 2));
console.log(
  'sample stranded',
  stranded.slice(0, 5).map((o) => ({
    site: o.website_name,
    life: o.campaign_lifecycle,
    gen: o.generation_status,
    stage: o.pipeline_stage,
  }))
);

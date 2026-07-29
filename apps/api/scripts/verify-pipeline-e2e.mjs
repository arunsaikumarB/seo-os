import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import PgBoss from 'pg-boss';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv(p) {
  try {
    const raw = readFileSync(p, 'utf8');
    const env = {};
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m) continue;
      env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
    return env;
  } catch {
    return {};
  }
}

const fileEnv = loadEnv(resolve(__dirname, '../.env'));
const env = { ...fileEnv, ...process.env };
const API = env.API_URL || 'https://api-production-48c9e.up.railway.app';

const DOMAINS = [
  'techradar.com', 'tomshardware.com', 'digitaltrends.com', 'androidauthority.com',
  'xda-developers.com', 'makeuseof.com', 'windowscentral.com', 'howtogeek.com',
  'pcgamer.com', 'techspot.com', 'cnet.com', 'zdnet.com', 'theverge.com',
  'engadget.com', 'arstechnica.com', 'wired.com', 'pcmag.com', 'pcworld.com',
  'techrepublic.com', 'computerworld.com', 'slashdot.org', 'gsmarena.com',
  'phonearena.com', 'androidcentral.com', 'imore.com', 'macrumors.com',
  '9to5mac.com', '9to5google.com', 'androidpolice.com', 'bgr.com',
  'mashable.com', 'gizmodo.com', 'lifehacker.com', 'tomsguide.com',
  'laptopmag.com', 'techadvisor.com', 'creativebloq.com', 'itpro.com',
  'techradar.com', 'digitaltrends.com', // duplicates ok — validator drops
  'forbes.com', 'businessinsider.com', 'venturebeat.com', 'techcrunch.com',
  'thenextweb.com', 'siliconangle.com', 'protocol.com', 'theinformation.com',
  'bloomberg.com', 'reuters.com', 'wsj.com', 'nytimes.com',
  'medium.com', 'dev.to', 'hashnode.dev', 'css-tricks.com',
  'smashingmagazine.com', 'alistapart.com', 'sitepoint.com', 'freecodecamp.org',
  'stackoverflow.com', 'github.com', 'gitlab.com', 'bitbucket.org',
  'producthunt.com', 'indiehackers.com', 'hackernews.com',
];

async function waitForVersion(timeoutMs = 180_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const h = await fetch(`${API}/health`).then((r) => r.json());
      console.log('health', h);
      if (String(h.version || '').includes('1.2.7')) return h;
    } catch (e) {
      console.log('health_wait', e.message);
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error('Timed out waiting for 1.2.7 deploy');
}

async function main() {
  console.log('=== wait for deploy ===');
  await waitForVersion();

  const queues = await fetch(`${API}/ops/queues`).then((r) => r.json());
  console.log('=== /ops/queues ===');
  console.log(JSON.stringify(queues, null, 2));
  const crawl = queues?.data?.queues?.find((q) => q.name === 'crawl');
  if (!crawl?.exists || !crawl?.workerAttached) {
    throw new Error('crawl queue not ready: ' + JSON.stringify(crawl));
  }

  const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Prefer the org the stuck UI used; create a fresh workspace/project under it
  const orgId = 'f1bf720a-be85-49ab-b855-377870904933';
  const { data: member } = await sb
    .from('org_members')
    .select('user_id')
    .eq('org_id', orgId)
    .limit(1)
    .maybeSingle();
  const userId = member?.user_id ?? null;

  const projectId = randomUUID();
  const domain = `verify-${Date.now()}.example`;
  const { error: wsErr } = await sb.from('workspaces').insert({
    id: projectId,
    org_id: orgId,
    name: `Queue Init Verify ${new Date().toISOString().slice(0, 16)}`,
    domain,
    url: `https://${domain}`,
    industry: 'technology',
    status: 'active',
    created_by: userId,
  });
  if (wsErr) throw wsErr;
  console.log('created_project', projectId);

  // Build unique 65 urls
  const urls = [];
  const seen = new Set();
  for (const d of DOMAINS) {
    if (seen.has(d)) continue;
    seen.add(d);
    urls.push(`https://www.${d}`);
    if (urls.length >= 65) break;
  }
  while (urls.length < 65) {
    const d = `example-verify-${urls.length}.com`;
    urls.push(`https://${d}`);
  }
  console.log('url_count', urls.length);

  const importId = randomUUID();
  const rows = urls.map((url, i) => {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return {
      id: randomUUID(),
      import_id: importId,
      workspace_id: projectId,
      row_number: i + 1,
      raw_url: url,
      normalized_url: url,
      normalized_domain: host,
      status: 'valid',
    };
  });

  const { error: impErr } = await sb.from('backlink_imports').insert({
    id: importId,
    workspace_id: projectId,
    source_type: 'url_list',
    status: 'validated',
    total_rows: rows.length,
    valid_rows: rows.length,
    duplicate_rows: 0,
    invalid_rows: 0,
    created_by: userId,
    metadata: { verify: 'queue-init-e2e' },
  });
  if (impErr) throw impErr;
  const { error: rowErr } = await sb.from('backlink_import_rows').insert(rows);
  if (rowErr) throw rowErr;
  console.log('created_import', importId, 'rows', rows.length);

  // Enqueue via pg-boss (same DB the live worker polls)
  const boss = new PgBoss({ connectionString: env.DATABASE_URL, schema: 'pgboss' });
  await boss.start();
  const jobId = await boss.send(
    'crawl',
    {
      type: 'backlink_automation',
      workspaceId: projectId,
      importId,
      orgId,
      userId,
      __jobName: 'backlink_automation',
    },
    { singletonKey: `automation-${importId}`, retryLimit: 1 }
  );
  console.log('job_id', jobId);
  if (!jobId) throw new Error('boss.send returned null');

  await sb
    .from('backlink_imports')
    .update({
      status: 'analyzing',
      metadata: { verify: 'queue-init-e2e', lastEnqueuedJobId: jobId },
    })
    .eq('id', importId);

  await boss.stop({ graceful: false, timeout: 1000 }).catch(() => null);

  // Poll up to 20 minutes
  const deadline = Date.now() + 20 * 60_000;
  let last = null;
  while (Date.now() < deadline) {
    const { data: runs } = await sb
      .from('backlink_automation_runs')
      .select('id,status,progress,current_step,error_message,stats,created_at')
      .eq('import_id', importId)
      .order('created_at', { ascending: false })
      .limit(1);
    const run = runs?.[0] ?? null;
    const { count: logs } = await sb
      .from('backlink_automation_run_logs')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', projectId);
    const { count: analyses } = await sb
      .from('backlink_domain_analyses')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', projectId);
    const { count: opps } = await sb
      .from('opportunities')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', projectId)
      .eq('import_id', importId);
    const { count: drafts } = await sb
      .from('backlink_ai_drafts')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', projectId);
    const { count: submissions } = await sb
      .from('backlink_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', projectId);
    const { data: imp } = await sb
      .from('backlink_imports')
      .select('status,opportunities_created,content_generated')
      .eq('id', importId)
      .maybeSingle();

    last = {
      runStatus: run?.status,
      progress: run?.progress,
      step: run?.current_step,
      err: run?.error_message,
      stats: run?.stats,
      logs,
      analyses,
      opps,
      drafts,
      submissions,
      importStatus: imp?.status,
    };
    console.log('poll', JSON.stringify(last));

    if (run && ['completed', 'partially_completed', 'failed'].includes(String(run.status))) {
      break;
    }
    await new Promise((r) => setTimeout(r, 15000));
  }

  const ok =
    last &&
    ['completed', 'partially_completed'].includes(String(last.runStatus)) &&
    Number(last.logs ?? 0) > 0 &&
    Number(last.analyses ?? 0) > 0 &&
    Number(last.opps ?? 0) > 0;

  console.log('=== VERIFICATION ===', {
    jobIdReturned: Boolean(jobId),
    queuesReady: true,
    runCreated: Boolean(last?.runStatus),
    logs: last?.logs,
    analyses: last?.analyses,
    opps: last?.opps,
    drafts: last?.drafts,
    submissions: last?.submissions,
    importStatus: last?.importStatus,
    runStatus: last?.runStatus,
    pass: ok,
  });

  if (!ok) process.exitCode = 1;
}

main().catch((e) => {
  console.error('VERIFY_FAILED', e);
  process.exit(1);
});

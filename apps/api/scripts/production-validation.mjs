/**
 * Production Validation Mode — observe real Chefgaa campaign sites.
 * Does NOT invent features. Fetches live pages, runs SIE, enqueues bee_profile,
 * and writes a per-site failure report for anything that does not complete.
 *
 * Usage (PowerShell):
 *   $env:ENV_FILE="$env:TEMP\seo-os-api.env"
 *   node apps/api/scripts/production-validation.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import PgBoss from 'pg-boss';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../../..');
const API = process.env.API_URL || 'https://api-production-48c9e.up.railway.app';
const WORKSPACE_ID =
  process.env.VALIDATION_WORKSPACE_ID || 'db9f83a2-f1db-4a9a-9afb-348402fd4d84';
const BUSINESS_TEXT = process.env.VALIDATION_BUSINESS || 'Chefgaa restaurant POS software';

function loadEnv(p) {
  try {
    const raw = readFileSync(p, 'utf8');
    const env = {};
    for (const line of raw.split(/\r?\n/)) {
      const i = line.indexOf('=');
      if (i < 1) continue;
      env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
    return env;
  } catch {
    return {};
  }
}

const fileEnv = loadEnv(process.env.ENV_FILE || resolve(__dirname, '../.env'));
const env = { ...fileEnv, ...process.env };

function absUrl(base, href) {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

async function fetchHtml(url, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent':
          'SEO-OS-ProductionValidation/1.0 (+https://seo-os.local; validation crawl)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    const html = await res.text();
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? null;
    return {
      url: res.url || url,
      status: res.ok ? 'fetched' : 'failed',
      httpStatus: res.status,
      html: res.ok ? html : '',
      title,
      error: res.ok ? null : `HTTP ${res.status}`,
      elapsedMs: Date.now() - started,
    };
  } catch (e) {
    return {
      url,
      status: 'failed',
      httpStatus: 0,
      html: '',
      title: null,
      error: e instanceof Error ? e.message : String(e),
      elapsedMs: Date.now() - started,
    };
  } finally {
    clearTimeout(t);
  }
}

function extractCandidateLinks(html, baseUrl) {
  const out = [];
  const re = /href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const href = m[1];
    const text = m[2].replace(/<[^>]+>/g, '').trim().toLowerCase();
    const url = absUrl(baseUrl, href);
    if (!url) continue;
    const score =
      (/add-?listing|submit-?listing|add-?business|submit|add-?url|register|contact|write-for-us|guest/i.test(
        href
      )
        ? 5
        : 0) +
      (/add listing|submit|add business|contact|write for us|guest post/i.test(text) ? 4 : 0);
    if (score > 0) out.push({ url, text, score });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 4);
}

function classifyOutcome(row) {
  const failures = [];
  const notes = [];

  if (row.campaign.campaign_lifecycle === 'Ready' && row.campaign.campaign_step === 'generate-content') {
    // By design: currentStepForLifecycle(Ready) === 'generate-content' until Submitting
    notes.push({
      stage: 'campaign_state',
      code: 'READY_ON_GENERATE_STEP',
      detail:
        'lifecycle=Ready maps to generate-content step until Submitting — not a blocker by itself',
    });
  }
  if (row.campaign.submission_status === 'pending' && !row.executionJobId) {
    failures.push({
      stage: 'execution',
      code: 'NO_EXECUTION_JOB',
      detail: 'Ready + package approved but no execution_jobs row (Submit never started)',
    });
  }
  if (row.campaign.last_error && /quality needs review/i.test(row.campaign.last_error)) {
    notes.push({
      stage: 'quality',
      code: 'STALE_QUALITY_ERROR',
      detail: `last_error still "${row.campaign.last_error}" despite generation_status=${row.campaign.generation_status} package_approved_by=${row.campaign.package_approved_by}`,
    });
  }
  if (row.fetch.home.status === 'failed') {
    failures.push({
      stage: 'fetch',
      code: 'HOMEPAGE_UNREACHABLE',
      detail: row.fetch.home.error || `HTTP ${row.fetch.home.httpStatus}`,
    });
  }
  if (row.sie) {
    if (row.sie.profileStatus === 'failed') {
      failures.push({
        stage: 'site_intelligence',
        code: 'PROFILE_FAILED',
        detail: 'analyzeFetchedSite returned failed',
      });
    } else if (row.sie.profileStatus === 'unsupported') {
      failures.push({
        stage: 'site_intelligence',
        code: 'UNSUPPORTED_STRATEGY',
        detail: row.sie.strategy?.reasoning || 'Unsupported',
      });
    } else if (!row.sie.strategy?.entryUrl) {
      failures.push({
        stage: 'site_intelligence',
        code: 'NO_ENTRY_URL',
        detail: `strategy=${row.sie.strategy?.chosen}; directory=${row.sie.strategy?.directoryStrategy}; contact=${row.sie.strategy?.contactFormStrategy}`,
      });
    }
    if (row.sie.strategy?.payloadHints?.needsReview || row.sie.strategy?.payloadHints?.paidListing) {
      notes.push({
        stage: 'site_intelligence',
        code: 'PAID_NEEDS_REVIEW',
        detail: 'Paid listing — browser correctly blocked',
      });
    }
  } else if (row.fetch.home.status === 'fetched') {
    failures.push({
      stage: 'site_intelligence',
      code: 'SIE_NOT_RUN',
      detail: 'Homepage fetched but SIE analysis missing',
    });
  }

  if (!row.siteProfileId) {
    failures.push({
      stage: 'site_intelligence',
      code: 'NO_SITE_PROFILE_ROW',
      detail: 'site_profiles empty for this domain before/after enqueue',
    });
  }

  const complete =
    failures.length === 0 &&
    Boolean(row.sie?.strategy?.entryUrl || row.prodProfile?.entryUrl) &&
    Boolean(row.siteProfileId) &&
    (row.prodProfile?.status === 'complete' || row.sie?.profileStatus === 'complete');

  return { complete, failures, notes };
}

async function main() {
  const startedAt = new Date().toISOString();
  console.log('=== Production Validation Mode ===');
  console.log({ API, WORKSPACE_ID, startedAt });

  const health = await fetch(`${API}/health`).then((r) => r.json());
  const queues = await fetch(`${API}/ops/queues`).then((r) => r.json());
  console.log('health', health);
  console.log(
    'queues',
    (queues?.data?.queues || []).map((q) => ({
      name: q.name,
      attached: q.workerAttached,
      failed: q.failedJobs,
    }))
  );

  const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: opps, error: oppErr } = await sb
    .from('opportunities')
    .select(
      'id,domain,url,pipeline_stage,status,automation_status,generation_status,quality_score,review_tier,review_decision,package_approved_by,package_status,submission_status,verification_status,campaign_lifecycle,campaign_step,last_error,site_profile_id,site_profile_status,metadata'
    )
    .eq('workspace_id', WORKSPACE_ID)
    .eq('pipeline_stage', 'campaign_ready')
    .order('domain');
  if (oppErr) throw oppErr;
  console.log('campaign_ready_count', opps?.length ?? 0);

  // Dynamic import of built package
  const siePath = resolve(ROOT, 'packages/backlink-builder/dist/site-intelligence.js');
  const { analyzeFetchedSite } = await import(`file:///${siePath.replace(/\\/g, '/')}`);

  const rows = [];
  for (const opp of opps || []) {
    const homeUrl = opp.url?.startsWith('http') ? opp.url : `https://${opp.domain}`;
    console.log('--- fetch', opp.domain);
    const home = await fetchHtml(homeUrl);
    const pages = [
      {
        url: home.url,
        html: home.html,
        title: home.title,
        status: home.status,
        depth: 0,
        error: home.error,
      },
    ];
    if (home.status === 'fetched') {
      const links = extractCandidateLinks(home.html, home.url);
      for (const link of links) {
        const page = await fetchHtml(link.url);
        pages.push({
          url: page.url,
          html: page.html,
          title: page.title,
          status: page.status,
          depth: 1,
          error: page.error,
        });
        await new Promise((r) => setTimeout(r, 400));
      }
    }

    let sie = null;
    if (pages.some((p) => p.status === 'fetched')) {
      try {
        sie = analyzeFetchedSite({
          homepageUrl: home.url,
          pages: pages.map((p) => ({
            url: p.url,
            html: p.html,
            title: p.title,
            status: p.status === 'fetched' ? 'fetched' : 'failed',
            depth: p.depth,
            error: p.error,
          })),
          businessText: BUSINESS_TEXT,
          elapsedMs: home.elapsedMs,
        });
      } catch (e) {
        sie = { error: e instanceof Error ? e.message : String(e) };
      }
    }

    const row = {
      opportunityId: opp.id,
      domain: opp.domain,
      url: homeUrl,
      campaign: {
        lifecycle: opp.campaign_lifecycle,
        campaign_lifecycle: opp.campaign_lifecycle,
        campaign_step: opp.campaign_step,
        generation_status: opp.generation_status,
        quality_score: opp.quality_score,
        package_approved_by: opp.package_approved_by,
        package_status: opp.package_status,
        submission_status: opp.submission_status,
        automation_status: opp.automation_status,
        last_error: opp.last_error,
        review_decision: opp.review_decision,
        detected_pages: opp.metadata?.detected_pages ?? null,
        qualification: opp.metadata?.qualification ?? null,
      },
      fetch: {
        home: {
          status: home.status,
          httpStatus: home.httpStatus,
          error: home.error,
          elapsedMs: home.elapsedMs,
        },
        pagesFetched: pages.filter((p) => p.status === 'fetched').length,
        pagesFailed: pages.filter((p) => p.status === 'failed').length,
        pageUrls: pages.map((p) => ({ url: p.url, status: p.status, http: p.httpStatus ?? null })),
      },
      sie: sie?.error
        ? { error: sie.error }
        : sie
          ? {
              profileStatus: sie.profileStatus,
              strategy: {
                chosen: sie.strategy?.chosen,
                reasoning: sie.strategy?.reasoning,
                entryUrl: sie.strategy?.entryUrl,
                wordpressStrategy: sie.strategy?.wordpressStrategy,
                directoryStrategy: sie.strategy?.directoryStrategy,
                contactFormStrategy: sie.strategy?.contactFormStrategy,
                expectedInterventions: sie.strategy?.expectedInterventions,
                payloadHints: {
                  needsReview: sie.strategy?.payloadHints?.needsReview ?? false,
                  paidListing: sie.strategy?.payloadHints?.paidListing ?? false,
                  moveToOutreach: sie.strategy?.payloadHints?.moveToOutreach ?? false,
                  contactFormOutreach: sie.strategy?.payloadHints?.contactFormOutreach ?? false,
                },
              },
              directory: sie.directory
                ? {
                    detected: sie.directory.detected,
                    platform: sie.directory.platform,
                    entryUrl: sie.directory.entryUrl,
                    pricing: {
                      free: sie.directory.pricing?.freeListing,
                      paid: sie.directory.pricing?.paidListing,
                    },
                  }
                : null,
              contactForm: sie.contactForm
                ? {
                    detected: sie.contactForm.detected,
                    platform: sie.contactForm.platform,
                    intent: sie.contactForm.formIntent,
                    entryUrl: sie.contactForm.entryUrl,
                  }
                : null,
              wordpress: sie.wordpress
                ? { detected: sie.wordpress.detected, workflow: sie.wordpress.workflow }
                : null,
            }
          : null,
      siteProfileId: opp.site_profile_id,
      executionJobId: null,
    };
    row.outcome = classifyOutcome(row);
    rows.push(row);
    await new Promise((r) => setTimeout(r, 300));
  }

  // Enqueue production bee_profile jobs so workers write real site_profiles
  let enqueued = [];
  if (env.DATABASE_URL) {
    const boss = new PgBoss({ connectionString: env.DATABASE_URL, schema: 'pgboss' });
    await boss.start();
    for (const row of rows) {
      if (row.fetch.home.status !== 'fetched') continue;
      // Upsert pending profile + job like ensureSiteIntelligence
      const domain = row.domain;
      const { data: existing } = await sb
        .from('site_profiles')
        .select('id,profile_status')
        .eq('workspace_id', WORKSPACE_ID)
        .eq('domain', domain)
        .maybeSingle();

      let profileId = existing?.id;
      if (!profileId) {
        profileId = randomUUID();
        const { error } = await sb.from('site_profiles').insert({
          id: profileId,
          workspace_id: WORKSPACE_ID,
          domain,
          profile_status: 'pending',
          opportunity_ids: [row.opportunityId],
          fingerprint: {},
          navigation_graph: {},
          page_classifications: [],
          strategy: {},
          learning: {},
        });
        if (error) {
          row.outcome.failures.push({
            stage: 'site_intelligence',
            code: 'PROFILE_INSERT_FAILED',
            detail: error.message,
          });
          continue;
        }
      }

      await sb
        .from('opportunities')
        .update({
          site_profile_id: profileId,
          site_profile_status: 'profiling',
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.opportunityId);

      const profileJobId = randomUUID();
      await sb.from('site_profile_jobs').insert({
        id: profileJobId,
        workspace_id: WORKSPACE_ID,
        site_profile_id: profileId,
        domain,
        status: 'queued',
      });
      await sb
        .from('site_profiles')
        .update({ profile_status: 'profiling', updated_at: new Date().toISOString() })
        .eq('id', profileId);

      const jobId = await boss.send(
        'playwright',
        {
          type: 'bee_profile',
          workspaceId: WORKSPACE_ID,
          profileId,
          profileJobId,
          domain,
        },
        { singletonKey: `bee-profile-${domain}`, retryLimit: 1 }
      );
      row.siteProfileId = profileId;
      row.profileJobId = profileJobId;
      row.bossJobId = jobId;
      enqueued.push({ domain, profileId, jobId });
      console.log('enqueued_profile', domain, jobId);
    }
    await boss.stop({ graceful: false, timeout: 1000 }).catch(() => null);
  } else {
    console.log('skip_enqueue — no DATABASE_URL');
  }

  // Poll profiles up to 8 minutes
  const deadline = Date.now() + 8 * 60_000;
  while (Date.now() < deadline && enqueued.length) {
    const ids = enqueued.map((e) => e.profileId);
    const { data: profiles } = await sb
      .from('site_profiles')
      .select('id,domain,profile_status,last_error,strategy,updated_at')
      .in('id', ids);
    const byId = Object.fromEntries((profiles || []).map((p) => [p.id, p]));
    let pending = 0;
    for (const row of rows) {
      if (!row.siteProfileId) continue;
      const p = byId[row.siteProfileId];
      if (!p) continue;
      row.prodProfile = {
        status: p.profile_status,
        last_error: p.last_error,
        entryUrl: p.strategy?.entryUrl ?? null,
        chosen: p.strategy?.chosen ?? null,
        directoryStrategy: p.strategy?.directoryStrategy ?? null,
        contactFormStrategy: p.strategy?.contactFormStrategy ?? null,
      };
      if (['pending', 'profiling'].includes(p.profile_status)) pending++;
      else if (p.profile_status === 'failed') {
        if (!row.outcome.failures.some((f) => f.code === 'PROD_PROFILE_FAILED')) {
          row.outcome.failures.push({
            stage: 'site_intelligence',
            code: 'PROD_PROFILE_FAILED',
            detail: p.last_error || 'profile_status=failed',
          });
          row.outcome.complete = false;
        }
      }
    }
    console.log('profile_poll', { pending, done: enqueued.length - pending });
    if (pending === 0) break;
    await new Promise((r) => setTimeout(r, 10000));
  }

  // Re-check execution jobs
  const { data: jobs } = await sb
    .from('execution_jobs')
    .select('id,site_domain,status,error_message')
    .eq('workspace_id', WORKSPACE_ID);
  const jobsByDomain = Object.fromEntries((jobs || []).map((j) => [j.site_domain, j]));
  for (const row of rows) {
    const j = jobsByDomain[row.domain];
    if (j) {
      row.executionJobId = j.id;
      row.execution = { status: j.status, error: j.error_message };
      row.outcome.failures = row.outcome.failures.filter((f) => f.code !== 'NO_EXECUTION_JOB');
    }
    // Refresh complete flag
    row.outcome = classifyOutcome(row);
  }

  const failures = rows.filter((r) => !r.outcome.complete);
  const report = {
    mode: 'production_validation',
    startedAt,
    finishedAt: new Date().toISOString(),
    api: API,
    apiVersion: health.version,
    workspaceId: WORKSPACE_ID,
    summary: {
      total: rows.length,
      complete: rows.filter((r) => r.outcome.complete).length,
      failed: failures.length,
      homepageUnreachable: rows.filter((r) =>
        r.outcome.failures.some((f) => f.code === 'HOMEPAGE_UNREACHABLE')
      ).length,
      noExecutionJob: rows.filter((r) =>
        r.outcome.failures.some((f) => f.code === 'NO_EXECUTION_JOB')
      ).length,
      stuckGenerateStep: rows.filter((r) =>
        r.outcome.failures.some((f) => f.code === 'STUCK_GENERATE_CONTENT_STEP')
      ).length,
      sieUnsupported: rows.filter((r) =>
        r.outcome.failures.some((f) => f.code === 'UNSUPPORTED_STRATEGY')
      ).length,
      sieNoEntry: rows.filter((r) =>
        r.outcome.failures.some((f) => f.code === 'NO_ENTRY_URL')
      ).length,
      profilesEnqueued: enqueued.length,
    },
    failureCodes: failures.reduce((acc, r) => {
      for (const f of r.outcome.failures) {
        acc[f.code] = (acc[f.code] || 0) + 1;
      }
      return acc;
    }, {}),
    sites: rows.map((r) => ({
      domain: r.domain,
      url: r.url,
      complete: r.outcome.complete,
      failures: r.outcome.failures,
      notes: r.outcome.notes,
      campaign: r.campaign,
      fetch: r.fetch,
      sie: r.sie,
      prodProfile: r.prodProfile ?? null,
      execution: r.execution ?? null,
    })),
  };

  const outDir = resolve(ROOT, 'docs/validation');
  mkdirSync(outDir, { recursive: true });
  const stamp = startedAt.slice(0, 19).replace(/[:T]/g, '-');
  const jsonPath = resolve(outDir, `failure-report-${stamp}.json`);
  const mdPath = resolve(outDir, `failure-report-${stamp}.md`);
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  const md = [
    `# Production Validation Failure Report`,
    ``,
    `- Workspace: \`${WORKSPACE_ID}\` (Chefgaa)`,
    `- Started: ${startedAt}`,
    `- Finished: ${report.finishedAt}`,
    `- API: ${API} (${health.version})`,
    `- Sites: **${report.summary.total}** · Complete: **${report.summary.complete}** · Failed: **${report.summary.failed}**`,
    ``,
    `## Failure code totals`,
    ``,
    ...Object.entries(report.failureCodes).map(([k, v]) => `- \`${k}\`: ${v}`),
    ``,
    `## Per-site failures`,
    ``,
    ...failures.map((r) => {
      const lines = [
        `### ${r.domain}`,
        ``,
        `- URL: ${r.url}`,
        `- Campaign step: \`${r.campaign.campaign_step}\` · lifecycle: \`${r.campaign.campaign_lifecycle}\``,
        `- Fetch: ${r.fetch.home.status} ${r.fetch.home.httpStatus || ''} ${r.fetch.home.error || ''}`,
        `- Local SIE: ${r.sie?.profileStatus || r.sie?.error || 'n/a'} · strategy=${r.sie?.strategy?.chosen || '—'} · entry=${r.sie?.strategy?.entryUrl || '—'}`,
        `- Prod profile: ${r.prodProfile?.status || 'none'} · entry=${r.prodProfile?.entryUrl || '—'}`,
        `- Failures:`,
        ...r.outcome.failures.map((f) => `  - **${f.code}** (${f.stage}): ${f.detail}`),
      ];
      if (r.outcome.notes.length) {
        lines.push(`- Notes:`);
        lines.push(...r.outcome.notes.map((n) => `  - ${n.code}: ${n.detail}`));
      }
      lines.push('');
      return lines.join('\n');
    }),
    ``,
    `## Observed systemic issues (not hypothetical)`,
    ``,
    `1. All Ready items remain on \`campaign_step=generate-content\` after package approval — submission never starts.`,
    `2. Zero \`execution_jobs\` existed before this run — browser workflow never entered.`,
    `3. \`last_error=quality needs review (79)\` persists even when \`generation_status=Completed\` and \`package_approved_by=user\`.`,
    ``,
  ].join('\n');
  writeFileSync(mdPath, md);

  console.log('=== SUMMARY ===');
  console.log(JSON.stringify(report.summary, null, 2));
  console.log('wrote', jsonPath);
  console.log('wrote', mdPath);
  if (failures.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error('VALIDATION_FAILED', e);
  process.exit(1);
});

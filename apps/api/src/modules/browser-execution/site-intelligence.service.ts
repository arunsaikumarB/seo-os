/**
 * Site Intelligence Engine — domain-keyed profiles + profiling jobs (Phase 5).
 * Additive data only. CSM lifecycle transitions unchanged.
 */
import { randomUUID } from 'node:crypto';
import {
  analyzeFetchedSite,
  detectGuidelinesMismatch,
  emptyLearning,
  isProfileStale,
  normalizeSiteDomain,
  planCrawlFrontier,
  profileExpiresAt,
  recordStrategyOutcome,
  SIE_CRAWL_DEFAULTS,
  type SiteIntelligenceResult,
  type SiteLearning,
} from '@seo-os/backlink-builder';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { enqueueJob, QUEUES } from '../../jobs/boss.js';
import { logger } from '../../lib/logger.js';

export type SiteProfileRow = {
  id: string;
  workspace_id: string;
  domain: string;
  fingerprint: Record<string, unknown>;
  navigation_graph: Record<string, unknown>;
  page_classifications: unknown[];
  guidelines: Record<string, unknown> | null;
  strategy: Record<string, unknown> | null;
  learning: SiteLearning;
  profile_status: string;
  profiled_at: string | null;
  expires_at: string | null;
  last_error: string | null;
  crawl_stats: Record<string, unknown>;
  opportunity_ids: string[];
};

function admin() {
  return getSupabaseAdmin();
}

export async function getSiteProfileByDomain(workspaceId: string, domainOrUrl: string) {
  const domain = normalizeSiteDomain(domainOrUrl);
  const { data } = await admin()
    .from('site_profiles')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('domain', domain)
    .maybeSingle();
  return (data as SiteProfileRow | null) ?? null;
}

export async function listSiteProfiles(workspaceId: string) {
  const { data } = await admin()
    .from('site_profiles')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('updated_at', { ascending: false })
    .limit(500);
  return (data ?? []) as SiteProfileRow[];
}

export async function upsertPendingProfile(params: {
  workspaceId: string;
  domainOrUrl: string;
  opportunityId?: string | null;
}) {
  const domain = normalizeSiteDomain(params.domainOrUrl);
  const existing = await getSiteProfileByDomain(params.workspaceId, domain);
  if (existing) {
    const ids = new Set(existing.opportunity_ids ?? []);
    if (params.opportunityId) ids.add(params.opportunityId);
    const { data } = await admin()
      .from('site_profiles')
      .update({
        opportunity_ids: [...ids],
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select('*')
      .single();
    return data as SiteProfileRow;
  }
  const { data, error } = await admin()
    .from('site_profiles')
    .insert({
      id: randomUUID(),
      workspace_id: params.workspaceId,
      domain,
      profile_status: 'pending',
      learning: emptyLearning(),
      opportunity_ids: params.opportunityId ? [params.opportunityId] : [],
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as SiteProfileRow;
}

/** True when execution may start at entry_url. */
export function isProfileExecutionReady(profile: SiteProfileRow | null): boolean {
  if (!profile) return false;
  if (profile.profile_status === 'unsupported') return false;
  if (profile.profile_status !== 'complete') return false;
  if (isProfileStale(profile.expires_at)) return false;
  const entry = (profile.strategy as { entryUrl?: string | null } | null)?.entryUrl;
  return Boolean(entry);
}

/**
 * Ensure one profiling job per domain. Shared across opportunity ids.
 */
export async function ensureSiteIntelligence(params: {
  workspaceId: string;
  domainOrUrl: string;
  opportunityId?: string | null;
  forceReprofile?: boolean;
}) {
  let profile = await upsertPendingProfile(params);
  const reusable =
    !params.forceReprofile &&
    profile.profile_status === 'complete' &&
    !isProfileStale(profile.expires_at) &&
    Boolean((profile.strategy as { entryUrl?: string } | null)?.entryUrl);

  if (reusable) {
    // Lightweight path: mark opportunities linked; entry_url verification happens at execute
    if (params.opportunityId) {
      await linkOpportunityToProfile(
        params.workspaceId,
        params.opportunityId,
        profile.id,
        profile.profile_status
      );
    }
    return { profile, enqueued: false, reused: true };
  }

  if (profile.profile_status === 'profiling') {
    return { profile, enqueued: false, reused: false };
  }

  await admin()
    .from('site_profiles')
    .update({
      profile_status: 'profiling',
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', profile.id);

  const jobId = randomUUID();
  await admin().from('site_profile_jobs').insert({
    id: jobId,
    workspace_id: params.workspaceId,
    site_profile_id: profile.id,
    domain: profile.domain,
    status: 'queued',
  });

  await enqueueJob(QUEUES.PLAYWRIGHT, 'bee_profile', {
    type: 'bee_profile',
    workspaceId: params.workspaceId,
    profileId: profile.id,
    profileJobId: jobId,
    domain: profile.domain,
  });

  if (params.opportunityId) {
    await linkOpportunityToProfile(
      params.workspaceId,
      params.opportunityId,
      profile.id,
      'profiling'
    );
  }

  profile = (await getSiteProfileByDomain(params.workspaceId, profile.domain))!;
  return { profile, enqueued: true, reused: false };
}

export async function linkOpportunityToProfile(
  workspaceId: string,
  opportunityId: string,
  profileId: string,
  status: string
) {
  await admin()
    .from('opportunities')
    .update({
      site_profile_id: profileId,
      site_profile_status: status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', opportunityId)
    .eq('workspace_id', workspaceId);
}

export async function saveIntelligenceResult(
  workspaceId: string,
  profileId: string,
  result: SiteIntelligenceResult,
  learning?: SiteLearning
) {
  const { data } = await admin()
    .from('site_profiles')
    .update({
      fingerprint: result.fingerprint,
      navigation_graph: result.navigationGraph,
      page_classifications: result.pageClassifications,
      guidelines: result.guidelines,
      strategy: result.strategy,
      learning: learning ?? emptyLearning(),
      profile_status: result.profileStatus,
      profiled_at: new Date().toISOString(),
      expires_at: profileExpiresAt(),
      crawl_stats: result.crawlStats,
      last_error:
        result.profileStatus === 'failed' ? 'site unprofilable' : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', profileId)
    .eq('workspace_id', workspaceId)
    .select('*')
    .single();

  const row = data as SiteProfileRow;
  for (const oppId of row.opportunity_ids ?? []) {
    await linkOpportunityToProfile(
      workspaceId,
      oppId,
      profileId,
      result.profileStatus
    );
    if (result.guidelines) {
      // Flag mismatch only when we have a package word-count hint on opportunity metadata
      try {
        const { data: opp } = await admin()
          .from('opportunities')
          .select('id, metadata')
          .eq('id', oppId)
          .maybeSingle();
        const meta = (opp?.metadata as Record<string, unknown> | null) ?? {};
        const packWords = Number(meta.word_count ?? meta.wordCount ?? 0) || null;
        const mismatch = detectGuidelinesMismatch(result.guidelines, {
          wordCount: packWords,
          assets: Array.isArray(meta.assets) ? (meta.assets as string[]) : [],
        });
        if (mismatch.mismatch) {
          await admin()
            .from('opportunities')
            .update({
              guidelines_mismatch: true,
              updated_at: new Date().toISOString(),
            })
            .eq('id', oppId);
        }
      } catch {
        /* optional */
      }
    }
  }
  return row;
}

export async function markProfileFailed(
  workspaceId: string,
  profileId: string,
  message: string
) {
  await admin()
    .from('site_profiles')
    .update({
      profile_status: 'failed',
      last_error: message,
      updated_at: new Date().toISOString(),
    })
    .eq('id', profileId)
    .eq('workspace_id', workspaceId);
}

export async function writeLearningOutcome(params: {
  workspaceId: string;
  domainOrUrl: string;
  strategy: string;
  entryUrl: string | null;
  success: boolean;
}) {
  const profile = await getSiteProfileByDomain(params.workspaceId, params.domainOrUrl);
  if (!profile) return null;
  const learning = recordStrategyOutcome(
    (profile.learning as SiteLearning) ?? emptyLearning(),
    {
      strategy: params.strategy,
      entryUrl: params.entryUrl,
      success: params.success,
    }
  );
  await admin()
    .from('site_profiles')
    .update({ learning, updated_at: new Date().toISOString() })
    .eq('id', profile.id);
  return learning;
}

export async function getSiteProfileAudit(workspaceId: string) {
  const profiles = await listSiteProfiles(workspaceId);
  const byStatus: Record<string, number> = {};
  const byStrategy: Record<string, number> = {};
  let pagesFetched = 0;
  let elapsedMs = 0;
  for (const p of profiles) {
    byStatus[p.profile_status] = (byStatus[p.profile_status] ?? 0) + 1;
    const chosen = (p.strategy as { chosen?: string } | null)?.chosen;
    if (chosen) byStrategy[chosen] = (byStrategy[chosen] ?? 0) + 1;
    const cs = p.crawl_stats as { pagesFetched?: number; elapsedMs?: number };
    pagesFetched += Number(cs.pagesFetched ?? 0);
    elapsedMs += Number(cs.elapsedMs ?? 0);
  }
  return {
    total: profiles.length,
    byStatus,
    byStrategy,
    avgPagesFetched:
      profiles.length > 0 ? Math.round((pagesFetched / profiles.length) * 10) / 10 : 0,
    avgElapsedMs:
      profiles.length > 0 ? Math.round(elapsedMs / Math.max(1, profiles.length)) : 0,
    profiles: profiles.map((p) => ({
      domain: p.domain,
      status: p.profile_status,
      platform: (p.fingerprint as { platform?: string })?.platform ?? null,
      strategy: (p.strategy as { chosen?: string } | null)?.chosen ?? null,
      entryUrl: (p.strategy as { entryUrl?: string } | null)?.entryUrl ?? null,
      expectedInterventions:
        (p.strategy as { expectedInterventions?: string[] } | null)?.expectedInterventions ??
        [],
      guidelinesMismatch: false,
      expiresAt: p.expires_at,
      crawlStats: p.crawl_stats,
      learning: p.learning,
    })),
  };
}

/**
 * HTTP fetch helper for polite crawl (no separate browser spawn).
 * Browser pool used when HTTP fails or for verification.
 */
export async function fetchPageHtml(
  url: string,
  opts?: { timeoutMs?: number; userAgent?: string }
): Promise<{ html: string; title: string | null; ok: boolean; error?: string }> {
  const timeoutMs = opts?.timeoutMs ?? 12_000;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent':
          opts?.userAgent ??
          'SEO-OS-SiteIntelligence/1.0 (+https://seo-os.local; polite profiler)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    const html = await res.text();
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? null;
    return { html, title, ok: res.ok };
  } catch (err) {
    return {
      html: '',
      title: null,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(t);
  }
}

export async function runBoundedCrawl(domain: string): Promise<SiteIntelligenceResult> {
  const homepageUrl = `https://${domain}/`;
  const started = Date.now();
  const pages: Array<{
    url: string;
    html: string;
    title?: string | null;
    status: 'fetched' | 'failed';
    error?: string | null;
    depth: number;
  }> = [];

  const home = await fetchPageHtml(homepageUrl);
  if (!home.ok) {
    // try www-less already; record failure
    pages.push({
      url: homepageUrl,
      html: home.html,
      title: home.title,
      status: 'failed',
      error: home.error || 'fetch failed',
      depth: 0,
    });
    return analyzeFetchedSite({
      homepageUrl,
      pages,
      elapsedMs: Date.now() - started,
      truncated: false,
    });
  }
  pages.push({
    url: homepageUrl,
    html: home.html,
    title: home.title,
    status: 'fetched',
    depth: 0,
  });

  const frontier = planCrawlFrontier(homepageUrl, home.html);
  let truncated = false;
  for (const link of frontier) {
    if (Date.now() - started > SIE_CRAWL_DEFAULTS.timeBudgetMs) {
      truncated = true;
      break;
    }
    if (pages.length >= SIE_CRAWL_DEFAULTS.maxPages) {
      truncated = true;
      break;
    }
    await new Promise((r) => setTimeout(r, SIE_CRAWL_DEFAULTS.fetchDelayMs));
    let fetched = await fetchPageHtml(link.url);
    if (!fetched.ok) {
      await new Promise((r) => setTimeout(r, 500));
      fetched = await fetchPageHtml(link.url); // 1 retry
    }
    pages.push({
      url: link.url,
      html: fetched.html,
      title: fetched.title,
      status: fetched.ok ? 'fetched' : 'failed',
      error: fetched.ok ? null : fetched.error || 'fetch failed',
      depth: link.depth,
    });
  }

  return analyzeFetchedSite({
    homepageUrl,
    pages,
    elapsedMs: Date.now() - started,
    truncated,
  });
}

export async function runSiteProfileJob(params: {
  workspaceId: string;
  profileId: string;
  profileJobId: string;
  domain: string;
}) {
  logger.info({ domain: params.domain }, 'SIE profiling start');
  await admin()
    .from('site_profile_jobs')
    .update({
      status: 'running',
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.profileJobId);

  try {
    const existing = await getSiteProfileByDomain(params.workspaceId, params.domain);
    const learning = (existing?.learning as SiteLearning) ?? emptyLearning();

    // Reuse proven entry_url with verification when learning has a path and profile not forced
    const proven = learning.successfulPaths[0];
    if (proven?.entryUrl && existing && !isProfileStale(existing.expires_at)) {
      const verify = await fetchPageHtml(proven.entryUrl);
      if (verify.ok) {
        const quick = analyzeFetchedSite({
          homepageUrl: `https://${params.domain}/`,
          pages: [
            {
              url: `https://${params.domain}/`,
              html: '<html></html>',
              status: 'fetched',
              depth: 0,
            },
            {
              url: proven.entryUrl,
              html: verify.html,
              title: verify.title,
              status: 'fetched',
              depth: 1,
            },
          ],
          elapsedMs: 0,
        });
        const stillValid =
          quick.strategy.entryUrl === proven.entryUrl ||
          quick.pageClassifications.some(
            (c) =>
              c.url === proven.entryUrl &&
              (c.intent === 'Submission Form' ||
                c.intent === 'Write For Us' ||
                c.intent === 'Google Form' ||
                c.intent === 'Typeform' ||
                c.intent === 'Contact')
          );
        if (stillValid) {
          const merged = {
            ...quick,
            strategy: {
              ...quick.strategy,
              chosen: proven.strategy as typeof quick.strategy.chosen,
              entryUrl: proven.entryUrl,
              reasoning: `Reused proven path after intent verification: ${proven.entryUrl}`,
            },
            profileStatus: 'complete' as const,
          };
          await saveIntelligenceResult(
            params.workspaceId,
            params.profileId,
            merged,
            learning
          );
          await admin()
            .from('site_profile_jobs')
            .update({
              status: 'complete',
              finished_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', params.profileJobId);
          await resumeJobsWaitingForProfile(params.workspaceId, params.domain);
          return merged;
        }
        // verification failed → full re-profile
      }
    }

    const result = await runBoundedCrawl(params.domain);
    await saveIntelligenceResult(params.workspaceId, params.profileId, result, learning);
    await admin()
      .from('site_profile_jobs')
      .update({
        status: result.profileStatus === 'failed' ? 'failed' : 'complete',
        finished_at: new Date().toISOString(),
        error_message:
          result.profileStatus === 'failed' ? 'site unprofilable' : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.profileJobId);

    await resumeJobsWaitingForProfile(params.workspaceId, params.domain);
    logger.info(
      { domain: params.domain, strategy: result.strategy.chosen },
      'SIE profiling complete'
    );
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await markProfileFailed(params.workspaceId, params.profileId, msg);
    await admin()
      .from('site_profile_jobs')
      .update({
        status: 'failed',
        error_message: msg,
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.profileJobId);
    throw err;
  }
}

/** Resume execution jobs parked waiting for site profile. */
export async function resumeJobsWaitingForProfile(workspaceId: string, domain: string) {
  const profile = await getSiteProfileByDomain(workspaceId, domain);
  if (!isProfileExecutionReady(profile)) return { resumed: 0 };

  const { data: jobs } = await admin()
    .from('execution_jobs')
    .select('id, site_domain, status, metrics')
    .eq('workspace_id', workspaceId)
    .eq('status', 'queued')
    .is('deleted_at', null)
    .limit(50);

  let resumed = 0;
  const { startJob } = await import('./bee.service.js');
  for (const j of jobs ?? []) {
    const d = normalizeSiteDomain(String(j.site_domain ?? ''));
    if (d !== domain) continue;
    const m = (j.metrics as { waitingForSiteProfile?: boolean } | null) ?? {};
    if (!m.waitingForSiteProfile) continue;
    try {
      await startJob(workspaceId, String(j.id));
      resumed++;
    } catch (err) {
      logger.warn({ jobId: j.id, err }, 'SIE resume after profile failed');
    }
  }
  return { resumed };
}

export async function deleteSiteProfile(workspaceId: string, domainOrUrl: string) {
  const domain = normalizeSiteDomain(domainOrUrl);
  await admin()
    .from('site_profiles')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('domain', domain);
}

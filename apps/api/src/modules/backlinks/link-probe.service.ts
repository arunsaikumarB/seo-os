/**
 * Bulk Link Probe — fetch + classify + persist ranked bands on opportunities.
 * Never submits. HTTP-first; optional Playwright only when spa shell and budget allows.
 */
import {
  classifyProbedPage,
  linkProbeBandLabel,
  mergeProbeResults,
  normalizeSiteDomain,
  probeCandidateUrls,
  evaluateSubmissionProbeGate,
  type LinkProbeBand,
  type LinkProbeResult,
} from '@seo-os/backlink-builder';
import { AppError } from '@seo-os/shared';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { logger } from '../../lib/logger.js';
import { enqueueJob, QUEUES } from '../../jobs/boss.js';
import { updateCampaignItem } from '../campaigns/campaign-state.service.js';

const PROBE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_BATCH = 80;
const MAX_BATCH = 250;
const CONCURRENCY = 4;
const CANDIDATE_PAGES = 3;
const BROWSER_BUDGET_PER_RUN = 8;

type OppRow = {
  id: string;
  url: string | null;
  domain: string | null;
  title: string | null;
  website_name: string | null;
  campaign_lifecycle: string | null;
  metadata: Record<string, unknown> | null;
};

export type LinkProbeQueueItem = {
  opportunityId: string;
  domain: string;
  title: string;
  url: string;
  lifecycle: string | null;
  probe: LinkProbeResult;
};

export type LinkProbeStats = {
  total: number;
  probed: number;
  unprobed: number;
  ready: number;
  check: number;
  blocked: number;
  dead: number;
  no_form: number;
  lastRunAt: string | null;
};

function readProbe(meta: Record<string, unknown> | null | undefined): LinkProbeResult | null {
  const lp = meta?.linkProbe;
  if (!lp || typeof lp !== 'object') return null;
  const o = lp as Partial<LinkProbeResult>;
  if (!o.band || !o.probedAt) return null;
  return o as LinkProbeResult;
}

function isFresh(probe: LinkProbeResult | null, force: boolean): boolean {
  if (force || !probe?.probedAt) return false;
  const t = Date.parse(probe.probedAt);
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < PROBE_TTL_MS;
}

async function fetchHttp(
  url: string
): Promise<{ html: string | null; status: number | null; error: string | null }> {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(18_000),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    const status = res.status;
    if (!res.ok) {
      return { html: null, status, error: `HTTP ${status}` };
    }
    const html = (await res.text()).slice(0, 400_000);
    return { html: html || null, status, error: html ? null : 'Empty body' };
  } catch (err) {
    return {
      html: null,
      status: null,
      error: err instanceof Error ? err.message : 'fetch_failed',
    };
  }
}

async function maybeRender(
  url: string,
  budget: { used: number; max: number }
): Promise<string | null> {
  if (budget.used >= budget.max) return null;
  try {
    const { fetchRenderedHtml } = await import(
      '../browser-execution/browser-runtime.service.js'
    );
    budget.used += 1;
    const html = await fetchRenderedHtml(url, { timeoutMs: 35_000, settleSpa: true });
    return html ? html.slice(0, 400_000) : null;
  } catch (err) {
    logger.warn({ err, url }, 'link-probe: playwright fallback failed');
    return null;
  }
}

async function probeUrl(
  url: string,
  browserBudget: { used: number; max: number }
): Promise<LinkProbeResult> {
  const http = await fetchHttp(url);
  let html = http.html;
  let result = classifyProbedPage({
    url,
    html,
    httpStatus: http.status,
    fetchError: http.error,
  });

  // Escalate SPA shells once if budget remains
  if (
    (result.band === 'no_form' && result.spaShell) ||
    (result.band === 'dead' && !html && browserBudget.used < browserBudget.max)
  ) {
    const rendered = await maybeRender(url, browserBudget);
    if (rendered) {
      result = classifyProbedPage({
        url,
        html: rendered,
        httpStatus: http.status ?? 200,
        fetchError: null,
      });
    }
  }

  return result;
}

async function probeOpportunity(
  row: OppRow,
  browserBudget: { used: number; max: number }
): Promise<LinkProbeResult> {
  const url = String(row.url ?? '').trim();
  if (!url) {
    return {
      band: 'dead',
      score: 0,
      alive: false,
      httpStatus: null,
      formFound: false,
      formUrl: null,
      formScore: 0,
      fieldCount: 0,
      hasUrl: false,
      hasTitle: false,
      hasDesc: false,
      hasEmail: false,
      multiStep: false,
      spaShell: false,
      gates: [],
      reasons: ['Missing URL'],
      pagesChecked: 0,
      probedAt: new Date().toISOString(),
      listingPricing: 'unknown',
    };
  }

  const domain =
    normalizeSiteDomain(row.domain || url) ||
    (() => {
      try {
        return new URL(url).hostname.replace(/^www\./, '');
      } catch {
        return String(row.domain ?? '');
      }
    })();

  const entry = await probeUrl(url, browserBudget);

  // If entry has no form but is alive, try a few submission-intent candidates
  if (entry.alive && (entry.band === 'no_form' || entry.band === 'check') && entry.formUrl) {
    const entryHtml = (await fetchHttp(url)).html;
    if (entryHtml) {
      const candidates = probeCandidateUrls(entryHtml, url, domain, CANDIDATE_PAGES);
      const candidateResults: LinkProbeResult[] = [];
      for (const cand of candidates) {
        if (cand === url) continue;
        candidateResults.push(await probeUrl(cand, browserBudget));
        // Stop early if we found ready
        if (candidateResults[candidateResults.length - 1]?.band === 'ready') break;
      }
      if (candidateResults.length) {
        return mergeProbeResults(entry, candidateResults);
      }
    }
  }

  return entry;
}

async function saveProbe(opportunityId: string, meta: Record<string, unknown>, probe: LinkProbeResult) {
  const nextMeta = {
    ...meta,
    linkProbe: probe,
  };
  const { error } = await getSupabaseAdmin()
    .from('opportunities')
    .update({ metadata: nextMeta, updated_at: new Date().toISOString() })
    .eq('id', opportunityId);
  if (error) {
    logger.warn({ error, opportunityId }, 'link-probe: failed to save');
  }
}

/**
 * Permanent gate: no_form / dead probes revoke Approved and park the site.
 * Never leave a content/blog homepage in the submit / Approved cohort.
 */
async function applyProbeSubmissionGate(
  workspaceId: string,
  opportunityId: string,
  probe: LinkProbeResult
): Promise<void> {
  const gate = evaluateSubmissionProbeGate(probe);
  if (!gate.disqualified || !gate.reviewDecision) return;

  try {
    await updateCampaignItem(workspaceId, opportunityId, {
      currentStatus: gate.reviewDecision === 'Dead Website' ? 'Failed' : 'Ignored',
      reviewDecision: gate.reviewDecision,
      reviewTier: null,
      approvedBy: null,
      approval: 'rejected',
      lastError: gate.reason,
      blockerReason: gate.reason,
      force: true,
    });
    // Park any Assisted package so it leaves the free worklist
    const { data: pkgs } = await getSupabaseAdmin()
      .from('assisted_packages')
      .select('id, payload, status')
      .eq('workspace_id', workspaceId)
      .eq('opportunity_id', opportunityId)
      .limit(5);
    for (const row of pkgs ?? []) {
      if (String(row.status) === 'done') continue;
      const payload = {
        ...((row.payload as Record<string, unknown>) ?? {}),
        bucket: 'no_form',
        formUnavailable: true,
        failureReason: gate.reason,
        listingPricing: (row.payload as { listingPricing?: string } | null)?.listingPricing ?? null,
      };
      await getSupabaseAdmin()
        .from('assisted_packages')
        .update({
          bucket: 'no_form',
          status: 'skipped',
          failure_reason: gate.reason,
          payload,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id);
    }
    logger.info(
      { workspaceId, opportunityId, band: probe.band, decision: gate.reviewDecision },
      'link-probe: revoked Approved — no submission form / dead'
    );
  } catch (err) {
    logger.warn({ err, opportunityId }, 'link-probe: submission gate apply failed');
  }
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return out;
}

/**
 * Probe a batch of opportunities in a workspace. Skips fresh probes unless force.
 */
export async function runLinkProbeBatch(input: {
  workspaceId: string;
  opportunityIds?: string[];
  limit?: number;
  force?: boolean;
}): Promise<{
  processed: number;
  skippedFresh: number;
  bands: Record<string, number>;
}> {
  const limit = Math.min(MAX_BATCH, Math.max(1, input.limit ?? DEFAULT_BATCH));
  const force = Boolean(input.force);

  let query = getSupabaseAdmin()
    .from('opportunities')
    .select('id, url, domain, title, website_name, campaign_lifecycle, metadata')
    .eq('workspace_id', input.workspaceId)
    .order('updated_at', { ascending: false })
    .limit(limit * 3);

  if (input.opportunityIds?.length) {
    query = getSupabaseAdmin()
      .from('opportunities')
      .select('id, url, domain, title, website_name, campaign_lifecycle, metadata')
      .eq('workspace_id', input.workspaceId)
      .in('id', input.opportunityIds.slice(0, MAX_BATCH));
  }

  const { data, error } = await query;
  if (error) {
    logger.error({ error }, 'link-probe: list opportunities failed');
    throw new AppError(500, 'INTERNAL_ERROR', 'Failed to load opportunities for probe');
  }

  const rows = ((data ?? []) as OppRow[]).filter((row) => {
    const life = String(row.campaign_lifecycle ?? '');
    return life !== 'Deleted' && life !== 'Rejected' && life !== 'Ignored';
  });
  const toProbe: OppRow[] = [];
  let skippedFresh = 0;
  for (const row of rows) {
    if (toProbe.length >= limit) break;
    const existing = readProbe(row.metadata);
    if (isFresh(existing, force)) {
      skippedFresh += 1;
      continue;
    }
    toProbe.push(row);
  }

  const browserBudget = { used: 0, max: BROWSER_BUDGET_PER_RUN };
  const bands: Record<string, number> = {};

  await mapPool(toProbe, CONCURRENCY, async (row) => {
    try {
      const probe = await probeOpportunity(row, browserBudget);
      await saveProbe(row.id, (row.metadata as Record<string, unknown>) ?? {}, probe);
      await applyProbeSubmissionGate(input.workspaceId, row.id, probe);
      bands[probe.band] = (bands[probe.band] ?? 0) + 1;
    } catch (err) {
      logger.warn({ err, opportunityId: row.id }, 'link-probe: item failed');
      const fail: LinkProbeResult = {
        band: 'dead',
        score: 0,
        alive: false,
        httpStatus: null,
        formFound: false,
        formUrl: null,
        formScore: 0,
        fieldCount: 0,
        hasUrl: false,
        hasTitle: false,
        hasDesc: false,
        hasEmail: false,
        multiStep: false,
        spaShell: false,
        gates: [],
        reasons: [err instanceof Error ? err.message : 'probe_error'],
        pagesChecked: 0,
        probedAt: new Date().toISOString(),
        listingPricing: 'unknown',
      };
      await saveProbe(row.id, (row.metadata as Record<string, unknown>) ?? {}, fail);
      await applyProbeSubmissionGate(input.workspaceId, row.id, fail);
      bands.dead = (bands.dead ?? 0) + 1;
    }
  });

  logger.info(
    {
      workspaceId: input.workspaceId,
      processed: toProbe.length,
      skippedFresh,
      bands,
      browserUsed: browserBudget.used,
    },
    'link-probe batch complete'
  );

  return { processed: toProbe.length, skippedFresh, bands };
}

export async function enqueueLinkProbe(input: {
  workspaceId: string;
  orgId?: string;
  userId?: string;
  opportunityIds?: string[];
  limit?: number;
  force?: boolean;
}): Promise<{ jobId: string | null; queued: boolean }> {
  const jobId = await enqueueJob(
    QUEUES.CRAWL,
    'backlink_link_probe',
    {
      type: 'backlink_link_probe',
      workspaceId: input.workspaceId,
      orgId: input.orgId,
      userId: input.userId,
      opportunityIds: input.opportunityIds,
      limit: input.limit ?? DEFAULT_BATCH,
      force: Boolean(input.force),
    },
    {
      singletonKey: `link-probe-${input.workspaceId}`,
      retryLimit: 1,
    }
  );
  return { jobId, queued: Boolean(jobId) };
}

export async function getLinkProbeStats(workspaceId: string): Promise<LinkProbeStats> {
  const { data, error } = await getSupabaseAdmin()
    .from('opportunities')
    .select('metadata, campaign_lifecycle')
    .eq('workspace_id', workspaceId)
    .limit(5000);

  if (error) {
    throw new AppError(500, 'INTERNAL_ERROR', 'Failed to load probe stats');
  }

  const stats: LinkProbeStats = {
    total: 0,
    probed: 0,
    unprobed: 0,
    ready: 0,
    check: 0,
    blocked: 0,
    dead: 0,
    no_form: 0,
    lastRunAt: null,
  };

  let last = 0;
  for (const row of data ?? []) {
    const life = String(row.campaign_lifecycle ?? '');
    if (life === 'Deleted' || life === 'Rejected' || life === 'Ignored') continue;
    stats.total += 1;
    const probe = readProbe(row.metadata as Record<string, unknown>);
    if (!probe) {
      stats.unprobed += 1;
      continue;
    }
    stats.probed += 1;
    const band = probe.band as LinkProbeBand;
    if (band === 'ready') stats.ready += 1;
    else if (band === 'check') stats.check += 1;
    else if (band === 'blocked') stats.blocked += 1;
    else if (band === 'dead') stats.dead += 1;
    else if (band === 'no_form') stats.no_form += 1;
    const t = Date.parse(probe.probedAt);
    if (Number.isFinite(t) && t > last) last = t;
  }
  stats.lastRunAt = last ? new Date(last).toISOString() : null;
  return stats;
}

export async function listLinkProbeQueue(input: {
  workspaceId: string;
  band?: LinkProbeBand | 'all';
  limit?: number;
}): Promise<{ stats: LinkProbeStats; items: LinkProbeQueueItem[] }> {
  const limit = Math.min(500, Math.max(1, input.limit ?? 100));
  const bandFilter = input.band && input.band !== 'all' ? input.band : null;

  const { data, error } = await getSupabaseAdmin()
    .from('opportunities')
    .select('id, url, domain, title, website_name, campaign_lifecycle, metadata')
    .eq('workspace_id', input.workspaceId)
    .limit(5000);

  if (error) {
    throw new AppError(500, 'INTERNAL_ERROR', 'Failed to load probe queue');
  }

  const items: LinkProbeQueueItem[] = [];
  for (const row of (data ?? []) as OppRow[]) {
    const life = String(row.campaign_lifecycle ?? '');
    if (life === 'Deleted' || life === 'Rejected' || life === 'Ignored') continue;
    const probe = readProbe(row.metadata);
    if (!probe) continue;
    if (bandFilter && probe.band !== bandFilter) continue;
    items.push({
      opportunityId: row.id,
      domain: String(row.domain ?? ''),
      title: String(row.website_name || row.title || row.domain || ''),
      url: String(row.url ?? ''),
      lifecycle: row.campaign_lifecycle,
      probe,
    });
  }

  items.sort((a, b) => {
    const bandOrder: Record<string, number> = {
      ready: 0,
      check: 1,
      blocked: 2,
      no_form: 3,
      dead: 4,
      unprobed: 5,
    };
    const bd = (bandOrder[a.probe.band] ?? 9) - (bandOrder[b.probe.band] ?? 9);
    if (bd !== 0) return bd;
    return b.probe.score - a.probe.score;
  });

  return {
    stats: await getLinkProbeStats(input.workspaceId),
    items: items.slice(0, limit),
  };
}

export { linkProbeBandLabel };

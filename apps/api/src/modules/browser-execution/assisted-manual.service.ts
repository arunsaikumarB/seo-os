/**
 * Phase 7 — Assisted Manual packages + Site Recipes (pilot ≤10).
 * Additive: does not change Auto/Manual routing, CSM, Truth Engine, or BEE worker.
 * Never auto-submits or solves CAPTCHA/OTP/login.
 */
import {
  ASSISTED_MANUAL_PILOT_MAX,
  ASSISTED_PACKAGE_TTL_DAYS,
  ASSISTED_PREPARE_BATCH_MAX,
  ASSISTED_FORM_READER_VERSION,
  ASSISTED_FIELD_CLASSIFIER_VERSION,
  applyHumanFieldCorrection,
  clearHumanCorrections,
  markFieldMappingWrong,
  recipePinsOnly,
  buildAssistedPackage,
  buildSiteRecipe,
  computeAssistedLaneCounts,
  dedupeContentFields,
  detectMultiStepForm,
  evaluateFingerprintStatus,
  extractFormFieldFacts,
  extractTargetFormFieldFacts,
  fieldFactSnapshot,
  fitDescriptionToCap,
  formUnavailableMessage,
  htmlHasFormElement,
  looksLikeSpaShell,
  normalizeSiteDomain,
  MULTI_STEP_FORM_LABEL,
  WIZARD_COULD_NOT_REACH_LABEL,
  WIZARD_PAID_ONLY_LABEL,
  recipeVersionsCurrent,
  stripCategoryFromAssistedPayload,
  gateIsOtp,
  gateRequiresPerson,
  isAssistedSubmitted,
  resolveAssistedVisualStatus,
  collectKnownFormUrlHints,
  extractSubmissionCandidateLinks,
  formDiscoveryFailureMessage,
  FORM_DISCOVERY_DEFAULTS,
  pickBestFormPage,
  scoreSubmissionFormPage,
  discoveryAcceptsFormPage,
  pageLooksLikeMultiStepWizard,
  isIntermediateWizardStep,
  htmlHasCoreContentFields,
  formatWizardStepSequence,
  type AssistedPackagePayload,
  type FieldRole,
  type FormDiscoverySource,
  type FormUrlHintBundle,
  type PackageStatus,
  type SiteRecipe,
} from '@seo-os/backlink-builder';
import { AppError } from '@seo-os/shared';
import { walkSubmissionWizard } from './wizard-walk.service.js';
import {
  fetchRobotsTxt,
  isPathAllowed,
} from '@seo-os/seo-intelligence';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { logger } from '../../lib/logger.js';
import { getBrandContextForBee } from './bee-assets.js';
import {
  getManualSubmissionsBoard,
  loadLaneEvidenceForWorkspace,
} from './manual-lane-backfill.service.js';
import { resolveItemLane } from '@seo-os/backlink-builder';

function admin() {
  return getSupabaseAdmin();
}

const PILOT_BATCH = 'assisted-content-ready';
/** Cap Playwright fallbacks per form-discovery run (HTTP is preferred). */
const MAX_BROWSER_HTML_FETCHES = 6;

/** True when HTML looks like a real page we can crawl / read forms from. */
function isUsablePageHtml(html: string): boolean {
  const t = String(html ?? '').trim();
  if (t.length < 400) return false;
  const head = t.slice(0, 12_000).toLowerCase();
  const hasForm = /<form[\s>]/i.test(t);
  const challenge =
    /cf-browser-verification|cdn-cgi\/challenge|just a moment|enable javascript and cookies|access denied|attention required|bot.?detect|checking your browser|ddos-guard/i.test(
      head
    );
  if (challenge && !hasForm) return false;
  // Soft empty shells: almost no links and no form
  if (!hasForm && !/<a\s/i.test(t) && t.length < 2_000) return false;
  return true;
}

async function fetchHtmlHttp(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(25_000),
      headers: {
        // Browser-like UA — some directories block custom bots and return an empty shell
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    if (!res.ok) {
      logger.warn({ url, status: res.status }, 'assisted-manual: fetch html non-OK');
      return null;
    }
    const text = (await res.text()).slice(0, 500_000);
    return text || null;
  } catch (err) {
    logger.warn({ err, url }, 'assisted-manual: fetch html failed');
    return null;
  }
}

/**
 * HTTP first; Playwright whenever HTTP is missing, empty, or unusable
 * (not only challenge-page heuristics). Budget caps Chromium launches per discovery.
 */
async function fetchHtml(
  url: string,
  browserBudget?: { used: number; max: number }
): Promise<string | null> {
  const http = await fetchHtmlHttp(url);
  // Usable HTTP with a real <form> — done. Formless SPA shells still need Playwright settle.
  if (http && isUsablePageHtml(http) && htmlHasFormElement(http)) {
    return http;
  }
  const spaNeedsBrowser =
    Boolean(http && looksLikeSpaShell(http) && !htmlHasFormElement(http));
  const httpFailed = !http || !http.trim() || !isUsablePageHtml(http);

  if (!httpFailed && !spaNeedsBrowser) {
    return http;
  }

  logger.info(
    {
      url,
      httpBytes: http?.length ?? 0,
      httpFailed,
      spaNeedsBrowser,
      usable: Boolean(http && isUsablePageHtml(http)),
      budgetUsed: browserBudget?.used ?? null,
    },
    'assisted-manual: invoking Playwright HTML fallback'
  );

  if (browserBudget && browserBudget.used >= browserBudget.max) {
    logger.warn(
      { url, used: browserBudget.used, max: browserBudget.max },
      'assisted-manual: browser fetch budget exhausted — returning null'
    );
    return null;
  }

  try {
    const { fetchRenderedHtml } = await import('./browser-runtime.service.js');
    if (browserBudget) browserBudget.used += 1;
    const rendered = await fetchRenderedHtml(url, {
      timeoutMs: 45_000,
      settleSpa: true,
    });
    if (rendered && (isUsablePageHtml(rendered) || htmlHasFormElement(rendered))) {
      logger.info(
        { url, httpBytes: http?.length ?? 0, browserBytes: rendered.length },
        'assisted-manual: browser HTML fallback succeeded'
      );
      return rendered;
    }
    logger.warn(
      {
        url,
        browserBytes: rendered?.length ?? 0,
        hasForm: Boolean(rendered && htmlHasFormElement(rendered)),
      },
      'assisted-manual: browser HTML fallback returned unusable page'
    );
    if (rendered && rendered.trim().length > 200) return rendered;
  } catch (err) {
    logger.warn({ err, url }, 'assisted-manual: browser HTML fallback failed');
  }
  return null;
}

type FormResolveResult = {
  importedEntryUrl: string;
  formUrl: string;
  html: string | null;
  pagesChecked: string[];
  formFound: boolean;
  source: FormDiscoverySource;
  discoveryFailureReason: string | null;
};

/**
 * Locate the submission page before Form Reader runs.
 * Order: cached recipe.resolvedFormUrl → Site Intelligence strategy/learning →
 * imported entry → bounded same-domain crawl (top candidates, depth ≤2).
 */
async function resolveAssistedFormTarget(params: {
  domain: string;
  importedEntryUrl: string;
  hints: FormUrlHintBundle;
  forceRediscover?: boolean;
}): Promise<FormResolveResult> {
  const pagesChecked: string[] = [];
  const fetched = new Map<string, string>();
  const domain = params.domain;
  const seed = params.importedEntryUrl;
  const browserBudget = { used: 0, max: MAX_BROWSER_HTML_FETCHES };

  let robotsDisallow: string[] = [];
  try {
    const origin = new URL(seed.startsWith('http') ? seed : `https://${domain}`).origin;
    const robots = await fetchRobotsTxt(origin);
    robotsDisallow = robots?.disallow ?? [];
  } catch {
    robotsDisallow = [];
  }

  const allowed = (url: string) => {
    try {
      return isPathAllowed(new URL(url).pathname, robotsDisallow);
    } catch {
      return true;
    }
  };

  const fetchOne = async (url: string): Promise<string | null> => {
    const key = url.replace(/\/$/, '').toLowerCase();
    if (fetched.has(key)) return fetched.get(key)!;
    if (!allowed(url)) {
      logger.info({ url }, 'assisted-manual: skip robots-disallowed URL');
      return null;
    }
    const html = await fetchHtml(url, browserBudget);
    pagesChecked.push(url);
    if (html) fetched.set(key, html);
    return html;
  };

  const knownHints = collectKnownFormUrlHints(domain, params.hints).filter((u) => {
    if (params.forceRediscover && params.hints.resolvedFormUrl) {
      const cached = params.hints.resolvedFormUrl.replace(/\/$/, '').toLowerCase();
      return u.replace(/\/$/, '').toLowerCase() !== cached;
    }
    return true;
  });

  // 1) Try known SI / cached URLs first (including cache unless forceRediscover)
  const priorityUrls = params.forceRediscover
    ? knownHints
    : collectKnownFormUrlHints(domain, params.hints);

  for (const url of priorityUrls.slice(0, FORM_DISCOVERY_DEFAULTS.maxPages)) {
    const html = await fetchOne(url);
    if (!html) continue;
    if (discoveryAcceptsFormPage(html)) {
      const source: FormDiscoverySource =
        params.hints.resolvedFormUrl &&
        url.replace(/\/$/, '').toLowerCase() ===
          String(params.hints.resolvedFormUrl).replace(/\/$/, '').toLowerCase()
          ? 'cache'
          : url.replace(/\/$/, '').toLowerCase() === seed.replace(/\/$/, '').toLowerCase()
            ? 'entry'
            : 'site_intelligence';
      logger.info(
        {
          domain,
          formUrl: url,
          source,
          pagesCrawled: pagesChecked.length,
          multiStep: pageLooksLikeMultiStepWizard(html),
          score: scoreSubmissionFormPage(html).score,
        },
        'assisted-manual: discovery accepted form page'
      );
      return {
        importedEntryUrl: seed,
        formUrl: url,
        html,
        pagesChecked: [...pagesChecked],
        formFound: true,
        source,
        discoveryFailureReason: null,
      };
    }
  }

  // 2) Seed entry URL (if not already tried)
  const seedHtml = await fetchOne(seed);
  if (seedHtml && discoveryAcceptsFormPage(seedHtml)) {
    logger.info(
      {
        domain,
        formUrl: seed,
        source: 'entry',
        pagesCrawled: pagesChecked.length,
        multiStep: pageLooksLikeMultiStepWizard(seedHtml),
        score: scoreSubmissionFormPage(seedHtml).score,
      },
      'assisted-manual: discovery accepted seed entry'
    );
    return {
      importedEntryUrl: seed,
      formUrl: seed,
      html: seedHtml,
      pagesChecked: [...pagesChecked],
      formFound: true,
      source: 'entry',
      discoveryFailureReason: null,
    };
  }

  // 2b) Homepage deep seeds when entry is empty/blocked — unlock crawl link graph
  const homepageSeeds = [`https://${domain}/`, `https://www.${domain}/`].filter(
    (u) => u.replace(/\/$/, '').toLowerCase() !== seed.replace(/\/$/, '').toLowerCase()
  );
  for (const home of homepageSeeds) {
    if (pagesChecked.length >= FORM_DISCOVERY_DEFAULTS.maxPages) break;
    const homeHtml = await fetchOne(home);
    if (!homeHtml) continue;
    if (discoveryAcceptsFormPage(homeHtml)) {
      logger.info(
        {
          domain,
          formUrl: home,
          source: 'crawl',
          pagesCrawled: pagesChecked.length,
          multiStep: pageLooksLikeMultiStepWizard(homeHtml),
        },
        'assisted-manual: discovery accepted homepage'
      );
      return {
        importedEntryUrl: seed,
        formUrl: home,
        html: homeHtml,
        pagesChecked: [...pagesChecked],
        formFound: true,
        source: 'crawl',
        discoveryFailureReason: null,
      };
    }
  }

  // 3) Bounded discovery crawl from entry + any fetched pages
  const candidateQueue: Array<{ url: string; score: number; depth: number }> = [];
  const seenCand = new Set<string>(
    [...fetched.keys(), seed.replace(/\/$/, '').toLowerCase()]
  );

  const absorbLinks = (html: string, pageUrl: string, depth: number) => {
    if (depth >= FORM_DISCOVERY_DEFAULTS.maxDepth) return;
    for (const c of extractSubmissionCandidateLinks(html, pageUrl, domain, depth)) {
      const key = c.url.replace(/\/$/, '').toLowerCase();
      if (seenCand.has(key)) continue;
      if (c.depth > FORM_DISCOVERY_DEFAULTS.maxDepth) continue;
      seenCand.add(key);
      candidateQueue.push({ url: c.url, score: c.score, depth: c.depth });
    }
  };

  for (const [key, html] of fetched) {
    absorbLinks(html, key, 0);
  }
  if (seedHtml) absorbLinks(seedHtml, seed, 0);

  candidateQueue.sort((a, b) => b.score - a.score);
  const toFetch = candidateQueue.slice(0, FORM_DISCOVERY_DEFAULTS.maxCandidates);

  for (const c of toFetch) {
    if (pagesChecked.length >= FORM_DISCOVERY_DEFAULTS.maxPages) break;
    const html = await fetchOne(c.url);
    if (!html) continue;
    absorbLinks(html, c.url, c.depth);
  }

  // Second-pass candidates discovered at depth 1 (still ≤ maxDepth / maxPages)
  candidateQueue.sort((a, b) => b.score - a.score);
  for (const c of candidateQueue) {
    if (pagesChecked.length >= FORM_DISCOVERY_DEFAULTS.maxPages) break;
    const key = c.url.replace(/\/$/, '').toLowerCase();
    if (fetched.has(key)) continue;
    if (c.depth > FORM_DISCOVERY_DEFAULTS.maxDepth) continue;
    const html = await fetchOne(c.url);
    if (!html) continue;
  }

  const pages = [...fetched.entries()].map(([url, html]) => ({ url, html }));
  // Restore original URLs from pagesChecked where possible
  const withOriginal = pages.map((p) => {
    const match = pagesChecked.find(
      (u) => u.replace(/\/$/, '').toLowerCase() === p.url.replace(/\/$/, '').toLowerCase()
    );
    return { url: match ?? p.url, html: p.html };
  });

  const best = pickBestFormPage(withOriginal);
  if (best) {
    const html =
      fetched.get(best.url.replace(/\/$/, '').toLowerCase()) ??
      withOriginal.find((p) => p.url === best.url)?.html ??
      null;
    logger.info(
      {
        domain,
        formUrl: best.url,
        source: 'crawl',
        pagesCrawled: pagesChecked.length,
        pagesChecked,
        score: best.score,
        fieldCount: best.fieldCount,
        multiStep: html ? pageLooksLikeMultiStepWizard(html) : false,
        candidatesQueued: candidateQueue.length,
        maxDepth: FORM_DISCOVERY_DEFAULTS.maxDepth,
      },
      'assisted-manual: deep discovery chose form page'
    );
    return {
      importedEntryUrl: seed,
      formUrl: best.url,
      html,
      pagesChecked: [...pagesChecked],
      formFound: Boolean(html),
      source: 'crawl',
      discoveryFailureReason: null,
    };
  }

  const failure = formDiscoveryFailureMessage(pagesChecked);
  // Prefer any usable HTML we did fetch (homepage / seed) over null
  let fallbackHtml =
    seedHtml ??
    [...fetched.values()].find((h) => isUsablePageHtml(h)) ??
    [...fetched.values()][0] ??
    null;

  // If we fetched a multi-step / category form that scored under the old threshold, still accept it
  for (const [key, html] of fetched) {
    if (!discoveryAcceptsFormPage(html)) continue;
    const match =
      pagesChecked.find((u) => u.replace(/\/$/, '').toLowerCase() === key) ?? key;
    logger.info(
      {
        domain,
        formUrl: match,
        pagesCrawled: pagesChecked.length,
        pagesChecked,
        multiStep: pageLooksLikeMultiStepWizard(html),
      },
      'assisted-manual: accepting sparse/multi-step form from crawl cache'
    );
    return {
      importedEntryUrl: seed,
      formUrl: match,
      html,
      pagesChecked: [...pagesChecked],
      formFound: true,
      source: 'crawl',
      discoveryFailureReason: null,
    };
  }

  // Last chance: if discovery produced no HTML at all, force Playwright on seed + homepage
  if (!fallbackHtml) {
    const lastChance = [
      seed,
      `https://${domain}/`,
      `https://www.${domain}/`,
    ];
    for (const url of lastChance) {
      if (browserBudget.used >= browserBudget.max) break;
      const key = url.replace(/\/$/, '').toLowerCase();
      if (fetched.has(key)) continue;
      logger.warn({ url, domain }, 'assisted-manual: last-chance Playwright fetch (no HTML yet)');
      const html = await fetchHtml(url, browserBudget);
      if (html) {
        pagesChecked.push(url);
        fetched.set(key, html);
        fallbackHtml = html;
        if (discoveryAcceptsFormPage(html)) {
          return {
            importedEntryUrl: seed,
            formUrl: url,
            html,
            pagesChecked: [...pagesChecked],
            formFound: true,
            source: 'crawl',
            discoveryFailureReason: null,
          };
        }
        break;
      }
    }
  }

  logger.info(
    {
      domain,
      seed,
      pagesCrawled: pagesChecked.length,
      pagesChecked,
      fetchedPages: fetched.size,
      candidatesQueued: candidateQueue.length,
      maxDepth: FORM_DISCOVERY_DEFAULTS.maxDepth,
      maxPages: FORM_DISCOVERY_DEFAULTS.maxPages,
      failure,
    },
    'assisted-manual: deep discovery found no acceptable form'
  );

  return {
    importedEntryUrl: seed,
    formUrl: seed,
    html: fallbackHtml,
    pagesChecked: [...pagesChecked],
    formFound: false,
    source: 'none',
    discoveryFailureReason: failure,
  };
}

function asRecipe(raw: unknown): SiteRecipe | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as SiteRecipe;
  if (!r.domain || !r.formFingerprint || !Array.isArray(r.fields)) return null;
  return r;
}

async function upsertRecipeOnProfile(
  workspaceId: string,
  domain: string,
  recipe: SiteRecipe
): Promise<void> {
  const { data: existing } = await admin()
    .from('site_profiles')
    .select('id, recipe')
    .eq('workspace_id', workspaceId)
    .eq('domain', domain)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await admin()
      .from('site_profiles')
      .update({ recipe, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
    if (error) throw new AppError(500, 'INTERNAL_ERROR', error.message);
    return;
  }

  const { error } = await admin().from('site_profiles').insert({
    workspace_id: workspaceId,
    domain,
    recipe,
    profile_status: 'complete',
    fingerprint: {},
    learning: {},
    crawl_stats: { source: 'assisted_manual_form_reader' },
  });
  if (error) throw new AppError(500, 'INTERNAL_ERROR', error.message);
}

async function loadContentForOpportunity(workspaceId: string, opportunityId: string) {
  const { data: pack } = await admin()
    .from('content_packs')
    .select('pack')
    .eq('opportunity_id', opportunityId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  const p = (pack?.pack as Record<string, unknown> | null) ?? {};
  const brand = await getBrandContextForBee(workspaceId);
  // Phase 15 — campaign reciprocal settings live on brand_profile (not Generation)
  const { data: wsRow } = await admin()
    .from('workspaces')
    .select('brand_profile')
    .eq('id', workspaceId)
    .maybeSingle();
  const brandProfile =
    wsRow?.brand_profile && typeof wsRow.brand_profile === 'object'
      ? (wsRow.brand_profile as Record<string, unknown>)
      : {};
  const reciprocalUrl = String(
    brandProfile.reciprocalUrl ?? brandProfile.reciprocal_url ?? ''
  ).trim();
  const reciprocalAnchor = String(
    brandProfile.reciprocalAnchor ?? brandProfile.reciprocal_anchor ?? ''
  ).trim();
  const projectDomain = String(brand.projectDomain ?? '')
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '')
    .trim();

  const longDescRaw = String(p.longDescription ?? p.businessDescription ?? '').trim();
  const meta = String(p.metaDescription ?? '').trim();
  const shortRaw = String(p.shortDescription ?? p.excerpt ?? meta ?? '').trim();
  // Brand fallbacks so Needs a person packages never ship empty paste cards
  const brandFallbackLong =
    String(brand.tagline ?? '').trim() ||
    (brand.industry
      ? `${brand.brandName} provides ${brand.industry} solutions.`
      : `${brand.brandName} — visit https://${projectDomain || 'example.com'}.`);
  const longDesc = longDescRaw || brandFallbackLong;
  const shortDesc =
    shortRaw ||
    String(brand.tagline ?? '').trim() ||
    longDesc.slice(0, 160);
  const deduped = dedupeContentFields({
    title: String(
      p.seoTitle ?? p.headline ?? p.businessName ?? brand.brandName ?? projectDomain ?? ''
    ),
    shortDescription: shortDesc,
    longDescription: longDesc,
    metaDescription: meta || shortDesc,
  });
  const businessName = String(
    p.businessName ?? brand.brandName ?? projectDomain ?? ''
  );
  const title = deduped.title || businessName || projectDomain || 'Listing';
  const images = Array.isArray(p.suggestedImages) ? p.suggestedImages : [];
  const imageFileName =
    typeof images[0] === 'string'
      ? String(images[0]).split('/').pop()
      : `${(businessName || 'listing').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}-listing.jpg`;

  const listingUrl =
    resolveProjectListingUrl(p, projectDomain) ||
    (projectDomain ? `https://${projectDomain}` : '');

  return {
    title,
    shortDescription: fitDescriptionToCap(deduped.shortDescription || shortDesc).value,
    longDescription: fitDescriptionToCap(deduped.longDescription || longDesc).value,
    metaDescription: deduped.metaDescription || shortDesc,
    businessName,
    companyName: String(
      brand.companyName || p.businessName || brand.brandName || businessName || ''
    ),
    contactName: String(brand.contactName ?? p.contactName ?? p.authorName ?? ''),
    url: listingUrl,
    email: String(brand.contactEmail || p.email || ''),
    phone: String(brand.contactPhone || p.phone || ''),
    address: String(p.address ?? ''),
    reciprocalUrl: reciprocalUrl || undefined,
    anchorText: reciprocalAnchor || undefined,
    imageFileName,
    contentTooSimilar: Boolean(p.contentTooSimilar),
  };
}

/** Prefer content-pack / project domain — never the directory submit URL. */
function resolveProjectListingUrl(
  pack: Record<string, unknown>,
  projectDomain: string
): string {
  const social = (pack.socialLinks as Record<string, unknown> | null) ?? {};
  const schema = (pack.schemaJsonLd as Record<string, unknown> | null) ?? {};
  const firstLink = (arr: unknown): string | null => {
    if (!Array.isArray(arr) || !arr.length) return null;
    const row = arr[0];
    if (typeof row === 'string' && row.trim()) return row.trim();
    if (row && typeof row === 'object' && 'url' in row) {
      const u = String((row as { url?: unknown }).url ?? '').trim();
      return u || null;
    }
    return null;
  };

  const candidates = [
    pack.website,
    social.website,
    social.url,
    schema.url,
    firstLink(pack.internalLinks),
    firstLink(pack.suggestedLinks),
  ];

  for (const c of candidates) {
    if (typeof c !== 'string' || !c.trim()) continue;
    const url = c.trim();
    // Reject obvious directory submit paths mistaken as brand URL
    if (/\/submit(?:\/|$|\?)/i.test(url)) continue;
    if (!/^https?:\/\//i.test(url) && projectDomain && url.includes(projectDomain)) {
      return `https://${url.replace(/^\/+/, '')}`;
    }
    if (/^https?:\/\//i.test(url)) return url;
  }

  if (projectDomain) return `https://${projectDomain}`;
  return '';
}

/** Prepare Assisted Manual packages for every content-ready site (not Manual-only). */
export async function prepareAssistedPackages(
  workspaceId: string,
  opts: { opportunityIds?: string[]; entryUrlOverrides?: Record<string, string> } = {}
) {
  const contentReadyIds = await listContentReadyOpportunityIds(workspaceId);
  const readySet = new Set(contentReadyIds);

  let targetIds = opts.opportunityIds?.length
    ? opts.opportunityIds.filter((id) => readySet.has(id) || contentReadyIds.length === 0)
    : contentReadyIds;

  // If explicit IDs requested but not yet in content-ready set, still allow (re-prepare)
  if (opts.opportunityIds?.length) {
    targetIds = [...new Set(opts.opportunityIds)];
  }

  targetIds = targetIds.slice(0, ASSISTED_PREPARE_BATCH_MAX);

  // Load existing packages — force re-read when reader/classifier behind OR prior No HTML
  const { data: existingRows } = await admin()
    .from('assisted_packages')
    .select('id, opportunity_id, payload, failure_reason')
    .eq('workspace_id', workspaceId)
    .in('opportunity_id', targetIds.length ? targetIds : ['00000000-0000-0000-0000-000000000000']);
  const byOpp = new Map(
    (existingRows ?? []).map((r) => [String(r.opportunity_id), r] as const)
  );

  const prepared: unknown[] = [];
  const errors: Array<{ opportunityId: string; error: string }> = [];

  for (const opportunityId of targetIds) {
    try {
      const existing = byOpp.get(opportunityId);
      const payload = (existing?.payload as AssistedPackagePayload | null) ?? null;
      const readerV = Number(payload?.readerVersion);
      const classV = Number(payload?.classifierVersion);
      const formUnavailable = Boolean(
        (payload as { formUnavailable?: boolean } | null)?.formUnavailable
      ) || /javascript-rendered|behind login|form_unavailable/i.test(
        String(existing?.failure_reason ?? payload?.failureReason ?? '')
      );
      const versionBehind =
        !payload ||
        !Number.isFinite(readerV) ||
        !Number.isFinite(classV) ||
        readerV !== ASSISTED_FORM_READER_VERSION ||
        classV !== ASSISTED_FIELD_CLASSIFIER_VERSION;
      const noHtmlPrior = /no html fetched/i.test(
        String(existing?.failure_reason ?? payload?.failureReason ?? '')
      );
      // form_unavailable: another Prepare will not help — don't burn Playwright budget again
      const forceReread =
        !formUnavailable && (versionBehind || noHtmlPrior || !existing);

      const pkg = await prepareOnePackage(workspaceId, opportunityId, {
        entryUrlOverride: opts.entryUrlOverrides?.[opportunityId],
        forceReread,
        packageId: existing?.id ? String(existing.id) : undefined,
      });
      prepared.push(pkg);
    } catch (err) {
      errors.push({
        opportunityId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  await enforceSimilarity(workspaceId);

  const board = await listAssistedPackages(workspaceId);
  const result = {
    prepared: prepared.length,
    errors,
    totalCandidates: contentReadyIds.length,
    packages: board,
  };

  if (prepared.length > 0 || errors.length > 0) {
    try {
      const c = board.counts;
      const { notifyStageCompleteAsync } = await import('../platform/stage-notify.service.js');
      notifyStageCompleteAsync({
        workspaceId,
        kind: 'assisted_manual_prep',
        stageName: 'Assisted Manual',
        summary:
          errors.length > 0
            ? `Prepared ${prepared.length} packages · ${errors.length} failed`
            : `Prepared ${prepared.length} packages · ${c.ready} Ready · ${c.checkFields} check fields · ${c.needsPerson} need a person`,
        outcome: errors.length > 0 ? (prepared.length > 0 ? 'partial' : 'failure') : 'success',
        href: `/projects/${workspaceId}/backlink-builder/assisted-manual`,
        payload: {
          fingerprint: `assisted-prep:${prepared.length}:${errors.length}:${c.ready}`,
          prepared: prepared.length,
          failed: errors.length,
        },
      });
    } catch {
      /* notify optional */
    }
  }

  return result;
}

/** @deprecated Use prepareAssistedPackages — alias kept for older callers */
export const prepareAssistedPilot = prepareAssistedPackages;

/** Single-site prepare after content generation handoff (fire-and-forget safe). */
export async function prepareAssistedForOpportunity(
  workspaceId: string,
  opportunityId: string
) {
  const saved = await prepareOnePackage(workspaceId, opportunityId);
  await enforceSimilarity(workspaceId).catch((err) =>
    logger.warn({ err, workspaceId }, 'assisted similarity check failed')
  );
  return saved;
}

async function listContentReadyOpportunityIds(workspaceId: string): Promise<string[]> {
  const ids = new Set<string>();

  const { data: packs } = await admin()
    .from('content_packs')
    .select('opportunity_id')
    .eq('workspace_id', workspaceId)
    .limit(ASSISTED_PREPARE_BATCH_MAX);
  for (const p of packs ?? []) {
    if (p.opportunity_id) ids.add(String(p.opportunity_id));
  }

  const { data: opps } = await admin()
    .from('opportunities')
    .select('id, campaign_lifecycle, generation_status, automation_status')
    .eq('workspace_id', workspaceId)
    .neq('campaign_lifecycle', 'Deleted')
    .not('automation_status', 'in', '("deleted","ignored")')
    .limit(ASSISTED_PREPARE_BATCH_MAX);

  const terminalLife = new Set([
    'Deleted',
    'Rejected',
    'Ignored',
    'Failed',
    'Submitted',
    'Verified',
    'Completed',
  ]);

  for (const o of opps ?? []) {
    const life = String(o.campaign_lifecycle ?? '');
    const gen = String(o.generation_status ?? '');
    if (terminalLife.has(life)) continue;
    if (
      life === 'Package Generated' ||
      life === 'Ready' ||
      life === 'Approved' ||
      life === 'Waiting Human' ||
      life === 'Submitting' ||
      gen === 'Completed' ||
      gen === 'Needs Review' ||
      gen === 'Generated'
    ) {
      ids.add(String(o.id));
    }
  }

  // Drop content-pack IDs that are already past Assisted (Submitted/Verified/…)
  if (ids.size > 0) {
    const { data: lifeRows } = await admin()
      .from('opportunities')
      .select('id, campaign_lifecycle, automation_status')
      .eq('workspace_id', workspaceId)
      .in('id', [...ids]);
    for (const row of lifeRows ?? []) {
      const life = String(row.campaign_lifecycle ?? '');
      const auto = String(row.automation_status ?? '').toLowerCase();
      if (terminalLife.has(life) || auto === 'deleted' || auto === 'ignored') {
        ids.delete(String(row.id));
      }
    }
  }

  return [...ids].slice(0, ASSISTED_PREPARE_BATCH_MAX);
}

/**
 * When auto-publish is OFF, every content-ready site (including Automable lane)
 * must have an Assisted Manual package — browser won't submit them.
 */
async function healMissingAssistedPackages(workspaceId: string): Promise<{
  prepared: number;
  missing: number;
  errors: Array<{ opportunityId: string; error: string }>;
}> {
  const { getOrCreatePolicy } = await import('./bee.service.js');
  const policy = await getOrCreatePolicy(workspaceId);
  if (policy.auto_publish_automatable === true) {
    return { prepared: 0, missing: 0, errors: [] };
  }

  const readyIds = await listContentReadyOpportunityIds(workspaceId);
  if (!readyIds.length) return { prepared: 0, missing: 0, errors: [] };

  const { data: existing } = await admin()
    .from('assisted_packages')
    .select('opportunity_id')
    .eq('workspace_id', workspaceId)
    .in('opportunity_id', readyIds);
  const have = new Set((existing ?? []).map((r) => String(r.opportunity_id)));
  const missing = readyIds.filter((id) => !have.has(id));
  if (!missing.length) return { prepared: 0, missing: 0, errors: [] };

  logger.info(
    { workspaceId, missing: missing.length, autoPublish: false },
    'assisted-manual heal: preparing packages for content-ready sites without packages (incl. automatable)'
  );

  const errors: Array<{ opportunityId: string; error: string }> = [];
  let prepared = 0;
  // Bound list-heal work so page load stays responsive
  for (const opportunityId of missing.slice(0, 40)) {
    try {
      await prepareOnePackage(workspaceId, opportunityId);
      prepared += 1;
    } catch (err) {
      errors.push({
        opportunityId,
        error: err instanceof Error ? err.message : String(err),
      });
      logger.warn(
        { err, workspaceId, opportunityId },
        'assisted-manual heal prepare failed'
      );
    }
  }

  if (prepared > 0) {
    await enforceSimilarity(workspaceId).catch((err) =>
      logger.warn({ err, workspaceId }, 'assisted similarity check failed after heal')
    );
  }

  return { prepared, missing: missing.length, errors };
}

async function prepareOnePackage(
  workspaceId: string,
  opportunityId: string,
  opts: {
    entryUrlOverride?: string;
    forceReread?: boolean;
    packageId?: string;
    /** Prefer package.domain when re-reading an existing card (avoids www mismatch). */
    domainOverride?: string;
    /** Drop human pins before rebuild (Clear corrections). */
    clearPins?: boolean;
  } = {}
) {
  const { data: opp } = await admin()
    .from('opportunities')
    .select('id, domain, url, website_name, title, metadata, site_profile_id')
    .eq('id', opportunityId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (!opp) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Opportunity not found');

  const meta = (opp.metadata as Record<string, unknown> | null) ?? {};
  const domain = normalizeSiteDomain(
    String(opts.domainOverride || opp.domain || opp.url || '')
  );
  const importedEntryUrl =
    opts.entryUrlOverride ||
    String(meta.divertedUrl ?? meta.entryUrl ?? opp.url ?? `https://${domain}`);

  const { data: profile } = await admin()
    .from('site_profiles')
    .select('id, recipe, strategy, learning, page_classifications')
    .eq('workspace_id', workspaceId)
    .eq('domain', domain)
    .maybeSingle();

  let existingRecipe = asRecipe(profile?.recipe);
  if (opts.clearPins && existingRecipe) {
    existingRecipe = clearHumanCorrections(existingRecipe);
    // Persist stripped pins immediately so a failed re-read cannot resurrect them
    await upsertRecipeOnProfile(workspaceId, domain, existingRecipe);
  }

  // Prior package — used as fallback if the live form read returns nothing
  let priorPackage: Record<string, unknown> | null = null;
  if (opts.packageId) {
    const { data } = await admin()
      .from('assisted_packages')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('id', opts.packageId)
      .maybeSingle();
    priorPackage = data;
  } else {
    const { data } = await admin()
      .from('assisted_packages')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('opportunity_id', opportunityId)
      .order('prepared_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    priorPackage = data;
  }
  const priorPayload = (priorPackage?.payload as AssistedPackagePayload | undefined) ?? null;
  const priorFieldCount =
    priorPayload?.fields?.length ?? existingRecipe?.fields?.length ?? 0;

  // Clear → no pins. Force re-read → only real human_corrected (contradictions dropped in build).
  const existingForBuild = opts.clearPins
    ? existingRecipe
      ? { ...existingRecipe, fields: [] }
      : null
    : opts.forceReread
      ? recipePinsOnly(existingRecipe)
      : existingRecipe;

  const packageVersionStale =
    !priorPayload ||
    Number(priorPayload.readerVersion) !== ASSISTED_FORM_READER_VERSION ||
    Number(priorPayload.classifierVersion) !== ASSISTED_FIELD_CLASSIFIER_VERSION ||
    !Number(priorPayload.readerVersion) ||
    !Number(priorPayload.classifierVersion);
  const noHtmlPrior = /no html fetched/i.test(
    String(priorPackage?.failure_reason ?? priorPayload?.failureReason ?? '')
  );
  const versionStale =
    !recipeVersionsCurrent(existingForBuild) || packageVersionStale || noHtmlPrior;
  const forceReclassify =
    Boolean(opts.forceReread) || versionStale || Boolean(opts.clearPins);

  const strategy = (profile?.strategy ?? {}) as Record<string, unknown>;
  const learning = (profile?.learning ?? {}) as Record<string, unknown>;
  const directory =
    typeof learning.directory === 'object' && learning.directory
      ? (learning.directory as Record<string, unknown>)
      : {};
  const contactForm =
    typeof learning.contactForm === 'object' && learning.contactForm
      ? (learning.contactForm as Record<string, unknown>)
      : {};
  const pageClassifications = Array.isArray(profile?.page_classifications)
    ? (profile!.page_classifications as Array<Record<string, unknown>>)
    : [];
  const successfulPaths = Array.isArray(learning.successfulPaths)
    ? (learning.successfulPaths as Array<Record<string, unknown>>)
    : [];

  const resolved = await resolveAssistedFormTarget({
    domain,
    importedEntryUrl,
    forceRediscover: forceReclassify,
    hints: {
      resolvedFormUrl: existingRecipe?.resolvedFormUrl ?? priorPayload?.resolvedFormUrl ?? null,
      strategyEntryUrl: strategy.entryUrl ? String(strategy.entryUrl) : null,
      strategyFallbacks: Array.isArray(strategy.fallbacks)
        ? (strategy.fallbacks as Array<{ entryUrl?: string | null }>)
        : [],
      learningSubmissionUrls: Array.isArray(learning.submissionUrls)
        ? (learning.submissionUrls as string[])
        : [],
      successfulPathUrls: successfulPaths
        .map((p) => (p.entryUrl != null ? String(p.entryUrl) : null))
        .filter((u): u is string => Boolean(u)),
      directorySubmissionUrl: directory.submissionUrl
        ? String(directory.submissionUrl)
        : null,
      contactFormSubmissionUrl: contactForm.submissionUrl
        ? String(contactForm.submissionUrl)
        : null,
      pageClassificationUrls: pageClassifications
        .filter((p) => {
          const intent = String(p.intent ?? p.pageIntent ?? '').toLowerCase();
          return /submit|write.?for.?us|guest|form|directory|contribute/.test(intent);
        })
        .map((p) => String(p.url ?? ''))
        .filter(Boolean),
      divertedUrl: meta.divertedUrl ? String(meta.divertedUrl) : null,
      metaEntryUrl: meta.entryUrl ? String(meta.entryUrl) : null,
    },
  });

  const entryUrl = resolved.formUrl;
  let html = resolved.html;
  let pagesChecked = [...resolved.pagesChecked];
  let discoverySource = resolved.source;

  // Phase 14 — walk multi-step wizards to the real content form (Playwright, max 4 steps)
  let wizardReachedForm = false;
  let wizardSteps: string[] | undefined;
  let wizardWalkStatus: SiteRecipe['wizardWalkStatus'] = null;
  let wizardLabel: string | null = null;

  const step1NeedsWalk =
    Boolean(html) &&
    !htmlHasCoreContentFields(html!) &&
    (isIntermediateWizardStep(html!) ||
      pageLooksLikeMultiStepWizard(html!) ||
      detectMultiStepForm(html!));

  if (step1NeedsWalk && entryUrl) {
    logger.info(
      { domain, entryUrl },
      'assisted-manual Phase 14 wizard walk starting'
    );
    const walk = await walkSubmissionWizard({ entryUrl });
    wizardWalkStatus = walk.status;
    wizardSteps = walk.stepsTaken.length ? walk.stepsTaken : undefined;
    wizardLabel = walk.label;
    pagesChecked = [...pagesChecked, ...walk.pagesCrawled];
    logger.info(
      {
        domain,
        entryUrl,
        status: walk.status,
        stepsWalked: walk.stepsWalked,
        stepsTaken: walk.stepsTaken,
        stepLog: walk.stepLog,
        pagesCrawled: walk.pagesCrawled,
        finalUrl: walk.finalUrl,
      },
      'assisted-manual Phase 14 wizard walk finished'
    );

    if (walk.status === 'reached_form' && walk.html && htmlHasCoreContentFields(walk.html)) {
      html = walk.html;
      wizardReachedForm = true;
      if (walk.finalUrl) {
        // Prefer deepest URL if the wizard changed location
        // (often still the same entry URL for SPA wizards)
      }
    } else if (walk.status === 'paid_only') {
      wizardLabel = walk.label ?? WIZARD_PAID_ONLY_LABEL;
    } else if (walk.status === 'could_not_reach' || walk.status === 'error') {
      wizardLabel = walk.label ?? WIZARD_COULD_NOT_REACH_LABEL;
    }
  }

  const targetRead = html
    ? extractTargetFormFieldFacts(html)
    : {
        fields: [] as ReturnType<typeof extractFormFieldFacts>,
        formFound: false,
        failureReason:
          resolved.discoveryFailureReason ||
          'No HTML fetched — HTTP blocked and browser fallback returned empty',
        targetFormSelector: null,
        targetFormIndex: null,
        targetFormAction: null,
        targetFormHtml: null,
        humanSteps: [] as string[],
        gateHtml: '',
      };
  const liveFacts = targetRead.fields;
  const multiStepPage = Boolean(html && detectMultiStepForm(html));
  // Live Form Reader wins: if the page has fillable fields (incl. category-only step 1),
  // treat as found even when discovery previously under-scored the page.
  // After a successful wizard walk, content fields count as a real form.
  const formFound = Boolean(
    html &&
      ((wizardReachedForm && liveFacts.length > 0) ||
        (targetRead.formFound &&
          liveFacts.length > 0 &&
          (resolved.formFound || multiStepPage || discoveryAcceptsFormPage(html))))
  );
  const discoveryFailureReason =
    wizardLabel && !wizardReachedForm
      ? wizardLabel
      : targetRead.failureReason || resolved.discoveryFailureReason;

  logger.info(
    {
      domain,
      importedEntryUrl,
      formUrl: entryUrl,
      discoverySource,
      pagesCrawled: pagesChecked.length,
      pagesChecked,
      formFound,
      multiStepPage,
      wizardReachedForm,
      wizardWalkStatus,
      wizardSteps,
      discoveryFormFound: resolved.formFound,
      liveFieldCount: liveFacts.length,
      htmlBytes: html?.length ?? 0,
      forceReclassify,
      packageVersionStale,
      noHtmlPrior,
    },
    'assisted-manual form URL resolved'
  );

  // Log raw facts as received by inferFieldRole (compare to unit-test inputs)
  if (liveFacts.length || opts.forceReread) {
    logger.info(
      {
        domain,
        entryUrl,
        htmlBytes: html?.length ?? 0,
        facts: liveFacts.map((f) => fieldFactSnapshot(f)),
      },
      'assisted-manual field facts before classify'
    );
  }

  let recipe: SiteRecipe;
  let rereadFailed = false;
  let rereadFailReason: string | null = null;

  if (html && formFound) {
    recipe = buildSiteRecipe({
      domain,
      entryUrl: importedEntryUrl,
      resolvedFormUrl: entryUrl,
      formDiscoveryPagesChecked: pagesChecked,
      formDiscoverySource: discoverySource,
      html,
      existing: existingForBuild,
      forceReclassify: true,
      dropHumanPins: Boolean(opts.clearPins),
      wizardReachedForm,
      wizardSteps,
      wizardWalkStatus,
      multiStepLabelOverride: wizardReachedForm
        ? formatWizardStepSequence(wizardSteps ?? []) || wizardLabel
        : wizardLabel,
    });
  } else if (existingRecipe && !forceReclassify && recipeVersionsCurrent(existingRecipe)) {
    // Only reuse a cached recipe when versions are current AND we were not asked to refresh
    recipe = existingRecipe;
  } else {
    // Force re-read / version bump / first prepare with no usable form HTML
    rereadFailed = Boolean(opts.forceReread) || forceReclassify || priorFieldCount > 0;
    rereadFailReason = !html
      ? discoveryFailureReason ??
        'No HTML fetched — HTTP blocked and browser fallback returned empty'
      : discoveryFailureReason ??
        'Re-read failed — no form fields found in page HTML; previous fields kept';

    if (existingRecipe && existingRecipe.fields.length > 0) {
      // Guard: never wipe a populated recipe with an empty read.
      // Keep PRIOR version stamps so prepare-all still sees "behind" and retries.
      recipe = {
        ...existingRecipe,
        notes: [existingRecipe.notes, rereadFailReason].filter(Boolean).join(' · '),
        lastVerifiedAt: new Date().toISOString(),
        formDiscoveryPagesChecked: pagesChecked,
        formDiscoverySource: discoverySource,
        multiStep: true,
        multiStepLabel: wizardLabel ?? existingRecipe.multiStepLabel ?? MULTI_STEP_FORM_LABEL,
        wizardReachedForm: false,
        wizardSteps,
        wizardWalkStatus,
        // Do NOT bump reader/classifier here — only successful live reads stamp current.
      };
    } else if (priorPayload?.fields?.length) {
      recipe = {
        domain,
        entryUrl: importedEntryUrl,
        resolvedFormUrl: priorPayload.resolvedFormUrl ?? entryUrl,
        formDiscoveryPagesChecked: pagesChecked,
        formDiscoverySource: discoverySource,
        formFingerprint: String(priorPackage?.form_fingerprint ?? 'fp_prior'),
        fields: priorPayload.fields.map((f) => ({
          selector: f.selector,
          role: f.role,
          maxlength: f.maxlength,
          required: Boolean(f.required),
          confidence: f.confidence,
          source: f.source,
          label: f.label,
          options: f.options,
        })),
        dropdownOptions: {},
        gate: (priorPayload.gate as SiteRecipe['gate']) ?? 'none',
        notes: rereadFailReason,
        lastVerifiedAt: new Date().toISOString(),
        correctionCount: Number(priorPackage?.correction_count ?? 0),
        multiStep: Boolean(priorPayload.multiStep) || Boolean(wizardLabel),
        multiStepLabel: wizardLabel ?? priorPayload.multiStepLabel ?? undefined,
        wizardReachedForm: false,
        wizardSteps,
        wizardWalkStatus,
        readerVersion: Number(priorPayload.readerVersion) || 0,
        classifierVersion: Number(priorPayload.classifierVersion) || 0,
      };
    } else {
      recipe = {
        domain,
        entryUrl: importedEntryUrl,
        resolvedFormUrl: entryUrl,
        formDiscoveryPagesChecked: pagesChecked,
        formDiscoverySource: discoverySource,
        formFingerprint: 'fp_missing',
        fields: [],
        dropdownOptions: {},
        gate: wizardWalkStatus === 'paid_only' ? 'manual_review' : 'multi_step',
        notes:
          wizardLabel ??
          rereadFailReason ??
          discoveryFailureReason ??
          (opts.forceReread
            ? 'Force re-read failed — no form HTML fetched'
            : 'No HTML fetched'),
        lastVerifiedAt: new Date().toISOString(),
        correctionCount: 0,
        multiStep: true,
        multiStepLabel: wizardLabel ?? MULTI_STEP_FORM_LABEL,
        wizardReachedForm: false,
        wizardSteps,
        wizardWalkStatus,
        // Explicit 0 — never leave undefined (buildAssistedPackage must not default to current)
        readerVersion: 0,
        classifierVersion: 0,
      };
    }
  }

  // Only stamp current versions when we actually got a live form read
  if (html && formFound && !rereadFailed) {
    recipe = {
      ...recipe,
      readerVersion: ASSISTED_FORM_READER_VERSION,
      classifierVersion: ASSISTED_FIELD_CLASSIFIER_VERSION,
    };
  }

  // Final empty-guard: if somehow still empty but prior had fields, restore
  if (recipe.fields.length === 0 && priorFieldCount > 0) {
    rereadFailed = true;
    rereadFailReason =
      rereadFailReason ??
      discoveryFailureReason ??
      'Re-read failed — empty field list; previous fields kept';
    if (existingRecipe && existingRecipe.fields.length > 0) {
      recipe = {
        ...existingRecipe,
        notes: [existingRecipe.notes, rereadFailReason].filter(Boolean).join(' · '),
        lastVerifiedAt: new Date().toISOString(),
        formDiscoveryPagesChecked: pagesChecked,
        formDiscoverySource: discoverySource,
      };
    } else if (priorPayload?.fields?.length) {
      // Reconstruct minimal recipe from prior package fields
      recipe = {
        domain,
        entryUrl: importedEntryUrl,
        resolvedFormUrl: priorPayload.resolvedFormUrl ?? entryUrl,
        formDiscoveryPagesChecked: pagesChecked,
        formDiscoverySource: discoverySource,
        formFingerprint: String(priorPackage?.form_fingerprint ?? 'fp_prior'),
        fields: priorPayload.fields.map((f) => ({
          selector: f.selector,
          role: f.role,
          maxlength: f.maxlength,
          required: Boolean(f.required),
          confidence: f.confidence,
          source: f.source,
          label: f.label,
          options: f.options,
        })),
        dropdownOptions: {},
        gate: (priorPayload.gate as SiteRecipe['gate']) ?? 'none',
        notes: rereadFailReason,
        lastVerifiedAt: new Date().toISOString(),
        correctionCount: Number(priorPackage?.correction_count ?? 0),
        multiStep: Boolean(priorPayload.multiStep),
        readerVersion: Number(priorPayload.readerVersion) || 0,
        classifierVersion: Number(priorPayload.classifierVersion) || 0,
      };
    }
  }

  // Failed live read must never look "current" (fake stamps skipped the next prepare)
  if (!(html && formFound && !rereadFailed)) {
    const rv = Number(recipe.readerVersion) || 0;
    const cv = Number(recipe.classifierVersion) || 0;
    recipe = {
      ...recipe,
      readerVersion:
        rv === ASSISTED_FORM_READER_VERSION && !formFound ? 0 : rv,
      classifierVersion:
        cv === ASSISTED_FIELD_CLASSIFIER_VERSION && !formFound ? 0 : cv,
    };
  }

  await upsertRecipeOnProfile(workspaceId, domain, recipe);

  const content = await loadContentForOpportunity(workspaceId, opportunityId);
  const preparedAt = new Date().toISOString();
  const expiresAt = new Date(
    Date.now() + ASSISTED_PACKAGE_TTL_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  let payload = buildAssistedPackage({
    recipe,
    content,
    preparedAt,
    fingerprintStatus: 'fresh',
    formFound: formFound || recipe.fields.length > 0,
    discoveryFailureReason:
      !formFound && recipe.fields.length === 0 ? discoveryFailureReason : null,
  });

  // Prefer the resolved form URL for Open package (falls back inside buildAssistedPackage)
  payload.entryUrl = recipe.resolvedFormUrl || entryUrl;
  payload.importedEntryUrl =
    importedEntryUrl !== payload.entryUrl ? importedEntryUrl : null;
  payload.resolvedFormUrl = recipe.resolvedFormUrl ?? entryUrl;
  payload.formDiscoveryPagesChecked = pagesChecked;
  payload.formDiscoverySource = discoverySource;
  payload.wizardReachedForm = recipe.wizardReachedForm;
  payload.wizardSteps = recipe.wizardSteps;
  payload.wizardWalkStatus = recipe.wizardWalkStatus ?? null;

  if (html && formFound && !rereadFailed) {
    payload.readerVersion = ASSISTED_FORM_READER_VERSION;
    payload.classifierVersion = ASSISTED_FIELD_CLASSIFIER_VERSION;
  } else {
    // Failed / empty read — never pretend we are on current reader/classifier
    const keepReader = Number(priorPayload?.readerVersion) || Number(recipe.readerVersion) || 0;
    const keepClass =
      Number(priorPayload?.classifierVersion) || Number(recipe.classifierVersion) || 0;
    payload.readerVersion =
      keepReader === ASSISTED_FORM_READER_VERSION && !formFound ? 0 : keepReader;
    payload.classifierVersion =
      keepClass === ASSISTED_FIELD_CLASSIFIER_VERSION && !formFound ? 0 : keepClass;
    if (!formFound) {
      const hasPaste = (payload.pasteReadyContent?.length ?? 0) > 0;
      const isMulti =
        Boolean(payload.multiStep) ||
        multiStepPage ||
        detectMultiStepForm(html ?? '') ||
        Boolean(payload.multiStepLabel);
      if (wizardReachedForm && payload.fields.length > 0) {
        // Walk succeeded but formFound flag flipped later — keep populated package
        payload.formUnavailable = false;
        payload.wizardReachedForm = true;
      } else if (isMulti || hasPaste || recipe.fields.length > 0) {
        // Multi-step / sparse / content-ready — never mislabel as JS/login unavailable
        payload.formUnavailable = false;
        payload.bucket = 'needs_person';
        payload.multiStep = payload.multiStep || isMulti;
        payload.multiStepLabel =
          payload.multiStepLabel ??
          wizardLabel ??
          (isMulti ? MULTI_STEP_FORM_LABEL : null);
        payload.failureReason =
          payload.multiStepLabel ??
          (hasPaste
            ? 'Needs a person — content ready to paste on the site'
            : rereadFailReason ?? discoveryFailureReason ?? payload.failureReason);
        payload.gateNotes = payload.multiStepLabel ?? payload.gateNotes;
      } else {
        payload.formUnavailable = true;
        payload.failureReason = formUnavailableMessage(
          rereadFailReason ?? discoveryFailureReason ?? payload.failureReason
        );
        payload.bucket = 'needs_person';
      }
    }
    if (rereadFailed && priorPayload) {
      if (!formFound && payload.formUnavailable) {
        payload.formUnavailable = true;
        payload.failureReason = formUnavailableMessage(
          rereadFailReason ?? payload.failureReason
        );
      } else if (!formFound) {
        // keep multi-step / paste-ready messaging above
        payload.failureReason = payload.failureReason ?? rereadFailReason;
      } else {
        payload.failureReason = rereadFailReason ?? payload.failureReason;
      }
      payload.bucket = 'needs_person';
      // Prefer prior field values if rebuild emptied them — never resurrect cleared pins
      if (!payload.fields.length && priorPayload.fields?.length) {
        const kept = opts.clearPins
          ? priorPayload.fields.map((f) =>
              f.source === 'human_corrected' || f.source === 'known_bad'
                ? { ...f, source: 'name_guess' as const, confidence: 'low' as const }
                : f
            )
          : priorPayload.fields;
        payload = {
          ...payload,
          fields: kept,
          bucket: 'needs_person',
          failureReason: payload.failureReason,
          formUnavailable: payload.formUnavailable,
          readerVersion: payload.readerVersion,
          classifierVersion: payload.classifierVersion,
        };
      }
    }
  }

  if (payload.fields.some((f) => f.overLimit)) {
    payload.bucket = 'needs_person';
    payload.failureReason =
      payload.failureReason ??
      'Content exceeds known character limit — regenerate or edit';
  }

  const row = {
    workspace_id: workspaceId,
    opportunity_id: opportunityId,
    domain,
    entry_url: entryUrl,
    form_fingerprint: recipe.formFingerprint,
    prepared_at: preparedAt,
    expires_at: expiresAt,
    bucket: payload.bucket,
    status: payload.status,
    gate: payload.gate,
    fingerprint_status: payload.fingerprintStatus,
    payload,
    correction_count: recipe.correctionCount,
    pilot_batch_id: PILOT_BATCH,
    failure_reason: payload.failureReason,
    updated_at: new Date().toISOString(),
  };

  let saved: Record<string, unknown>;
  if (opts.packageId) {
    const { data, error } = await admin()
      .from('assisted_packages')
      .update(row)
      .eq('workspace_id', workspaceId)
      .eq('id', opts.packageId)
      .select('*')
      .single();
    if (error) throw new AppError(500, 'INTERNAL_ERROR', error.message);
    saved = data;
  } else {
    const { data, error } = await admin()
      .from('assisted_packages')
      .upsert(row, { onConflict: 'workspace_id,opportunity_id' })
      .select('*')
      .single();
    if (error) throw new AppError(500, 'INTERNAL_ERROR', error.message);
    saved = data;
  }

  await admin()
    .from('opportunities')
    .update({ assisted_package_id: saved.id })
    .eq('id', opportunityId);

  logger.info(
    {
      workspaceId,
      opportunityId,
      domain,
      packageId: saved.id,
      forceReread: Boolean(opts.forceReread),
      forceReclassify,
      rereadFailed,
      htmlBytes: html?.length ?? 0,
      liveFactCount: liveFacts.length,
      fieldCount: recipe.fields.length,
      readerVersion: payload.readerVersion ?? null,
      classifierVersion: payload.classifierVersion ?? null,
      fieldRoles: recipe.fields.map((f) => `${f.selector}:${f.role}:${f.source}`),
      bucket: payload.bucket,
      failureReason: payload.failureReason,
    },
    'assisted-manual package prepared'
  );

  return saved;
}

async function enforceSimilarity(workspaceId: string) {
  const { data: rows } = await admin()
    .from('assisted_packages')
    .select('id, payload, prepared_at')
    .eq('workspace_id', workspaceId)
    .eq('pilot_batch_id', PILOT_BATCH);
  if (!rows?.length) return;

  const texts = rows.map((r) => {
    const p = r.payload as AssistedPackagePayload;
    const desc =
      p.fields?.find((f) => f.role === 'long_desc')?.value ||
      p.fields?.find((f) => f.role === 'short_desc')?.value ||
      '';
    return { id: String(r.id), text: desc, preparedAt: String(r.prepared_at ?? '') };
  });

  const {
    findSimilarPackagePairs,
    maxPairwiseSimilarity,
    ASSISTED_SIMILARITY_THRESHOLD,
  } = await import('@seo-os/backlink-builder');

  const maxSim = maxPairwiseSimilarity(texts.map((t) => t.text));
  logger.info(
    {
      workspaceId,
      packageCount: texts.length,
      maxPairwiseSimilarity: Number(maxSim.toFixed(4)),
      threshold: ASSISTED_SIMILARITY_THRESHOLD,
      uniqueOk: maxSim < ASSISTED_SIMILARITY_THRESHOLD,
    },
    'Phase 12 assisted package content uniqueness'
  );

  const pairs = findSimilarPackagePairs(texts, ASSISTED_SIMILARITY_THRESHOLD);
  // Prefer marking the later-prepared package
  const byId = new Map(texts.map((t) => [t.id, t] as const));
  for (const pair of pairs) {
    const a = byId.get(pair.a);
    const b = byId.get(pair.b);
    const laterId =
      a && b && a.preparedAt <= b.preparedAt ? pair.b : pair.a;
    await admin()
      .from('assisted_packages')
      .update({
        bucket: 'needs_person',
        failure_reason: `content_too_similar — description too close to another package (similarity ${pair.score.toFixed(2)} ≥ ${ASSISTED_SIMILARITY_THRESHOLD})`,
        fingerprint_status: 'fresh',
        updated_at: new Date().toISOString(),
        metrics: {
          similarityPair: pair,
          maxPairwiseSimilarity: maxSim,
        },
      })
      .eq('id', laterId);
  }
}

export async function listAssistedPackages(workspaceId: string) {
  // When auto-publish is OFF, Automable content-ready sites must appear in Assisted Manual
  await healMissingAssistedPackages(workspaceId).catch((err) =>
    logger.warn({ err, workspaceId }, 'assisted heal-missing on list failed')
  );
  // Heal legacy Done packages that never wrote CSM Submitted / export rows
  await healAssistedDoneSubmissions(workspaceId).catch((err) =>
    logger.warn({ err, workspaceId }, 'assisted heal Done→Submitted failed')
  );
  await healReadyPackagesWithBlockingGates(workspaceId).catch((err) =>
    logger.warn({ err, workspaceId }, 'assisted heal gate→needs_person failed')
  );
  await healStripCategoryFromPackages(workspaceId).catch((err) =>
    logger.warn({ err, workspaceId }, 'assisted heal strip category fields failed')
  );

  const { data: rows } = await admin()
    .from('assisted_packages')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('prepared_at', { ascending: false });

  const packages = [];
  for (const row of rows ?? []) {
    // Skipped packages stay in DB but leave the Assisted Manual worklist
    if (String(row.status) === 'skipped') continue;
    // Terminal Done/Submitted packages keep their submission state — never re-bucket to stale Ban
    if (isAssistedSubmitted({ status: String(row.status), submitted_at: row.submitted_at as string | null })) {
      packages.push(formatPackageRow(row));
      continue;
    }
    const preparedAt = String(row.prepared_at);
    const status = evaluateFingerprintStatus({
      preparedAt,
      storedFingerprint: String(row.form_fingerprint),
      liveFingerprint: null,
    });
    let current = row;
    if (status === 'stale' && row.fingerprint_status !== 'stale') {
      const payload = {
        ...(row.payload as AssistedPackagePayload),
        fingerprintStatus: 'stale' as const,
        bucket: 'needs_person' as const,
        failureReason: 'Package expired — re-prepare',
      };
      const { data: updated } = await admin()
        .from('assisted_packages')
        .update({
          fingerprint_status: 'stale',
          bucket: 'needs_person',
          failure_reason: payload.failureReason,
          payload,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id)
        .select('*')
        .single();
      current = updated ?? row;
    }
    packages.push(formatPackageRow(current));
  }

  const board = await getManualSubmissionsBoard(workspaceId);
  const packageOppIds = new Set(packages.map((p) => String(p.opportunityId)));
  const manualWithPackage = (board.items ?? []).filter(
    (i): i is NonNullable<typeof i> => i != null && packageOppIds.has(i.id)
  ).length;

  const assistedCounts = computeAssistedLaneCounts({
    automatable: board.counts.automatable,
    manualTotal: board.counts.manual,
    assistedPackages: packages.map((p) => ({
      bucket: p.bucket as 'ready' | 'check_fields' | 'needs_person',
    })),
    manualWithPackage,
  });

  return {
    honesty: [
      'Does not submit anything automatically.',
      'Does not solve CAPTCHA / OTP / login — you clear those on the site.',
      'Does not guarantee the listing goes live.',
      'Multi-step forms: content is prepared for later steps — you navigate and paste.',
      'Does not attach images for you.',
    ],
    pilot: {
      max: ASSISTED_MANUAL_PILOT_MAX,
      used: packages.length,
      batchId: PILOT_BATCH,
      canAdd: true,
      note:
        'Every content-ready site gets an Assisted Manual package. Browser auto-submit is retired from the product flow.',
    },
    counts: assistedCounts,
    laneConservation: board.conservation,
    packages,
  };
}

async function refreshPackageFreshness(row: Record<string, unknown>) {
  const preparedAt = String(row.prepared_at);
  const storedFp = String(row.form_fingerprint);
  const entryUrl = String(row.entry_url);
  const payload = row.payload as AssistedPackagePayload;

  // TTL check without network
  let status = evaluateFingerprintStatus({
    preparedAt,
    storedFingerprint: storedFp,
    liveFingerprint: null,
  });

  // Re-fetch only when opening/listing if not already changed
  if (status === 'fresh') {
    const html = await fetchHtml(entryUrl);
    if (html) {
      const liveFp = buildSiteRecipe({
        domain: String(row.domain),
        entryUrl,
        html,
      }).formFingerprint;
      status = evaluateFingerprintStatus({
        preparedAt,
        storedFingerprint: storedFp,
        liveFingerprint: liveFp,
      });
    }
  }

  if (status !== row.fingerprint_status) {
    const nextPayload = {
      ...payload,
      fingerprintStatus: status,
      bucket:
        status === 'changed' || status === 'stale' ? 'needs_person' : payload.bucket,
      failureReason:
        status === 'changed'
          ? 'Form changed — re-prepare'
          : status === 'stale'
            ? 'Package expired — re-prepare'
            : payload.failureReason,
    };
    const { data: updated } = await admin()
      .from('assisted_packages')
      .update({
        fingerprint_status: status,
        bucket: nextPayload.bucket,
        failure_reason: nextPayload.failureReason,
        payload: nextPayload,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)
      .select('*')
      .single();
    return updated ?? row;
  }
  return row;
}

function formatPackageRow(row: Record<string, unknown>) {
  const payload = (row.payload as AssistedPackagePayload) ?? ({} as AssistedPackagePayload);
  // Coerce — JSONB can occasionally surface numeric strings; compare the same keys we stamp
  const readerVersion = Number(payload.readerVersion);
  const classifierVersion = Number(payload.classifierVersion);
  const formUnavailable = Boolean(payload.formUnavailable);
  const classifierOutdated =
    !formUnavailable &&
    (!Number.isFinite(classifierVersion) ||
      !Number.isFinite(readerVersion) ||
      classifierVersion !== ASSISTED_FIELD_CLASSIFIER_VERSION ||
      readerVersion !== ASSISTED_FORM_READER_VERSION);
  const base = {
    id: row.id,
    opportunityId: row.opportunity_id,
    domain: row.domain,
    entryUrl: row.entry_url,
    bucket: row.bucket != null ? String(row.bucket) : null,
    status: row.status != null ? String(row.status) : null,
    gate: row.gate != null ? String(row.gate) : null,
    fingerprintStatus: row.fingerprint_status != null ? String(row.fingerprint_status) : null,
    preparedAt: row.prepared_at,
    expiresAt: row.expires_at,
    correctionCount: row.correction_count,
    minutesSpent: row.minutes_spent,
    rejectedAtSubmit: row.rejected_at_submit,
    submittedAt: row.submitted_at != null ? String(row.submitted_at) : null,
    verifiedAt: row.verified_at != null ? String(row.verified_at) : null,
    userVerified: Boolean(row.user_verified),
    failureReason: row.failure_reason != null ? String(row.failure_reason) : null,
    pilotBatchId: row.pilot_batch_id,
    formUnavailable,
    classifierOutdated,
    readerVersion: Number.isFinite(readerVersion) ? readerVersion : null,
    classifierVersion: Number.isFinite(classifierVersion) ? classifierVersion : null,
    currentReaderVersion: ASSISTED_FORM_READER_VERSION,
    currentClassifierVersion: ASSISTED_FIELD_CLASSIFIER_VERSION,
    package: payload,
  };

  const fingerprintBlocked =
    String(row.fingerprint_status ?? '') === 'changed' ||
    String(row.fingerprint_status ?? '') === 'stale';
  const visual = resolveAssistedVisualStatus({
    status: base.status,
    submittedAt: base.submittedAt,
    verifiedAt: base.verifiedAt,
    userVerified: base.userVerified,
    failureReason: base.failureReason,
    bucket: base.bucket,
    gate: base.gate,
    formUnavailable,
    blocked: fingerprintBlocked && !isAssistedSubmitted(base),
    hasFieldIssues: false,
  });

  return {
    ...base,
    // Canonical row state — icon + badge must both read these
    visualStatus: visual.visualStatus,
    visualTone: visual.tone,
    badgeLabel: visual.badgeLabel,
    blocked: visual.blocked,
    needsHumanReview: visual.needsHumanReview,
    skipBrowserExecution: false,
    completedAt: visual.completedAt,
    blockReason: visual.blocked
      ? String(row.failure_reason ?? payload.failureReason ?? 'Re-prepare required')
      : null,
  };
}

export async function getAssistedPackage(workspaceId: string, packageId: string) {
  const { data: row } = await admin()
    .from('assisted_packages')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('id', packageId)
    .maybeSingle();
  if (!row) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Package not found');
  const refreshed = await refreshPackageFreshness(row);
  return formatPackageRow(refreshed);
}

/**
 * Force re-fetch HTML + re-classify (ignore fingerprint / TTL / cached recipe versions).
 * Confirmed human_corrected roles are preserved; known_bad fields re-infer.
 * Always stamps readerVersion / classifierVersion on the package payload.
 */
export async function rereadAssistedPackage(workspaceId: string, packageId: string) {
  const { data: row } = await admin()
    .from('assisted_packages')
    .select('id, opportunity_id, entry_url, domain')
    .eq('workspace_id', workspaceId)
    .eq('id', packageId)
    .maybeSingle();
  if (!row) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Package not found');

  const saved = await prepareOnePackage(workspaceId, String(row.opportunity_id), {
    entryUrlOverride: row.entry_url ? String(row.entry_url) : undefined,
    forceReread: true,
    packageId,
    domainOverride: row.domain ? String(row.domain) : undefined,
  });
  return formatPackageRow(saved);
}

export async function updateAssistedPackageStatus(
  workspaceId: string,
  packageId: string,
  body: {
    status?: PackageStatus;
    minutesSpent?: number;
    rejectedAtSubmit?: boolean;
    /** Optional Verified tick (email confirmation / listing live). */
    userVerified?: boolean;
  }
) {
  const { data: existing } = await admin()
    .from('assisted_packages')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('id', packageId)
    .maybeSingle();
  if (!existing) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Package not found');

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.status) patch.status = body.status;
  if (body.minutesSpent != null) patch.minutes_spent = body.minutesSpent;
  if (body.rejectedAtSubmit != null) patch.rejected_at_submit = body.rejectedAtSubmit;

  if (body.userVerified === true) {
    patch.user_verified = true;
    patch.verified_at = existing.verified_at ?? new Date().toISOString();
  } else if (body.userVerified === false) {
    patch.user_verified = false;
    patch.verified_at = null;
  }

  // Done is authoritative submission — stamp submitted_at on first Done
  if (body.status === 'done' && !existing.submitted_at) {
    patch.submitted_at = new Date().toISOString();
  }
  // Clear stale block metadata so list/icon stay green after refresh
  if (body.status === 'done') {
    patch.failure_reason = null;
    const payload = {
      ...((existing.payload as AssistedPackagePayload) ?? ({} as AssistedPackagePayload)),
      failureReason: null,
      formUnavailable: false,
    };
    patch.payload = payload;
  }

  const { data, error } = await admin()
    .from('assisted_packages')
    .update(patch)
    .eq('workspace_id', workspaceId)
    .eq('id', packageId)
    .select('*')
    .single();
  if (error) throw new AppError(500, 'INTERNAL_ERROR', error.message);

  if (body.status === 'done') {
    await recordAssistedManualSubmission(workspaceId, data, {
      minutesSpent:
        body.minutesSpent != null ? body.minutesSpent : Number(data.minutes_spent ?? 0) || null,
    });
  }

  if (body.userVerified === true) {
    await recordAssistedManualVerified(workspaceId, data);
  } else if (body.userVerified === false) {
    await clearAssistedManualVerified(workspaceId, data);
  }

  return formatPackageRow(data);
}

/**
 * Re-bucket packages whose gate disagrees with Ready / Needs a person rules:
 * - Hard blockers in Ready → needs_person
 * - OTP in Ready or Needs a person → check_fields (submittable + code warning)
 */
async function healReadyPackagesWithBlockingGates(workspaceId: string) {
  const { data: rows } = await admin()
    .from('assisted_packages')
    .select('id, gate, bucket, payload, failure_reason')
    .eq('workspace_id', workspaceId)
    .in('bucket', ['ready', 'needs_person'])
    .limit(100);
  if (!rows?.length) return;

  for (const row of rows) {
    const gate = String(row.gate ?? 'none');
    const bucket = String(row.bucket ?? '');
    let nextBucket: 'needs_person' | 'check_fields' | null = null;
    let failureReason: string | null = null;
    let gateNotes: string | null = null;

    if (gateIsOtp(gate) && (bucket === 'ready' || bucket === 'needs_person')) {
      nextBucket = 'check_fields';
      failureReason =
        gate === 'otp_phone'
          ? 'SMS confirmation code required after submit — keep your phone ready.'
          : 'Email confirmation code required after submit — check inbox before finishing.';
      gateNotes =
        gate === 'otp_phone'
          ? 'SMS code will be sent to the phone you enter — keep your phone ready.'
          : 'Email code will be sent to the address you enter — check inbox before submitting.';
    } else if (bucket === 'ready' && gateRequiresPerson(gate)) {
      nextBucket = 'needs_person';
      failureReason = `Gate: ${gate} — needs a person (not paste-and-submit Ready)`;
      gateNotes =
        gate === 'login'
          ? 'Login required — sign in yourself; the app will not bypass auth.'
          : gate === 'captcha'
            ? 'CAPTCHA present — clear it yourself; the app will not solve it.'
            : gate === 'cloudflare'
              ? 'Cloudflare / anti-bot challenge — clear it yourself; the app will not bypass it.'
              : gate === 'registration'
                ? 'Registration required — create an account yourself; the app will not sign up.'
                : `Gate: ${gate} — needs a person.`;
    }

    if (!nextBucket) continue;

    const payload = {
      ...((row.payload as AssistedPackagePayload) ?? ({} as AssistedPackagePayload)),
      bucket: nextBucket,
      failureReason: failureReason ?? row.failure_reason,
      ...(gateNotes ? { gateNotes } : {}),
    };
    await admin()
      .from('assisted_packages')
      .update({
        bucket: nextBucket,
        failure_reason: payload.failureReason,
        payload,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id);
    logger.info(
      { workspaceId, packageId: row.id, gate, from: bucket, to: nextBucket },
      'assisted heal: gate bucket correction'
    );
  }
}

/**
 * Strip category fields from all packages — never recommend, never block Ready.
 * Applies to legacy payloads that still carry category selects / flags.
 */
async function healStripCategoryFromPackages(workspaceId: string) {
  const { data: rows } = await admin()
    .from('assisted_packages')
    .select('id, payload, bucket, failure_reason')
    .eq('workspace_id', workspaceId)
    .neq('status', 'skipped')
    .limit(100);
  if (!rows?.length) return;

  for (const row of rows) {
    const payload = (row.payload as AssistedPackagePayload) ?? null;
    if (!payload?.fields) continue;
    const { payload: nextPayload, changed } = stripCategoryFromAssistedPayload(payload);
    if (!changed) continue;

    await admin()
      .from('assisted_packages')
      .update({
        payload: nextPayload,
        bucket: nextPayload.bucket,
        failure_reason:
          nextPayload.bucket === 'ready'
            ? null
            : nextPayload.failureReason ?? row.failure_reason ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id);
  }
}

/**
 * Authoritative Assisted Manual Done → CSM Submitted + submission row.
 * The app cannot observe the third-party site; the user's click is the record.
 */
async function healAssistedDoneSubmissions(workspaceId: string) {
  const { data: done } = await admin()
    .from('assisted_packages')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('status', 'done')
    .limit(50);
  if (!done?.length) return;

  for (const pkg of done) {
    const opportunityId = String(pkg.opportunity_id);
    const { data: opp } = await admin()
      .from('opportunities')
      .select('campaign_lifecycle')
      .eq('id', opportunityId)
      .maybeSingle();
    const life = String(opp?.campaign_lifecycle ?? '');
    if (life === 'Submitted' || life === 'Verified' || life === 'Completed') {
      // Still ensure submitted_at is stamped
      if (!pkg.submitted_at) {
        await admin()
          .from('assisted_packages')
          .update({
            submitted_at: pkg.updated_at ?? new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', pkg.id);
      }
      continue;
    }
    const stamped = {
      ...pkg,
      submitted_at: pkg.submitted_at ?? pkg.updated_at ?? new Date().toISOString(),
    };
    if (!pkg.submitted_at) {
      await admin()
        .from('assisted_packages')
        .update({ submitted_at: stamped.submitted_at, updated_at: new Date().toISOString() })
        .eq('id', pkg.id);
    }
    await recordAssistedManualSubmission(workspaceId, stamped, {
      minutesSpent: pkg.minutes_spent != null ? Number(pkg.minutes_spent) : null,
    });
  }
}

/**
 * Authoritative Assisted Manual Done → CSM Submitted + submission row.
 * The app cannot observe the third-party site; the user's click is the record.
 */
async function recordAssistedManualSubmission(
  workspaceId: string,
  pkg: Record<string, unknown>,
  opts: { minutesSpent?: number | null } = {}
) {
  const opportunityId = String(pkg.opportunity_id);
  const entryUrl = String(pkg.entry_url ?? '');
  const domain = String(pkg.domain ?? '');
  const submittedAt = String(pkg.submitted_at ?? new Date().toISOString());
  const minutes =
    opts.minutesSpent != null && Number.isFinite(Number(opts.minutesSpent))
      ? Number(opts.minutesSpent)
      : pkg.minutes_spent != null
        ? Number(pkg.minutes_spent)
        : null;
  const payload = (pkg.payload as AssistedPackagePayload) ?? ({} as AssistedPackagePayload);
  const contentSnapshot = (payload.fields ?? []).map((f) => ({
    label: f.label,
    role: f.role,
    value: f.value,
    selector: f.selector,
  }));

  // 1) CSM → Submitted (same terminal state as auto lane)
  try {
    const { updateCampaignItem } = await import('../campaigns/campaign-state.service.js');
    await updateCampaignItem(workspaceId, opportunityId, {
      currentStatus: 'Submitted',
      submissionStatus: 'Completed',
      force: true,
      lastError: null,
    });
  } catch (err) {
    logger.error({ err, opportunityId }, 'assisted Done: CSM Submitted write failed');
  }

  // 2) Opportunity metadata + automation_status
  try {
    const { data: opp } = await admin()
      .from('opportunities')
      .select('id, metadata')
      .eq('id', opportunityId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    const meta = (opp?.metadata as Record<string, unknown>) ?? {};
    await admin()
      .from('opportunities')
      .update({
        automation_status: 'submitted',
        metadata: {
          ...meta,
          submission: {
            ...(typeof meta.submission === 'object' && meta.submission
              ? (meta.submission as Record<string, unknown>)
              : {}),
            method: 'assisted_manual',
            submitted_at: submittedAt,
            entry_url: entryUrl,
            minutes_spent: minutes,
            package_id: pkg.id,
            content: contentSnapshot,
          },
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', opportunityId)
      .eq('workspace_id', workspaceId);
  } catch (err) {
    logger.warn({ err, opportunityId }, 'assisted Done: opportunity metadata write failed');
  }

  // 3) backlink_submissions row (reports / Track Results exports)
  try {
    const { data: existingSub } = await admin()
      .from('backlink_submissions')
      .select('id, metadata')
      .eq('workspace_id', workspaceId)
      .eq('opportunity_id', opportunityId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const subMeta = {
      method: 'assisted_manual',
      entry_url: entryUrl,
      domain,
      minutes_spent: minutes,
      package_id: pkg.id,
      content: contentSnapshot,
      user_verified: Boolean(pkg.user_verified),
      verified_at: pkg.verified_at ?? null,
    };

    if (existingSub?.id) {
      const prev = (existingSub.metadata as Record<string, unknown>) ?? {};
      await admin()
        .from('backlink_submissions')
        .update({
          status: 'submitted',
          tracking_status: 'submitted',
          queue_stage: 'submitted',
          submitted_at: submittedAt,
          notes: minutes != null ? `Assisted Manual · ${minutes} min` : 'Assisted Manual',
          metadata: { ...prev, ...subMeta },
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingSub.id);
    } else {
      const { randomUUID } = await import('node:crypto');
      await admin().from('backlink_submissions').insert({
        id: randomUUID(),
        workspace_id: workspaceId,
        opportunity_id: opportunityId,
        submission_type: 'assisted_manual',
        assisted_mode: 'manual',
        status: 'submitted',
        tracking_status: 'submitted',
        queue_stage: 'submitted',
        submitted_at: submittedAt,
        notes: minutes != null ? `Assisted Manual · ${minutes} min` : 'Assisted Manual',
        metadata: subMeta,
      });
    }
  } catch (err) {
    logger.warn({ err, opportunityId }, 'assisted Done: backlink_submissions write failed');
  }

  // 4) Promote any failed/stale BEE jobs so overlay cannot resurrect Failed
  try {
    const { data: jobs } = await admin()
      .from('execution_jobs')
      .select('id, status')
      .eq('workspace_id', workspaceId)
      .eq('opportunity_id', opportunityId);

    const terminal = new Set(['submitted', 'completed', 'verified', 'deleted', 'ignored']);
    for (const job of jobs ?? []) {
      if (terminal.has(String(job.status))) continue;
      const { setJobStatus } = await import('./bee.service.js');
      await setJobStatus(workspaceId, String(job.id), 'submitted', {
        finished_at: submittedAt,
        disposition: 'assisted_manual',
        truth_claim: 'assisted_manual_done',
      });
    }
  } catch (err) {
    logger.warn({ err, opportunityId }, 'assisted Done: job promote failed');
  }

  logger.info(
    { workspaceId, opportunityId, domain, entryUrl, minutes, packageId: pkg.id },
    'assisted-manual Done → CSM Submitted'
  );
}

async function recordAssistedManualVerified(
  workspaceId: string,
  pkg: Record<string, unknown>
) {
  const opportunityId = String(pkg.opportunity_id);
  const verifiedAt = String(pkg.verified_at ?? new Date().toISOString());

  try {
    const { updateCampaignItem } = await import('../campaigns/campaign-state.service.js');
    await updateCampaignItem(workspaceId, opportunityId, {
      currentStatus: 'Verified',
      verificationStatus: 'verified',
      force: true,
    });
  } catch (err) {
    logger.warn({ err, opportunityId }, 'assisted Verified: CSM write failed');
  }

  try {
    const { data: opp } = await admin()
      .from('opportunities')
      .select('metadata')
      .eq('id', opportunityId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    const meta = (opp?.metadata as Record<string, unknown>) ?? {};
    const prevSub =
      typeof meta.submission === 'object' && meta.submission
        ? (meta.submission as Record<string, unknown>)
        : {};
    await admin()
      .from('opportunities')
      .update({
        automation_status: 'verified',
        verification_status: 'verified',
        metadata: {
          ...meta,
          submission: { ...prevSub, user_verified: true, verified_at: verifiedAt },
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', opportunityId);
  } catch {
    /* best-effort */
  }

  try {
    await admin()
      .from('backlink_submissions')
      .update({
        status: 'accepted',
        tracking_status: 'verified',
        queue_stage: 'verified',
        verified_at: verifiedAt,
        updated_at: new Date().toISOString(),
      })
      .eq('workspace_id', workspaceId)
      .eq('opportunity_id', opportunityId);
  } catch {
    /* best-effort */
  }
}

async function clearAssistedManualVerified(
  workspaceId: string,
  pkg: Record<string, unknown>
) {
  const opportunityId = String(pkg.opportunity_id);
  // Drop back to Submitted (still submitted; just unverified)
  try {
    const { updateCampaignItem } = await import('../campaigns/campaign-state.service.js');
    await updateCampaignItem(workspaceId, opportunityId, {
      currentStatus: 'Submitted',
      verificationStatus: 'pending',
      force: true,
    });
  } catch {
    /* best-effort */
  }
  try {
    await admin()
      .from('backlink_submissions')
      .update({
        status: 'submitted',
        tracking_status: 'submitted',
        verified_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('workspace_id', workspaceId)
      .eq('opportunity_id', opportunityId);
  } catch {
    /* best-effort */
  }
}

export async function correctAssistedField(
  workspaceId: string,
  packageId: string,
  body: { selector: string; role?: FieldRole; markPackageGood?: boolean }
) {
  const { data: row } = await admin()
    .from('assisted_packages')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('id', packageId)
    .maybeSingle();
  if (!row) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Package not found');

  const domain = String(row.domain);
  const { data: profile } = await admin()
    .from('site_profiles')
    .select('id, recipe')
    .eq('workspace_id', workspaceId)
    .eq('domain', domain)
    .maybeSingle();

  let recipe = asRecipe(profile?.recipe);
  if (!recipe) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Site recipe missing — re-prepare first');
  }

  if (body.markPackageGood) {
    recipe = {
      ...recipe,
      correctionCount: recipe.correctionCount,
      lastVerifiedAt: new Date().toISOString(),
      notes: [recipe.notes, 'Package marked good'].filter(Boolean).join(' · '),
    };
  } else if (body.role) {
    // Only pin when the user supplies a real replacement role
    recipe = applyHumanFieldCorrection(recipe, {
      selector: body.selector,
      role: body.role,
    });
  } else {
    // Mark wrong → known-bad, re-infer on next read (do not freeze as human_corrected)
    recipe = markFieldMappingWrong(recipe, body.selector);
  }

  await upsertRecipeOnProfile(workspaceId, domain, recipe);

  // Re-build package values with corrected recipe (no re-fetch required)
  const content = await loadContentForOpportunity(workspaceId, String(row.opportunity_id));
  const payload = buildAssistedPackage({
    recipe,
    content,
    preparedAt: String(row.prepared_at),
    fingerprintStatus: row.fingerprint_status as 'fresh' | 'stale' | 'changed',
    formFound: true,
    status: row.status as PackageStatus,
  });

  const { data: updated, error } = await admin()
    .from('assisted_packages')
    .update({
      payload,
      bucket: payload.bucket,
      correction_count: recipe.correctionCount,
      failure_reason: payload.failureReason,
      updated_at: new Date().toISOString(),
    })
    .eq('id', packageId)
    .select('*')
    .single();
  if (error) throw new AppError(500, 'INTERNAL_ERROR', error.message);

  return formatPackageRow(updated);
}

/**
 * Undo all human pins / known-bad flags for this site, then force re-read so fields re-infer.
 * Does not wipe fields if the live form read fails — previous mapping is kept.
 */
export async function clearAssistedCorrections(workspaceId: string, packageId: string) {
  const { data: row } = await admin()
    .from('assisted_packages')
    .select('id, domain, opportunity_id, entry_url')
    .eq('workspace_id', workspaceId)
    .eq('id', packageId)
    .maybeSingle();
  if (!row) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Package not found');

  const domain = normalizeSiteDomain(String(row.domain));

  const saved = await prepareOnePackage(workspaceId, String(row.opportunity_id), {
    entryUrlOverride: row.entry_url ? String(row.entry_url) : undefined,
    forceReread: true,
    packageId,
    domainOverride: domain,
    clearPins: true,
  });
  return formatPackageRow(saved);
}

/**
 * Phase 8 — one-click "report bad package".
 * Captures live HTML + inferred roles into assisted_fixture_reports so a new site
 * type becomes a regression fixture instead of a live debug session.
 */
export async function reportBadAssistedPackage(
  workspaceId: string,
  packageId: string,
  opts: { note?: string; reportedBy?: string | null } = {}
) {
  const { data: row } = await admin()
    .from('assisted_packages')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('id', packageId)
    .maybeSingle();
  if (!row) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Package not found');

  const domain = normalizeSiteDomain(String(row.domain));
  const entryUrl = String(row.entry_url ?? '');
  const payload = (row.payload as AssistedPackagePayload) ?? ({} as AssistedPackagePayload);

  const html = (await fetchHtml(entryUrl)) ?? '';
  if (!html) {
    throw new AppError(
      503,
      'SERVICE_UNAVAILABLE',
      'Could not fetch page HTML for the fixture report. Try again or paste the URL later.'
    );
  }

  const facts = extractFormFieldFacts(html);
  const inferredFields = (payload.fields ?? []).map((f) => ({
    selector: f.selector,
    label: f.label,
    role: f.role,
    confidence: f.confidence,
    flagged: Boolean(f.flagged),
    flagReason: f.flagReason ?? null,
    source: f.source ?? null,
    valuePreview: String(f.value ?? '').slice(0, 120),
  }));

  const slugBase =
    domain
      .replace(/^www\./, '')
      .replace(/\./g, '-')
      .replace(/[^a-z0-9-]/gi, '')
      .toLowerCase()
      .slice(0, 48) || 'site';
  const fixtureId = `${slugBase}-${String(row.id).slice(0, 8)}`;

  const fixtureDraft = {
    id: fixtureId,
    domain,
    entryUrl,
    gate: String(row.gate ?? payload.gate ?? 'none'),
    bucket: String(row.bucket ?? 'check_fields'),
    fields: (payload.fields ?? []).map((f) => {
      const idMatch = f.selector.match(/#([A-Za-z][\w:-]*)/);
      const nameMatch = f.selector.match(/name="([^"]+)"/);
      const match: Record<string, string> = {};
      if (idMatch?.[1]) match.id = idMatch[1];
      else if (nameMatch?.[1]) match.name = nameMatch[1];
      else if (f.label) match.labelIncludes = String(f.label).slice(0, 40);
      return { match, role: f.role };
    }),
    notes: opts.note?.trim() || 'User-reported bad package — review roles before accepting.',
  };

  const inferred = {
    gate: row.gate,
    bucket: row.bucket,
    readerVersion: payload.readerVersion ?? null,
    classifierVersion: payload.classifierVersion ?? null,
    confidenceSummary: payload.confidenceSummary ?? null,
    fieldCount: facts.length,
    fields: inferredFields,
    recipeFields: Array.isArray(payload.fields) ? payload.fields.length : 0,
  };

  const { data: report, error } = await admin()
    .from('assisted_fixture_reports')
    .insert({
      workspace_id: workspaceId,
      package_id: packageId,
      opportunity_id: row.opportunity_id,
      domain,
      entry_url: entryUrl,
      gate: row.gate,
      bucket: row.bucket,
      note: opts.note?.trim() || null,
      html: html.slice(0, 500_000),
      inferred,
      fixture_draft: fixtureDraft,
      reported_by: opts.reportedBy ?? null,
      status: 'open',
    })
    .select('id, domain, entry_url, status, created_at, fixture_draft')
    .single();

  if (error) throw new AppError(500, 'INTERNAL_ERROR', error.message);

  logger.info(
    { workspaceId, packageId, reportId: report.id, domain },
    'assisted-manual: bad package reported as fixture candidate'
  );

  return {
    reportId: report.id,
    domain: report.domain,
    entryUrl: report.entry_url,
    status: report.status,
    createdAt: report.created_at,
    fixtureDraft: report.fixture_draft,
    message:
      'Saved HTML + inferred roles. Export with scripts/export-assisted-fixture-reports.mjs to add to the regression suite.',
  };
}

export async function getAssistedPilotMetrics(workspaceId: string) {
  const { data: rows } = await admin()
    .from('assisted_packages')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('pilot_batch_id', PILOT_BATCH);

  const list = rows ?? [];
  const withMinutes = list.filter((r) => r.minutes_spent != null);
  const minutes = withMinutes.map((r) => Number(r.minutes_spent)).sort((a, b) => a - b);
  const median =
    minutes.length === 0
      ? null
      : minutes.length % 2 === 1
        ? minutes[(minutes.length - 1) / 2]
        : (minutes[minutes.length / 2 - 1]! + minutes[minutes.length / 2]!) / 2;

  const corrected = list.filter((r) => Number(r.correction_count) > 0).length;
  const ready = list.filter((r) => r.bucket === 'ready').length;
  const checkFields = list.filter((r) => r.bucket === 'check_fields').length;
  const needsPerson = list.filter((r) => r.bucket === 'needs_person').length;
  const rejected = list.filter((r) => r.rejected_at_submit === true).length;

  return {
    pilotMax: ASSISTED_MANUAL_PILOT_MAX,
    n: list.length,
    medianMinutesPerSite: median,
    targetMedianMinutes: 4,
    correctionRate: list.length ? corrected / list.length : null,
    targetCorrectionRate: 0.2,
    bucketMix: { ready, checkFields, needsPerson },
    rejectionRate: list.length ? rejected / list.length : null,
    learning: {
      note: 'Re-prepare the same 10 after corrections; correction rate must drop on second pass.',
      totalCorrections: list.reduce((s, r) => s + Number(r.correction_count ?? 0), 0),
    },
    goNoGo: {
      medianOk: median != null && median <= 4,
      correctionOk: list.length ? corrected / list.length <= 0.2 : false,
      learningPending: true,
    },
  };
}

/** Excel export for Assisted Manual packages (standalone team artifact). */
export async function exportAssistedPackagesWorkbook(workspaceId: string) {
  const ExcelJS = await import('exceljs');
  const board = await listAssistedPackages(workspaceId);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SEO OS Phase 7';
  const sheet = wb.addWorksheet('Assisted Manual');

  sheet.addRow([
    'Website',
    'Bucket',
    'Status',
    'Entry URL',
    'Submitted At',
    'Verified',
    'Verified At',
    'Minutes',
    'Gate',
    'Gate Notes',
    'Fingerprint',
    'Prepared At',
    'Field Label',
    'Role',
    'Value',
    'Chars',
    'Max',
    'Confidence',
    'Dropdown Recommendation',
    'Options',
    'Human Step',
    'Failure Reason',
    'Corrections',
  ]);

  for (const pkg of board.packages) {
    const fields = pkg.package?.fields?.length
      ? pkg.package.fields
      : [
          {
            label: '',
            role: '',
            value: '',
            charCount: 0,
            maxlength: null,
            confidence: '',
            recommendedOption: null,
            options: [],
            humanStep: null,
          },
        ];
    for (const f of fields) {
      sheet.addRow([
        pkg.domain,
        pkg.bucket,
        pkg.status,
        pkg.entryUrl,
        pkg.submittedAt ?? '',
        pkg.userVerified ? 'yes' : 'no',
        pkg.verifiedAt ?? '',
        pkg.minutesSpent ?? '',
        pkg.gate,
        pkg.package?.gateNotes ?? '',
        pkg.fingerprintStatus,
        pkg.preparedAt,
        f.label,
        f.role,
        f.value,
        f.charCount,
        f.maxlength ?? '',
        f.confidence,
        f.recommendedOption ?? '',
        (f.options ?? []).join(' | '),
        f.humanStep ?? '',
        pkg.failureReason ?? '',
        pkg.correctionCount,
      ]);
    }
  }

  const honesty = wb.addWorksheet('Honesty');
  honesty.addRow(['Phase 7 does NOT:']);
  for (const line of board.honesty) honesty.addRow([line]);

  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  return {
    body: buf,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    filename: 'assisted-manual-packages.xlsx',
  };
}

/** Lane + package summary for Import / Submit / Track / Health. */
export async function getAssistedLaneSummary(workspaceId: string) {
  const evidence = await loadLaneEvidenceForWorkspace(workspaceId);
  let automatable = 0;
  let manualTotal = 0;
  const manualIds = new Set<string>();
  for (const row of evidence) {
    const resolved = resolveItemLane(row);
    if (!resolved.inActiveCohort) continue;
    if (resolved.lane === 'auto') automatable++;
    else {
      manualTotal++;
      manualIds.add(row.id);
    }
  }

  const { data: pkgs } = await admin()
    .from('assisted_packages')
    .select('bucket, opportunity_id')
    .eq('workspace_id', workspaceId);

  const manualWithPackage = (pkgs ?? []).filter((p) =>
    manualIds.has(String(p.opportunity_id))
  ).length;

  return computeAssistedLaneCounts({
    automatable,
    manualTotal,
    assistedPackages: (pkgs ?? []).map((p) => ({
      bucket: p.bucket as 'ready' | 'check_fields' | 'needs_person',
    })),
    manualWithPackage,
  });
}

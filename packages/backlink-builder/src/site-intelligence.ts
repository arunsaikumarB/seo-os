/**
 * Site Intelligence Engine — pure pipeline over fetched pages (Phase 5).
 * Execution starts only after strategy.entryUrl is chosen with evidence.
 */
import { fingerprintSite, type SiteFingerprint } from './site-fingerprint.js';
import {
  SIE_CRAWL_DEFAULTS,
  buildPrioritizedFrontier,
  emptyNavigationGraph,
  extractInternalLinks,
  normalizeSiteDomain,
  type CrawlLink,
  type NavigationGraph,
} from './site-crawl.js';
import { classifyPageIntent, type ClassifiedPage } from './page-intent-detectors.js';
import { selectSubmissionStrategy, type StrategyPlan } from './site-strategy.js';
import { extractGuidelines, type SiteGuidelines } from './site-guidelines.js';
import {
  enrichWithWordPressIntelligence,
  emptyWordPressLearning,
  type WordPressKnowledge,
  type WordPressLearning,
} from './wordpress-intelligence.js';
import {
  enrichWithDirectoryIntelligence,
  emptyDirectoryLearning,
  type DirectoryKnowledge,
  type DirectoryLearning,
} from './directory-intelligence.js';

export type SiteProfileStatus =
  | 'pending'
  | 'profiling'
  | 'complete'
  | 'failed'
  | 'unsupported';

export type SiteLearning = {
  successfulPaths: Array<{
    entryUrl: string;
    strategy: string;
    at: string;
  }>;
  submissionUrls: string[];
  strategyStats: Record<
    string,
    { attempts: number; successes: number; successRate: number }
  >;
  platformConfirmed: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  /** Capability 1 */
  wordpress?: WordPressLearning;
  /** Capability 2 */
  directory?: DirectoryLearning;
};

export type FetchedPage = {
  url: string;
  html: string;
  title?: string | null;
  status: 'fetched' | 'failed';
  error?: string | null;
  depth: number;
};

export type SiteIntelligenceResult = {
  domain: string;
  fingerprint: SiteFingerprint;
  navigationGraph: NavigationGraph;
  pageClassifications: ClassifiedPage[];
  guidelines: SiteGuidelines | null;
  strategy: StrategyPlan;
  profileStatus: SiteProfileStatus;
  crawlStats: {
    pagesFetched: number;
    pagesFailed: number;
    maxPages: number;
    timeBudgetMs: number;
    elapsedMs: number;
    truncated: boolean;
  };
  /** Capability 1 — null when not WordPress */
  wordpress?: WordPressKnowledge | null;
  /** Capability 2 — null when not a directory */
  directory?: DirectoryKnowledge | null;
};

export function emptyLearning(): SiteLearning {
  return {
    successfulPaths: [],
    submissionUrls: [],
    strategyStats: {},
    platformConfirmed: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    wordpress: emptyWordPressLearning(),
    directory: emptyDirectoryLearning(),
  };
}

export function recordStrategyOutcome(
  learning: SiteLearning,
  params: {
    strategy: string;
    entryUrl: string | null;
    success: boolean;
    at?: string;
  }
): SiteLearning {
  const at = params.at ?? new Date().toISOString();
  const stats = { ...(learning.strategyStats ?? {}) };
  const prev = stats[params.strategy] ?? { attempts: 0, successes: 0, successRate: 0 };
  const attempts = prev.attempts + 1;
  const successes = prev.successes + (params.success ? 1 : 0);
  stats[params.strategy] = {
    attempts,
    successes,
    successRate: attempts > 0 ? Math.round((successes / attempts) * 1000) / 10 : 0,
  };
  const next: SiteLearning = {
    ...learning,
    strategyStats: stats,
    lastSuccessAt: params.success ? at : learning.lastSuccessAt,
    lastFailureAt: params.success ? learning.lastFailureAt : at,
  };
  if (params.success && params.entryUrl) {
    next.successfulPaths = [
      { entryUrl: params.entryUrl, strategy: params.strategy, at },
      ...learning.successfulPaths,
    ].slice(0, 20);
    if (!next.submissionUrls.includes(params.entryUrl)) {
      next.submissionUrls = [...next.submissionUrls, params.entryUrl].slice(0, 20);
    }
  }
  return next;
}

export const SIE_TTL_DAYS = 30;

export function profileExpiresAt(from = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + SIE_TTL_DAYS);
  return d.toISOString();
}

export function isProfileStale(expiresAt: string | null | undefined, now = Date.now()): boolean {
  if (!expiresAt) return true;
  return new Date(expiresAt).getTime() < now;
}

/**
 * Run SIE over an already-fetched page set (homepage first).
 * Used by worker after bounded crawl, and by unit tests with fixtures.
 */
export function analyzeFetchedSite(params: {
  homepageUrl: string;
  pages: FetchedPage[];
  elapsedMs?: number;
  maxPages?: number;
  timeBudgetMs?: number;
  truncated?: boolean;
  /** Optional business text for smart directory category matching */
  businessText?: string | null;
}): SiteIntelligenceResult {
  const domain = normalizeSiteDomain(params.homepageUrl);
  const homepage =
    params.pages.find((p) => p.status === 'fetched' && p.depth === 0) ??
    params.pages.find((p) => p.status === 'fetched');
  const fingerprint = fingerprintSite({
    html: homepage?.html ?? '',
    url: params.homepageUrl,
  });

  const graph: NavigationGraph = emptyNavigationGraph();
  const classifications: ClassifiedPage[] = [];

  for (const page of params.pages) {
    graph.nodes.push({
      url: page.url,
      status: page.status,
      depth: page.depth,
      title: page.title ?? null,
      error: page.error ?? null,
    });
    if (page.status !== 'fetched') continue;
    for (const link of extractInternalLinks(page.html, page.url, domain, page.depth)) {
      graph.edges.push({
        from: page.url,
        to: link.url,
        anchorText: link.anchorText,
      });
    }
    const classified = classifyPageIntent({
      html: page.html,
      url: page.url,
      title: page.title,
      platformHints: fingerprint.hints.submissionUrlPatterns,
    });
    classifications.push(classified);
  }

  let guidelines: SiteGuidelines | null = null;
  const guidelinesPage = classifications.find((c) => c.intent === 'Guest Post Guidelines');
  if (guidelinesPage) {
    const raw = params.pages.find((p) => p.url === guidelinesPage.url);
    if (raw?.html) {
      guidelines = extractGuidelines({
        html: raw.html,
        url: guidelinesPage.url,
        emailAddress: guidelinesPage.emailAddress,
      });
      // Strong hint: if guidelines say email, ensure Email Only classification exists
      if (guidelines.submissionMethod === 'email' && guidelines.emailAddress) {
        const hasEmail = classifications.some((c) => c.intent === 'Email Only');
        if (!hasEmail) {
          classifications.push({
            url: guidelinesPage.url,
            intent: 'Email Only',
            confidence: 0.8,
            detectorId: 'page_email_only',
            signals: guidelinesPage.signals,
            emailAddress: guidelines.emailAddress,
          });
        }
      }
    }
  }

  const strategy = selectSubmissionStrategy(classifications);
  let profileStatus: SiteProfileStatus = 'complete';
  if (strategy.chosen === 'Unsupported') profileStatus = 'unsupported';
  if (params.pages.every((p) => p.status === 'failed')) profileStatus = 'failed';

  const fetched = params.pages.filter((p) => p.status === 'fetched').length;
  const failed = params.pages.filter((p) => p.status === 'failed').length;

  // Capability 1 — enrich when WordPress (additive; does not redesign SIE)
  const wpEnriched = enrichWithWordPressIntelligence({
    fingerprint,
    pageClassifications: classifications,
    strategy,
    guidelines,
    pages: params.pages,
    homepageUrl: params.homepageUrl,
  });

  // Capability 2 — Directory Intelligence (additive; does not modify WP module)
  const dirEnriched = enrichWithDirectoryIntelligence({
    fingerprint: wpEnriched.fingerprint,
    pageClassifications: wpEnriched.pageClassifications,
    strategy: wpEnriched.strategy,
    pages: params.pages,
    homepageUrl: params.homepageUrl,
    businessText: params.businessText ?? null,
    // Soft-attach on WP blogs unless an explicit directory plugin is detected
    allowAlongsideWordPress: false,
  });

  const enriched = {
    fingerprint: dirEnriched.fingerprint,
    pageClassifications: dirEnriched.pageClassifications,
    // Soft-attach keeps WP strategy; full enrich replaces with directory strategy
    strategy: dirEnriched.strategy,
    guidelines: wpEnriched.guidelines,
    wordpress: wpEnriched.wordpress,
    directory: dirEnriched.directory,
  };

  let finalStatus = profileStatus;
  if (enriched.strategy.chosen === 'Unsupported') finalStatus = 'unsupported';
  if (enriched.strategy.payloadHints?.moveToOutreach) {
    finalStatus = 'complete';
  }
  if (enriched.strategy.payloadHints?.needsReview && enriched.strategy.payloadHints?.paidListing) {
    // Paid directory profile is complete but execution blocked pending review
    finalStatus = 'complete';
  }

  return {
    domain,
    fingerprint: enriched.fingerprint,
    navigationGraph: graph,
    pageClassifications: enriched.pageClassifications,
    guidelines: enriched.guidelines,
    strategy: enriched.strategy,
    profileStatus: finalStatus,
    crawlStats: {
      pagesFetched: fetched,
      pagesFailed: failed,
      maxPages: params.maxPages ?? SIE_CRAWL_DEFAULTS.maxPages,
      timeBudgetMs: params.timeBudgetMs ?? SIE_CRAWL_DEFAULTS.timeBudgetMs,
      elapsedMs: params.elapsedMs ?? 0,
      truncated: Boolean(params.truncated),
    },
    wordpress: enriched.wordpress,
    directory: enriched.directory,
  };
}

export function planCrawlFrontier(homepageUrl: string, homepageHtml: string): CrawlLink[] {
  const domain = normalizeSiteDomain(homepageUrl);
  const fp = fingerprintSite({ html: homepageHtml, url: homepageUrl });
  return buildPrioritizedFrontier({
    homepageUrl,
    homepageHtml,
    domain,
    maxPages: SIE_CRAWL_DEFAULTS.maxPages,
    maxDepth: SIE_CRAWL_DEFAULTS.maxDepth,
    platformHints: [
      ...fp.hints.submissionUrlPatterns,
      ...fp.hints.loginUrlPatterns,
    ],
  });
}

export {
  SIE_CRAWL_DEFAULTS,
  normalizeSiteDomain,
  fingerprintSite,
  classifyPageIntent,
  selectSubmissionStrategy,
  extractGuidelines,
};

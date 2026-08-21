/**
 * Bulk Link Probe — pure classification (no fetch, no submit).
 * Ranks imported URLs into Ready / Check / Blocked / Dead / No Form.
 */
import { evaluateDetectors, gateFromClaim, signalsFromTruthEvaluation } from './detector-registry.js';
import {
  FORM_DISCOVERY_DEFAULTS,
  extractSubmissionCandidateLinks,
  pageLooksLikeMultiStepWizard,
  scoreSubmissionFormPage,
  type FormPageScore,
} from './form-url-discovery.js';
import { htmlHasFormElement, looksLikeSpaShell } from './form-unavailable.js';
import { selectTargetForm } from './target-form.js';
import { resolveListingPricing, type ListingPricingKind } from './listing-pricing.js';
import {
  classifySubmissionType,
  type SubmissionType,
  type SubmissionTypeResult,
} from './submission-type.js';

export const LINK_PROBE_BANDS = [
  'ready',
  'check',
  'blocked',
  'dead',
  'no_form',
  'unprobed',
] as const;

export type LinkProbeBand = (typeof LINK_PROBE_BANDS)[number];

export type LinkProbeResult = {
  band: LinkProbeBand;
  /** 0–100 composite rank (higher = better for human submit) */
  score: number;
  alive: boolean;
  httpStatus: number | null;
  formFound: boolean;
  formUrl: string | null;
  formScore: number;
  fieldCount: number;
  hasUrl: boolean;
  hasTitle: boolean;
  hasDesc: boolean;
  hasEmail: boolean;
  multiStep: boolean;
  spaShell: boolean;
  gates: string[];
  reasons: string[];
  pagesChecked: number;
  probedAt: string;
  /** Free-word rule on form/payment HTML. */
  listingPricing: ListingPricingKind;
  submissionType: SubmissionType;
  submissionTypeConfidence: number;
  submissionTypeEvidence: string[];
};

export type ProbePageInput = {
  url: string;
  html: string | null;
  httpStatus: number | null;
  fetchError?: string | null;
};

const HARD_GATES = new Set(['captcha', 'cloudflare', 'login', 'signup', 'mfa']);

function emptyResult(partial: Partial<LinkProbeResult>): LinkProbeResult {
  return {
    band: 'unprobed',
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
    reasons: [],
    pagesChecked: 0,
    probedAt: new Date().toISOString(),
    listingPricing: 'unknown',
    submissionType: 'UNKNOWN',
    submissionTypeConfidence: 0,
    submissionTypeEvidence: [],
    ...partial,
  };
}

function submissionTypeFromHtml(url: string, html: string): SubmissionTypeResult {
  const pick = (re: RegExp, limit = 25): string[] => {
    const out: string[] = [];
    let m: RegExpExecArray | null;
    const r = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
    const slice = html.slice(0, 80_000);
    while ((m = r.exec(slice)) && out.length < limit) {
      const v = (m[1] ?? m[0]).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (v.length > 1 && v.length < 120) out.push(v);
    }
    return out;
  };
  const title =
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, '').trim() ?? '';
  const headings = pick(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i, 12);
  const labels = pick(/<label[^>]*>([\s\S]*?)<\/label>/i, 40);
  const fieldNames = pick(/\b(?:name|id)=["']([^"']+)["']/i, 40);
  const placeholders = pick(/placeholder=["']([^"']+)["']/i, 20);
  const buttons = [
    ...pick(/<button[^>]*>([\s\S]*?)<\/button>/i, 20),
    ...pick(/<input[^>]*type=["']submit["'][^>]*value=["']([^"']+)["']/i, 10),
  ];
  return classifySubmissionType({
    url,
    title,
    headings,
    labels,
    fieldNames,
    placeholders,
    buttons,
    visibleText: html.slice(0, 12_000).replace(/<[^>]+>/g, ' '),
  });
}

function classifyGates(html: string, url: string): string[] {
  const ev = evaluateDetectors({
    html,
    url,
    targetingSubmissionForm: true,
  });
  const signals = signalsFromTruthEvaluation(ev);
  const gates: string[] = [];
  const primary = gateFromClaim(ev.primary?.claim ?? null);
  if (primary) gates.push(primary);
  if (signals.captcha && !gates.includes('captcha') && !gates.includes('cloudflare')) {
    gates.push('captcha');
  }
  if (signals.loginForm && !gates.includes('login')) gates.push('login');
  if (signals.signupForm && !gates.includes('signup')) gates.push('signup');
  return [...new Set(gates)];
}

function scoreFromForm(page: FormPageScore, multiStep: boolean, gates: string[]): number {
  let score = Math.min(55, page.score * 3);
  if (page.hasUrl) score += 10;
  if (page.hasTitle) score += 8;
  if (page.hasDesc) score += 8;
  if (page.hasEmail) score += 6;
  if (page.fieldCount >= 4) score += 5;
  if (multiStep) score -= 25;
  for (const g of gates) {
    if (HARD_GATES.has(g)) score -= 40;
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Classify a single fetched page (entry or discovered form URL).
 */
export function classifyProbedPage(input: ProbePageInput): LinkProbeResult {
  const probedAt = new Date().toISOString();
  const status = input.httpStatus;
  const html = input.html;

  if (input.fetchError && !html) {
    return emptyResult({
      band: 'dead',
      alive: false,
      httpStatus: status,
      reasons: [input.fetchError],
      pagesChecked: 1,
      probedAt,
    });
  }

  if (status != null && status >= 400) {
    return emptyResult({
      band: 'dead',
      alive: false,
      httpStatus: status,
      reasons: [`HTTP ${status}`],
      pagesChecked: 1,
      probedAt,
    });
  }

  if (!html || !html.trim()) {
    return emptyResult({
      band: 'dead',
      alive: false,
      httpStatus: status,
      reasons: ['Empty response'],
      pagesChecked: 1,
      probedAt,
    });
  }

  const spaShell = looksLikeSpaShell(html);
  const hasFormEl = htmlHasFormElement(html);
  const pageScore = scoreSubmissionFormPage(html);
  const multiStep = pageLooksLikeMultiStepWizard(html);
  const gates = classifyGates(html, input.url);
  const hardGates = gates.filter((g) => HARD_GATES.has(g));
  const target = selectTargetForm(html, { minScore: 2 });
  const listingPricing = resolveListingPricing({ html });
  const submission = submissionTypeFromHtml(input.url, html);

  const formFound =
    Boolean(target.formFound) ||
    (!pageScore.ignorable && pageScore.score >= FORM_DISCOVERY_DEFAULTS.minFormScore) ||
    (hasFormEl && pageScore.fieldCount >= 2 && !pageScore.ignorable);

  if (spaShell && !hasFormEl && !formFound) {
    return emptyResult({
      band: 'no_form',
      alive: true,
      httpStatus: status,
      spaShell: true,
      formUrl: input.url,
      pagesChecked: 1,
      reasons: ['SPA shell without form HTML'],
      listingPricing,
      probedAt,
    });
  }

  if (!formFound) {
    return emptyResult({
      band: 'no_form',
      alive: true,
      httpStatus: status,
      spaShell,
      formUrl: input.url,
      formScore: pageScore.score,
      fieldCount: pageScore.fieldCount,
      hasUrl: pageScore.hasUrl,
      hasTitle: pageScore.hasTitle,
      hasDesc: pageScore.hasDesc,
      hasEmail: pageScore.hasEmail,
      multiStep,
      gates,
      pagesChecked: 1,
      reasons: [pageScore.reason || 'No submission form detected'],
      listingPricing,
      probedAt,
      submissionType: submission.submissionType,
      submissionTypeConfidence: submission.submissionTypeConfidence,
      submissionTypeEvidence: submission.submissionTypeEvidence,
    });
  }

  const composite = scoreFromForm(pageScore, multiStep, gates);
  const reasons: string[] = [];
  if (pageScore.reason) reasons.push(pageScore.reason);
  if (multiStep) reasons.push('multi_step');
  if (hardGates.length) reasons.push(`gates:${hardGates.join(',')}`);
  if (listingPricing === 'paid') reasons.push('paid_no_free_word');
  if (listingPricing === 'free') reasons.push('free_listing');
  if (submission.submissionType !== 'UNKNOWN') {
    reasons.push(`type:${submission.submissionType}`);
  }

  // Paid listings are never "ready" — park for Ranked Queue free filter
  const paidBand = listingPricing === 'paid';
  const typeFields = {
    submissionType: submission.submissionType,
    submissionTypeConfidence: submission.submissionTypeConfidence,
    submissionTypeEvidence: submission.submissionTypeEvidence,
  };

  if (hardGates.length) {
    return emptyResult({
      band: 'blocked',
      score: Math.min(composite, 35),
      alive: true,
      httpStatus: status,
      formFound: true,
      formUrl: input.url,
      formScore: pageScore.score,
      fieldCount: pageScore.fieldCount,
      hasUrl: pageScore.hasUrl,
      hasTitle: pageScore.hasTitle,
      hasDesc: pageScore.hasDesc,
      hasEmail: pageScore.hasEmail,
      multiStep,
      spaShell,
      gates,
      reasons,
      pagesChecked: 1,
      listingPricing,
      probedAt,
      ...typeFields,
    });
  }

  if (paidBand || multiStep || composite < 55 || !pageScore.hasUrl) {
    return emptyResult({
      band: paidBand ? 'check' : 'check',
      score: paidBand ? Math.min(composite, 40) : composite,
      alive: true,
      httpStatus: status,
      formFound: true,
      formUrl: input.url,
      formScore: pageScore.score,
      fieldCount: pageScore.fieldCount,
      hasUrl: pageScore.hasUrl,
      hasTitle: pageScore.hasTitle,
      hasDesc: pageScore.hasDesc,
      hasEmail: pageScore.hasEmail,
      multiStep,
      spaShell,
      gates,
      reasons: reasons.length
        ? reasons
        : paidBand
          ? ['Paid — no free word in form/payment']
          : ['Needs field / step review'],
      pagesChecked: 1,
      listingPricing,
      probedAt,
      ...typeFields,
    });
  }

  return emptyResult({
    band: 'ready',
    score: Math.max(composite, 70),
    alive: true,
    httpStatus: status,
    formFound: true,
    formUrl: input.url,
    formScore: pageScore.score,
    fieldCount: pageScore.fieldCount,
    hasUrl: pageScore.hasUrl,
    hasTitle: pageScore.hasTitle,
    hasDesc: pageScore.hasDesc,
    hasEmail: pageScore.hasEmail,
    multiStep: false,
    spaShell,
    gates,
    reasons: reasons.length ? reasons : ['Single-step form with fillable fields'],
    pagesChecked: 1,
    listingPricing,
    probedAt,
    ...typeFields,
  });
}

/**
 * Merge entry + candidate page probes — keep the best form page.
 */
export function mergeProbeResults(
  entry: LinkProbeResult,
  candidates: LinkProbeResult[]
): LinkProbeResult {
  const all = [entry, ...candidates].filter(Boolean);
  const pagesChecked = all.reduce((n, r) => n + (r.pagesChecked || 1), 0);

  const bandRank: Record<LinkProbeBand, number> = {
    ready: 5,
    check: 4,
    blocked: 3,
    no_form: 2,
    dead: 1,
    unprobed: 0,
  };

  let best = entry;
  for (const c of candidates) {
    if (bandRank[c.band] > bandRank[best.band]) best = c;
    else if (c.band === best.band && c.score > best.score) best = c;
  }

  // If entry is dead but a candidate worked, keep candidate
  if (entry.band === 'dead' && candidates.some((c) => c.alive && c.formFound)) {
    best = candidates.reduce((a, b) => (bandRank[b.band] > bandRank[a.band] ? b : a));
  }

  return {
    ...best,
    pagesChecked,
    probedAt: new Date().toISOString(),
    // Prefer free if any candidate found free; else keep best's pricing
    listingPricing:
      all.some((r) => r.listingPricing === 'free')
        ? 'free'
        : all.some((r) => r.listingPricing === 'paid')
          ? 'paid'
          : best.listingPricing ?? 'unknown',
  };
}

/** Candidate submission URLs to fetch after the entry page (capped). */
export function probeCandidateUrls(
  entryHtml: string,
  entryUrl: string,
  domain: string,
  max = 4
): string[] {
  try {
    const links = extractSubmissionCandidateLinks(entryHtml, entryUrl, domain, 0);
    return links.slice(0, max).map((l) => l.url);
  } catch {
    return [];
  }
}

export function linkProbeBandLabel(band: LinkProbeBand): string {
  switch (band) {
    case 'ready':
      return 'Ready to submit';
    case 'check':
      return 'Check fields / multi-step';
    case 'blocked':
      return 'Blocked (CAPTCHA / login)';
    case 'dead':
      return 'Dead / unreachable';
    case 'no_form':
      return 'No submission form';
    default:
      return 'Not probed';
  }
}

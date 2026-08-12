/**
 * Hard gate: never approve / never submit without a real listing form.
 * Content blogs, guide hubs, marketing homepages, paid listings, and
 * unprobed sites must never stay Approved for free backlink submission.
 */
import type { LinkProbeBand, LinkProbeResult } from './link-probe.js';

export const NO_FORM_REJECT_REASON =
  'No submission form found — content/blog pages cannot be approved for backlink submit';

export const DEAD_SITE_REJECT_REASON =
  'Dead / unreachable — no submission possible';

export const PAID_LISTING_REJECT_REASON =
  'Paid listing — not eligible for free Assisted Submit';

/** Public submit / directory listing entry URLs (used when live Link Probe is skipped). */
export const PUBLIC_SUBMIT_URL_RE =
  /submit(?:_article|_listing|_link|_site)?\.php|\/submit(?:\.php)?(?:\?|$|\/)|\/add\.php|suggest\.php|add[-_]?url|add[-_]?link|add[-_]?site|add[-_]?listing|\/listing/i;

export function looksLikePublicSubmitUrl(url: string | null | undefined): boolean {
  const raw = String(url ?? '').trim();
  if (!raw) return false;
  return PUBLIC_SUBMIT_URL_RE.test(raw);
}

/**
 * Company / skip-live: seed a ready probe from an imported submit URL so Approve
 * is not locked forever waiting on outbound HTTPS.
 */
export function syntheticLinkProbeFromSubmitUrl(
  url: string,
  opts: { reason?: string } = {}
): Partial<LinkProbeResult> {
  return {
    band: 'ready',
    formFound: true,
    alive: true,
    formUrl: url,
    listingPricing: 'unknown',
    hasUrl: true,
    hasTitle: true,
    hasDesc: true,
    hasEmail: false,
    score: 70,
    gates: [],
    spaShell: false,
    reasons: [opts.reason ?? 'import_url_submit_path'],
    probedAt: new Date().toISOString(),
  };
}

function submitEvidenceFromMetadata(
  metadata: Record<string, unknown> | null | undefined
): string | null {
  if (!metadata) return null;
  const lp = metadata.linkProbe as Partial<LinkProbeResult> | undefined;
  const pages =
    typeof metadata.detected_pages === 'object' && metadata.detected_pages
      ? (metadata.detected_pages as Record<string, unknown>)
      : {};
  const candidates = [
    typeof lp?.formUrl === 'string' ? lp.formUrl : null,
    typeof pages.directory === 'string' ? pages.directory : null,
    typeof pages.submission === 'string' ? pages.submission : null,
    typeof metadata.analyzedUrl === 'string' ? metadata.analyzedUrl : null,
  ];
  for (const c of candidates) {
    if (looksLikePublicSubmitUrl(c)) return c;
  }
  if (
    metadata.submissionPathConfirmed === true ||
    metadata.directoryPathConfirmed === true ||
    metadata.hasPublicSubmitUrl === true
  ) {
    return candidates.find((c) => Boolean(c)) ?? 'url-confirmed';
  }
  const qual = metadata.qualification as
    | { signals?: { hasPublicSubmissionPath?: boolean } }
    | undefined;
  if (qual?.signals?.hasPublicSubmissionPath === true) {
    return candidates.find((c) => Boolean(c)) ?? 'qualification-confirmed';
  }
  return null;
}

export type SubmissionProbeGate = {
  /** True when this site must leave Approved / submit worklists */
  disqualified: boolean;
  reason: string | null;
  /** Suggested AI Review decision */
  reviewDecision: 'Unsupported' | 'Dead Website' | null;
};

type ProbeGateInput = Pick<
  LinkProbeResult,
  'band' | 'formFound' | 'alive' | 'reasons' | 'listingPricing'
>;

/**
 * Probe bands that prove there is nothing to submit (or paid-only).
 */
export function probeDisqualifiesSubmission(
  probe: Partial<ProbeGateInput> | null | undefined
): boolean {
  if (!probe) return false;
  if (probe.listingPricing === 'paid') return true;
  if (probe.band === 'dead' || probe.alive === false) return true;
  if (probe.band === 'no_form') return true;
  if (probe.formFound === false && probe.band !== 'blocked' && probe.band !== 'check') {
    // blocked/check imply a form existed behind a gate / multi-step
    return true;
  }
  return false;
}

export function evaluateSubmissionProbeGate(
  probe: Partial<ProbeGateInput> | null | undefined
): SubmissionProbeGate {
  if (!probe) {
    return { disqualified: false, reason: null, reviewDecision: null };
  }
  if (probe.band === 'dead' || probe.alive === false) {
    return {
      disqualified: true,
      reason: DEAD_SITE_REJECT_REASON,
      reviewDecision: 'Dead Website',
    };
  }
  if (probe.listingPricing === 'paid') {
    return {
      disqualified: true,
      reason: PAID_LISTING_REJECT_REASON,
      reviewDecision: 'Unsupported',
    };
  }
  if (
    probe.band === 'no_form' ||
    (probe.formFound === false && probe.band !== 'blocked' && probe.band !== 'check')
  ) {
    const detail = probe.reasons?.find(Boolean);
    return {
      disqualified: true,
      reason: detail ? `${NO_FORM_REJECT_REASON} (${detail})` : NO_FORM_REJECT_REASON,
      reviewDecision: 'Unsupported',
    };
  }
  return { disqualified: false, reason: null, reviewDecision: null };
}

/** True when metadata.linkProbe disqualifies an opportunity from Approved lists. */
export function metadataDisqualifiesSubmission(
  metadata: Record<string, unknown> | null | undefined
): boolean {
  const lp = metadata?.linkProbe;
  if (!lp || typeof lp !== 'object') return false;
  return probeDisqualifiesSubmission(lp as LinkProbeResult);
}

export function bandsThatAllowApprove(): LinkProbeBand[] {
  return ['ready', 'check', 'blocked'];
}

/**
 * User/manual approve may proceed only when probe found a form
 * (ready / check / blocked) and listing is not paid.
 * Unprobed → block unless the imported URL already is a public submit path
 * (company hosts skip live Link Probe).
 */
export function canApproveAfterProbe(
  metadata: Record<string, unknown> | null | undefined
): { ok: boolean; reason?: string } {
  const lp = metadata?.linkProbe as Partial<LinkProbeResult> | undefined;
  if (!lp?.band || lp.band === 'unprobed') {
    const evidence = submitEvidenceFromMetadata(metadata);
    if (evidence) {
      return { ok: true };
    }
    return {
      ok: false,
      reason:
        'Run Link Probe first — sites without a detected submission form cannot be approved',
    };
  }
  const gate = evaluateSubmissionProbeGate(lp as LinkProbeResult);
  if (gate.disqualified) {
    return {
      ok: false,
      reason: gate.reason ?? NO_FORM_REJECT_REASON,
    };
  }
  if (!bandsThatAllowApprove().includes(lp.band as LinkProbeBand)) {
    return {
      ok: false,
      reason: `Probe band "${lp.band}" is not submittable`,
    };
  }
  return { ok: true };
}

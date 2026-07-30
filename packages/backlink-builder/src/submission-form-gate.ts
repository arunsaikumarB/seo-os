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
  if (probe.band === 'no_form' || (probe.formFound === false && probe.band !== 'blocked' && probe.band !== 'check')) {
    const detail = probe.reasons?.find(Boolean);
    return {
      disqualified: true,
      reason: detail
        ? `${NO_FORM_REJECT_REASON} (${detail})`
        : NO_FORM_REJECT_REASON,
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
 * Unprobed → block with clear reason.
 */
export function canApproveAfterProbe(
  metadata: Record<string, unknown> | null | undefined
): { ok: boolean; reason?: string } {
  const lp = metadata?.linkProbe as Partial<LinkProbeResult> | undefined;
  if (!lp?.band || lp.band === 'unprobed') {
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

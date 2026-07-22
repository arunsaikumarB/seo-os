/**
 * Phase 4.5 — Needs AI Review fallback (bounded: max 1 AI pass per stop).
 * Maps: Needs AI Review → Retrying (CSM); Unclassified → Waiting Human + unclassified tag.
 */
import {
  evaluateDetectors,
  gateFromClaim,
  type DetectorId,
  type TruthClaim,
} from '@seo-os/backlink-builder';
import { logger } from '../../lib/logger.js';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { captureEvidenceRecord, logTruthViolation } from './bee-evidence.service.js';

const CLAIM_TO_DETECTOR: Record<string, DetectorId> = {
  'Login Required': 'login',
  'Registration Required': 'signup',
  CAPTCHA: 'captcha',
  'Cloudflare / Anti-Bot': 'cloudflare',
  'Manual Approval': 'human_approval',
  'OTP / MFA': 'mfa',
  'Email Verification': 'email_verify',
  'Phone Verification': 'phone_verify',
};

/** Heuristic AI pass when no detector matched — no external model required for fixtures. */
export function suggestClaimFromDom(html: string, url: string): {
  claim: TruthClaim | null;
  signals: string[];
} {
  const blob = `${html}\n${url}`.toLowerCase();
  if (/under review|awaiting approval|pending moderation/.test(blob)) {
    return { claim: 'Manual Approval', signals: ['ai:approval_copy'] };
  }
  if (/cf-browser-verification|just a moment|challenge-platform/.test(blob)) {
    return { claim: 'Cloudflare / Anti-Bot', signals: ['ai:cf_markers'] };
  }
  if (/g-recaptcha|h-captcha|cf-turnstile|data-sitekey/.test(blob)) {
    return { claim: 'CAPTCHA', signals: ['ai:widget'] };
  }
  if (/type=["']password["']/.test(blob) && /(sign[\s-]?in|log[\s-]?in|login)/.test(blob)) {
    return { claim: 'Login Required', signals: ['ai:password_login'] };
  }
  if (/sign[\s-]?up|create account|register/.test(blob) && /type=["']password["']/.test(blob)) {
    return { claim: 'Registration Required', signals: ['ai:signup'] };
  }
  if (/otp|verification code|authenticator|2fa|mfa/.test(blob)) {
    return { claim: 'OTP / MFA', signals: ['ai:otp'] };
  }
  if (/verify your email|confirm your email/.test(blob)) {
    return { claim: 'Email Verification', signals: ['ai:email'] };
  }
  if (/verify.*(phone|sms)|sms code/.test(blob)) {
    return { claim: 'Phone Verification', signals: ['ai:phone'] };
  }
  return { claim: null, signals: ['ai:unknown'] };
}

export type AiReviewOutcome =
  | {
      kind: 'verified';
      claim: TruthClaim;
      gate: string;
      evidenceId: string;
      signals: Array<{ id: string; kind: string; detail: string }>;
    }
  | {
      kind: 'unclassified';
      evidenceId: string;
      gate: 'unclassified';
    }
  | {
      kind: 'skipped';
      reason: string;
    };

/**
 * Bounded AI classification pass (max 1). Re-runs detector to verify.
 * Caller should set needs_ai_review / Retrying before invoking when appropriate.
 */
export async function runNeedsAiReviewPass(params: {
  workspaceId: string;
  jobId: string;
  opportunityId?: string | null;
  html: string;
  url: string;
  screenshotBase64?: string | null;
  stage?: string | null;
  workerId?: string | null;
  leaseGeneration?: number | null;
  postSubmitHtml?: string | null;
}): Promise<AiReviewOutcome> {
  const { data: job } = await getSupabaseAdmin()
    .from('execution_jobs')
    .select('ai_review_attempted, needs_ai_review')
    .eq('id', params.jobId)
    .maybeSingle();

  if (job?.ai_review_attempted === true) {
    return { kind: 'skipped', reason: 'ai_pass_already_used' };
  }

  await getSupabaseAdmin()
    .from('execution_jobs')
    .update({
      needs_ai_review: true,
      ai_review_attempted: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.jobId);

  // Capture unknown evidence first
  const unknownEv = await captureEvidenceRecord({
    workspaceId: params.workspaceId,
    jobId: params.jobId,
    opportunityId: params.opportunityId,
    claim: 'Needs AI Review',
    detectorId: null,
    signals: [{ id: 'unknown_obstacle', kind: 'dom', detail: 'No detector matched' }],
    url: params.url,
    screenshotBase64: params.screenshotBase64,
    domHtml: params.html,
    stage: params.stage ?? 'ai_review',
    workerId: params.workerId,
    leaseGeneration: params.leaseGeneration,
    verified: false,
    unclassified: false,
  });

  const suggestion = suggestClaimFromDom(params.html, params.url);
  if (!suggestion.claim) {
    const unEv = await captureEvidenceRecord({
      workspaceId: params.workspaceId,
      jobId: params.jobId,
      opportunityId: params.opportunityId,
      claim: 'Unclassified',
      detectorId: null,
      signals: [
        { id: 'unclassified', kind: 'dom', detail: 'AI could not classify obstacle' },
        ...(unknownEv
          ? [{ id: 'prior_evidence', kind: 'dom', detail: unknownEv.id }]
          : []),
      ],
      url: params.url,
      screenshotBase64: params.screenshotBase64,
      domHtml: params.html,
      stage: params.stage ?? 'ai_review',
      workerId: params.workerId,
      leaseGeneration: params.leaseGeneration,
      verified: false,
      unclassified: true,
    });
    if (!unEv) {
      await logTruthViolation({
        workspaceId: params.workspaceId,
        jobId: params.jobId,
        kind: 'unclassified_without_evidence',
        source: 'runNeedsAiReviewPass',
      });
      return { kind: 'skipped', reason: 'evidence_failed' };
    }
    return { kind: 'unclassified', evidenceId: unEv.id, gate: 'unclassified' };
  }

  const detectorId = CLAIM_TO_DETECTOR[suggestion.claim];
  const ev = evaluateDetectors({
    html: params.html,
    url: params.url,
    postSubmitHtml: params.postSubmitHtml,
  });
  const hit = ev.all.find((r) => r.detectorId === detectorId && r.matched && r.blocking);

  if (!hit || !detectorId) {
    logger.info(
      { jobId: params.jobId, suggested: suggestion.claim },
      'AI claim failed detector verification → Unclassified'
    );
    const unEv = await captureEvidenceRecord({
      workspaceId: params.workspaceId,
      jobId: params.jobId,
      opportunityId: params.opportunityId,
      claim: 'Unclassified',
      detectorId: null,
      signals: [
        { id: 'ai_suggestion_rejected', kind: 'dom', detail: `AI suggested ${suggestion.claim}` },
        ...suggestion.signals.map((s) => ({ id: s, kind: 'text', detail: s })),
      ],
      url: params.url,
      screenshotBase64: params.screenshotBase64,
      domHtml: params.html,
      stage: params.stage ?? 'ai_review',
      workerId: params.workerId,
      leaseGeneration: params.leaseGeneration,
      verified: false,
      unclassified: true,
    });
    if (!unEv) return { kind: 'skipped', reason: 'evidence_failed' };
    return { kind: 'unclassified', evidenceId: unEv.id, gate: 'unclassified' };
  }

  const verifiedEv = await captureEvidenceRecord({
    workspaceId: params.workspaceId,
    jobId: params.jobId,
    opportunityId: params.opportunityId,
    claim: hit.claim,
    detectorId: hit.detectorId,
    signals: [
      ...hit.signals,
      ...suggestion.signals.map((s) => ({ id: s, kind: 'text', detail: 'ai_suggested' })),
    ],
    url: params.url,
    screenshotBase64: params.screenshotBase64,
    domHtml: params.html,
    stage: params.stage ?? 'ai_review',
    workerId: params.workerId,
    leaseGeneration: params.leaseGeneration,
    verified: true,
    unclassified: false,
  });

  if (!verifiedEv) return { kind: 'skipped', reason: 'evidence_failed' };

  const gate = gateFromClaim(hit.claim) ?? hit.detectorId;
  await getSupabaseAdmin()
    .from('execution_jobs')
    .update({
      needs_ai_review: false,
      unclassified: false,
      truth_claim: hit.claim,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.jobId);

  return {
    kind: 'verified',
    claim: hit.claim,
    gate,
    evidenceId: verifiedEv.id,
    signals: hit.signals,
  };
}

/**
 * Quality review before submission or outreach.
 * Rules always run. An AI provider may add reasoning, and the result says which
 * source produced the decision. Nothing is approved without stored reasons.
 */

import type { UrlScanVerdict } from './url-scanner.js';

export type ApprovalDecision = 'approve' | 'reject' | 'needs_human';
export type ApprovalSource = 'rules' | 'gemini' | 'ollama';

export interface ApprovalReviewInput {
  niche?: string | null;
  pageText?: string | null;
  title?: string | null;
  verdict?: Partial<UrlScanVerdict> | null;
  /** Model text. Ignored unless source is gemini or ollama and it parses. */
  aiText?: string | null;
  aiSource?: ApprovalSource | null;
}

export interface ApprovalReview {
  source: ApprovalSource;
  decision: ApprovalDecision;
  reasons: string[];
  checks: {
    relevance: 'pass' | 'fail' | 'unknown';
    spam: 'pass' | 'fail' | 'unknown';
    live: 'pass' | 'fail' | 'unknown';
    indexable: 'pass' | 'fail' | 'unknown';
    dofollow: 'pass' | 'fail' | 'unknown';
  };
  /** True only when a person or an explicit confirm step may proceed. */
  requiresHumanConfirm: boolean;
  summary: string;
}

const SPAM_RE =
  /\b(pbn|private blog network|link exchange|guest post for \$\d|buy backlinks|casino|viagra|payday loan|seo package)\b/i;

function tokenize(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 3)
  );
}

export function rulesApprovalReview(input: ApprovalReviewInput): ApprovalReview {
  const reasons: string[] = [];
  const text = `${input.title ?? ''} ${input.pageText ?? ''}`.trim();
  const niche = (input.niche ?? '').trim();
  const verdict = input.verdict ?? null;

  let relevance: ApprovalReview['checks']['relevance'] = 'unknown';
  if (!niche || !text) {
    relevance = 'unknown';
    reasons.push('Relevance is unknown: niche or page text was not provided.');
  } else {
    const nicheWords = tokenize(niche);
    const pageWords = tokenize(text);
    let overlap = 0;
    for (const word of nicheWords) if (pageWords.has(word)) overlap += 1;
    if (overlap > 0) {
      relevance = 'pass';
      reasons.push(`Relevance: ${overlap} niche word(s) appear on the page.`);
    } else {
      relevance = 'fail';
      reasons.push('Relevance failed: none of the niche words appear in the page text.');
    }
  }

  let spam: ApprovalReview['checks']['spam'] = 'pass';
  if (!text) {
    spam = 'unknown';
    reasons.push('Spam check is unknown: no page text.');
  } else if (SPAM_RE.test(text)) {
    spam = 'fail';
    reasons.push('Spam/PBN language is on the page.');
  } else {
    reasons.push('No PBN, paid-link, or spam phrases were found in the supplied text.');
  }

  let live: ApprovalReview['checks']['live'] = 'unknown';
  if (verdict?.broken) {
    live = 'fail';
    reasons.push(`Page is not live: ${verdict.brokenReason ?? 'broken'}.`);
  } else if (verdict && verdict.broken === false && verdict.httpStatus && verdict.httpStatus < 400) {
    live = 'pass';
    reasons.push(`Page returned HTTP ${verdict.httpStatus}.`);
  } else {
    reasons.push('Liveness was not scanned. Run the URL scanner before approval.');
  }

  let indexable: ApprovalReview['checks']['indexable'] = 'unknown';
  if (verdict?.robotsNoindex) {
    indexable = 'fail';
    reasons.push('Page is noindex, so a link here is a weak or unusable placement.');
  } else if (verdict && verdict.robotsNoindex === false && live === 'pass') {
    indexable = 'pass';
    reasons.push('No noindex tag was found on the scanned page.');
  } else {
    reasons.push('Indexability is unknown until the page is scanned.');
  }

  let dofollow: ApprovalReview['checks']['dofollow'] = 'unknown';
  if (verdict?.linkPolicy === 'dofollow') {
    dofollow = 'pass';
    reasons.push(verdict.linkPolicyEvidence ?? 'External links look dofollow.');
  } else if (verdict?.linkPolicy === 'nofollow') {
    dofollow = 'fail';
    reasons.push(verdict.linkPolicyEvidence ?? 'Links on the page are nofollow.');
  } else if (verdict?.linkPolicy === 'mixed') {
    dofollow = 'unknown';
    reasons.push(verdict.linkPolicyEvidence ?? 'Mixed follow policy. A person should check the placement.');
  } else {
    reasons.push('Dofollow vs nofollow is unknown.');
  }

  let decision: ApprovalDecision = 'needs_human';
  if (live === 'fail' || spam === 'fail' || indexable === 'fail') decision = 'reject';
  else if (relevance === 'fail' || dofollow === 'fail') decision = 'needs_human';
  else if (relevance === 'pass' && spam === 'pass' && live === 'pass' && indexable === 'pass' && dofollow === 'pass') {
    decision = 'approve';
  }

  const summary =
    decision === 'approve'
      ? 'Rules review would allow this page. A person still has to confirm before submit or outreach.'
      : decision === 'reject'
        ? 'Rules review says do not proceed.'
        : 'Rules review cannot approve this on its own. A person has to decide.';

  return {
    source: 'rules',
    decision,
    reasons,
    checks: { relevance, spam, live, indexable, dofollow },
    requiresHumanConfirm: true,
    summary,
  };
}

export function approvalReview(input: ApprovalReviewInput): ApprovalReview {
  const rules = rulesApprovalReview(input);
  const aiSource = input.aiSource === 'gemini' || input.aiSource === 'ollama' ? input.aiSource : null;
  const raw = input.aiText?.trim() ?? '';
  if (!aiSource || !raw) return rules;

  const decisionMatch = /\b(approve|reject|needs_human)\b/i.exec(raw);
  if (!decisionMatch) {
    return {
      ...rules,
      reasons: [
        `${aiSource} replied, but the reply did not contain approve, reject, or needs_human. Rules review is the decision.`,
        ...rules.reasons,
      ],
    };
  }
  const decision = decisionMatch[1].toLowerCase() as ApprovalDecision;
  // A model cannot override a hard reject from a broken, spam, or noindex page.
  const finalDecision = rules.decision === 'reject' ? 'reject' : decision;
  return {
    source: aiSource,
    decision: finalDecision,
    reasons: [
      `${aiSource} review: ${raw.slice(0, 1200)}`,
      ...(finalDecision !== decision ? ['Rules rejected the page, so the model decision was not applied.'] : []),
      ...rules.reasons,
    ],
    checks: rules.checks,
    requiresHumanConfirm: true,
    summary:
      finalDecision === 'approve'
        ? `${aiSource} would allow this page. Confirm before anything is sent or submitted.`
        : finalDecision === 'reject'
          ? `${aiSource} review says do not proceed.`
          : `${aiSource} review needs a person.`,
  };
}

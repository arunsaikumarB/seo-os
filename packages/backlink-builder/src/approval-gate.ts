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
  /** stop, automatic, assisted, or outreach. stop can never be approved. */
  workflowMode?: 'stop' | 'automatic' | 'assisted' | 'outreach' | null;
  verdict?: Partial<UrlScanVerdict> | null;
  /** Model text. Used only when it is valid review JSON from gemini or ollama. */
  aiText?: string | null;
  aiSource?: ApprovalSource | null;
}

export interface AiApprovalJson {
  relevanceScore: number;
  relevanceReason: string;
  spamSignals: string[];
  linkValue: string;
  risks: string[];
  verdict: ApprovalDecision;
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
  relevanceScore: number | null;
  ai: AiApprovalJson | null;
  /** Rules decision before the model verdict is applied. */
  rulesDecision: ApprovalDecision;
  /** Model verdict when the reply parsed. Null when there was no usable JSON. */
  aiVerdict: ApprovalDecision | null;
  /** Present when a model replied and the JSON could not be used. Truncated. */
  rawReply: string | null;
}

/** Ollama `format` value for a review call. */
export const APPROVAL_REVIEW_JSON_SCHEMA = {
  type: 'object',
  properties: {
    relevanceScore: { type: 'number' },
    relevanceReason: { type: 'string' },
    spamSignals: { type: 'array', items: { type: 'string' } },
    linkValue: { type: 'string' },
    risks: { type: 'array', items: { type: 'string' } },
    verdict: { type: 'string', enum: ['approve', 'reject', 'needs_human'] },
  },
  required: ['relevanceScore', 'verdict'],
} as const;

const DECISION_RANK: Record<ApprovalDecision, number> = {
  approve: 0,
  needs_human: 1,
  reject: 2,
};

function stricterDecision(rulesDecision: ApprovalDecision, aiVerdict: ApprovalDecision): ApprovalDecision {
  return DECISION_RANK[aiVerdict] > DECISION_RANK[rulesDecision] ? aiVerdict : rulesDecision;
}

const SPAM_RE =
  /\b(pbn|private blog network|link exchange|guest post for \$\d|buy backlinks|casino|viagra|payday loan|seo package)\b/i;

function scoreRelevance(
  niche: string,
  text: string,
  verdict: Partial<UrlScanVerdict> | null | undefined
): { relevance: ApprovalReview['checks']['relevance']; score: number | null; reason: string } {
  if (!niche || !text) {
    return {
      relevance: 'unknown',
      score: null,
      reason: 'Relevance is unknown: niche or page text was not provided.',
    };
  }
  const nicheWords = tokenize(niche);
  const pageWords = tokenize(text);
  const hits: string[] = [];
  for (const word of nicheWords) if (pageWords.has(word)) hits.push(word);
  if (/\b(casino|viagra|payday)\b/i.test(text) && !/\b(casino|viagra|payday)\b/i.test(niche)) {
    return {
      relevance: 'fail',
      score: 0,
      reason: 'Relevance 0/100: the page is a different vertical from the client niche.',
    };
  }
  if (hits.length > 0) {
    const score = Math.min(100, 30 + hits.length * 20);
    return {
      relevance: 'pass',
      score,
      reason: `Relevance ${score}/100: niche words on the page (${hits.slice(0, 6).join(', ')}).`,
    };
  }
  const generalListing =
    verdict?.submissionFormIndex != null ||
    verdict?.pageKind === 'submission' ||
    verdict?.pageKind === 'directory' ||
    verdict?.suggestedCategory === 'directory' ||
    verdict?.suggestedCategory === 'citation';
  if (generalListing) {
    return {
      relevance: 'pass',
      score: 40,
      reason:
        'Relevance 40/100: this is a general listing form and it does not contradict the client niche. The niche words themselves are not on the page.',
    };
  }
  return {
    relevance: 'fail',
    score: 10,
    reason: 'Relevance 10/100: none of the niche words appear on the page, and this is not a general listing form.',
  };
}

const RELEVANCE_STOP = new Set([
  'discover', 'about', 'with', 'your', 'from', 'this', 'that', 'have', 'more', 'home',
  'page', 'site', 'website', 'online', 'best', 'free', 'click', 'learn', 'welcome',
  'official', 'powered', 'platform', 'software', 'using', 'their', 'they', 'will',
  'just', 'also', 'into', 'over', 'here', 'there',
]);

function tokenize(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 3 && !RELEVANCE_STOP.has(w))
  );
}

export function rulesApprovalReview(input: ApprovalReviewInput): ApprovalReview {
  const reasons: string[] = [];
  const text = `${input.title ?? ''} ${input.pageText ?? ''}`.trim();
  const niche = (input.niche ?? '').trim();
  const verdict = input.verdict ?? null;

  const relevanceScored = scoreRelevance(niche, text, verdict);
  const relevance = relevanceScored.relevance;
  reasons.push(relevanceScored.reason);

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
  if (verdict?.captcha || verdict?.cloudflare || verdict?.indexable === null) {
    indexable = 'unknown';
    reasons.push('Indexability is unknown because the fetched page is a challenge, a login wall, or not the real page.');
  } else if (verdict?.robotsNoindex) {
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
  const constrained = constrainDecision(decision, input, decision);
  decision = constrained.decision;
  if (constrained.note) reasons.unshift(constrained.note);

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
    relevanceScore: relevanceScored.score,
    ai: null,
    rulesDecision: decision,
    aiVerdict: null,
    rawReply: null,
  };
}

function statedText(value: unknown): string {
  if (typeof value !== 'string') return 'not stated';
  const trimmed = value.trim();
  return trimmed || 'not stated';
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function coerceScore(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : Number.NaN;
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) return null;
  return numeric;
}

export function parseAiApprovalJson(text: string): AiApprovalJson | null {
  const stripped = text.replace(/```(?:json)?/gi, '').trim();
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(stripped.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const verdict = String(obj.verdict ?? '').trim().toLowerCase();
  if (verdict !== 'approve' && verdict !== 'reject' && verdict !== 'needs_human') return null;
  const relevanceScore = coerceScore(obj.relevanceScore);
  if (relevanceScore == null) return null;
  return {
    relevanceScore,
    relevanceReason: statedText(obj.relevanceReason),
    spamSignals: stringList(obj.spamSignals),
    linkValue: statedText(obj.linkValue),
    risks: stringList(obj.risks),
    verdict,
  };
}

export function buildApprovalPrompt(input: {
  niche: string;
  pageText: string;
  url: string;
  workflowMode: string;
  workflowReason: string;
  verdict: Partial<UrlScanVerdict> | null;
}): string {
  return [
    'Review this backlink placement. Reply with JSON only, no markdown, using this shape:',
    '{"relevanceScore":0,"relevanceReason":"","spamSignals":[],"linkValue":"","risks":[],"verdict":"needs_human"}',
    'relevanceScore is 0-100. verdict is approve, reject, or needs_human.',
    'approve only when the page can actually take this client\'s link. A stopped page (broken, or no form and no contact) is reject.',
    'A login, signup, captcha, or Cloudflare page is needs_human, never reject and never approve.',
    `Niche: ${input.niche || '(not provided)'}`,
    `URL: ${input.url}`,
    `Workflow: ${input.workflowMode}. ${input.workflowReason}`,
    `Page text: ${input.pageText.slice(0, 1800) || '(empty)'}`,
    `Scanner: ${JSON.stringify(input.verdict ?? {})}`,
    'Do not invent metrics.',
  ].join('\n');
}

function stoppedWorkflow(input: ApprovalReviewInput): boolean {
  const verdict = input.verdict;
  if (verdict?.broken || verdict?.stop) return true;
  if (humanGate(input)) return false;
  if (input.workflowMode === 'stop') return true;
  const formContact = (verdict?.contactChannels ?? []).some((channel) => channel.kind === 'form');
  const noContact = (verdict?.contactEmails?.length ?? 0) === 0 && !formContact;
  return Boolean(verdict?.noForm && noContact && verdict.submissionFormIndex == null);
}

function humanGate(input: ApprovalReviewInput): boolean {
  const verdict = input.verdict;
  return Boolean(verdict?.captcha || verdict?.cloudflare || verdict?.loginRequired || verdict?.signupRequired);
}

function constrainDecision(
  decision: ApprovalDecision,
  input: ApprovalReviewInput,
  rulesDecision: ApprovalDecision
): { decision: ApprovalDecision; note: string | null } {
  if (input.verdict?.broken || input.verdict?.stop) {
    return {
      decision: 'reject',
      note: decision === 'reject' ? null : 'The page is broken, so this cannot be approved.',
    };
  }
  if (humanGate(input)) {
    return {
      decision: 'needs_human',
      note:
        decision === 'needs_human'
          ? null
          : 'Login or captcha is a human step, not a reject and not an approval.',
    };
  }
  if (stoppedWorkflow(input)) {
    return {
      decision: 'reject',
      note:
        decision === 'reject'
          ? null
          : 'The workflow is stop (no form and no contact), so this cannot be approved.',
    };
  }
  if (rulesDecision === 'reject' && decision !== 'reject') {
    return { decision: 'reject', note: 'Rules rejected the page, so the model decision was not applied.' };
  }
  return { decision, note: null };
}

export function approvalReview(input: ApprovalReviewInput): ApprovalReview {
  const rules = rulesApprovalReview(input);
  const aiSource = input.aiSource === 'gemini' || input.aiSource === 'ollama' ? input.aiSource : null;
  const raw = input.aiText?.trim() ?? '';
  if (!aiSource || !raw) return rules;

  const parsed = parseAiApprovalJson(raw);
  if (!parsed) {
    const rawReply = raw.slice(0, 500);
    return {
      ...rules,
      rawReply,
      reasons: [
        `${aiSource} reply was not valid review JSON. Rules review is the decision.`,
        `Raw reply: ${rawReply}`,
        ...rules.reasons,
      ],
    };
  }
  const combined = stricterDecision(rules.decision, parsed.verdict);
  const constrained = constrainDecision(combined, input, rules.decision);
  const decision = constrained.decision;
  const note = constrained.note;
  const stricterNote =
    parsed.verdict !== rules.decision && DECISION_RANK[parsed.verdict] > DECISION_RANK[rules.decision]
      ? `${aiSource} verdict ${parsed.verdict} is stricter than the rules decision ${rules.decision}.`
      : null;
  const blockedNote =
    rules.decision === 'reject' && parsed.verdict !== 'reject'
      ? 'Rules rejected the page, so the model decision was not applied.'
      : null;
  return {
    source: aiSource,
    decision,
    rulesDecision: rules.decision,
    aiVerdict: parsed.verdict,
    rawReply: null,
    reasons: [
      `Rules decision: ${rules.decision}. ${aiSource} verdict: ${parsed.verdict}. Combined decision: ${decision}.`,
      `${aiSource} JSON: relevance ${parsed.relevanceScore}/100 (${parsed.relevanceReason}). Link value: ${parsed.linkValue}. Spam signals: ${parsed.spamSignals.join('; ') || 'none'}. Risks: ${parsed.risks.join('; ') || 'none'}. Model verdict: ${parsed.verdict}.`,
      ...(stricterNote ? [stricterNote] : []),
      ...(blockedNote ? [blockedNote] : []),
      ...(note && note !== blockedNote && !rules.reasons.includes(note) ? [note] : []),
      ...rules.reasons,
    ],
    checks: rules.checks,
    requiresHumanConfirm: true,
    summary:
      decision === 'approve'
        ? `${aiSource} would allow this page. Confirm before anything is sent or submitted.`
        : decision === 'reject'
          ? `${aiSource} review says do not proceed.`
          : `${aiSource} review needs a person.`,
    relevanceScore: rules.relevanceScore,
    ai: parsed,
  };
}

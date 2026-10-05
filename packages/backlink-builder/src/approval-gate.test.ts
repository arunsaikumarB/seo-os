import { describe, expect, it } from 'vitest';
import { approvalReview, parseAiApprovalJson, rulesApprovalReview } from './approval-gate.js';

describe('approval gate', () => {
  it('rejects a broken page and always asks a person to confirm', () => {
    const review = rulesApprovalReview({
      niche: 'bakery marketing',
      title: 'Bakery directory',
      pageText: 'Submit your bakery website',
      verdict: { broken: true, brokenReason: 'HTTP 404', httpStatus: 404, robotsNoindex: false, linkPolicy: 'unknown', linkPolicyEvidence: '' },
    });
    expect(review.source).toBe('rules');
    expect(review.decision).toBe('reject');
    expect(review.requiresHumanConfirm).toBe(true);
    expect(review.reasons.join(' ')).toMatch(/not live/);
  });

  it('does not approve when dofollow is unknown', () => {
    const review = rulesApprovalReview({
      niche: 'bakery',
      title: 'Bakery resources',
      pageText: 'A bakery resource page',
      verdict: { broken: false, httpStatus: 200, robotsNoindex: false, linkPolicy: 'unknown', linkPolicyEvidence: 'none' },
    });
    expect(review.decision).toBe('needs_human');
    expect(review.summary).toMatch(/cannot approve/i);
  });

  it('approves only when every check passes, and still requires confirm', () => {
    const review = rulesApprovalReview({
      niche: 'bakery',
      title: 'Bakery directory',
      pageText: 'Add your bakery listing',
      verdict: { broken: false, httpStatus: 200, robotsNoindex: false, linkPolicy: 'dofollow', linkPolicyEvidence: '2 dofollow' },
    });
    expect(review.decision).toBe('approve');
    expect(review.requiresHumanConfirm).toBe(true);
    expect(review.checks).toEqual({
      relevance: 'pass',
      spam: 'pass',
      live: 'pass',
      indexable: 'pass',
      dofollow: 'pass',
    });
  });

  it('labels a model decision and refuses to override a rules reject', () => {
    const review = approvalReview({
      niche: 'bakery',
      pageText: 'buy backlinks cheap casino',
      verdict: { broken: false, httpStatus: 200, robotsNoindex: false, linkPolicy: 'dofollow', linkPolicyEvidence: 'dofollow', noForm: false, submissionFormIndex: 0, pageKind: 'submission', suggestedCategory: 'directory' },
      aiSource: 'gemini',
      aiText: JSON.stringify({
        relevanceScore: 90,
        relevanceReason: 'looks fine',
        spamSignals: [],
        linkValue: 'high',
        risks: [],
        verdict: 'approve',
      }),
    });
    expect(review.source).toBe('gemini');
    expect(review.decision).toBe('reject');
    expect(review.reasons.join(' ')).toMatch(/Rules rejected/);
    expect(review.ai?.verdict).toBe('approve');
  });

  it('falls back to rules when the model reply is not JSON', () => {
    const review = approvalReview({
      niche: 'bakery',
      pageText: 'bakery listing',
      aiSource: 'ollama',
      aiText: 'approve. This appears valid.',
    });
    expect(review.source).toBe('rules');
    expect(review.reasons[0]).toMatch(/not valid review JSON/);
    expect(review.rawReply).toBe('approve. This appears valid.');
    expect(review.reasons.join('\n')).toMatch(/Raw reply: approve\. This appears valid\./);
    expect(review.ai).toBeNull();
  });

  it('rejects a stopped page even when the model approves it', () => {
    const review = approvalReview({
      niche: 'ChefGaa restaurant food',
      pageText: 'Example Domain This domain is for use in illustrative examples.',
      workflowMode: 'stop',
      verdict: {
        broken: false,
        stop: false,
        httpStatus: 200,
        robotsNoindex: false,
        linkPolicy: 'unknown',
        noForm: true,
        submissionFormIndex: null,
        contactEmails: [],
        contactChannels: [],
        pageKind: 'homepage',
      },
      aiSource: 'ollama',
      aiText: JSON.stringify({
        relevanceScore: 80,
        relevanceReason: 'appears valid',
        spamSignals: [],
        linkValue: 'some',
        risks: [],
        verdict: 'approve',
      }),
    });
    expect(review.decision).toBe('reject');
    expect(review.reasons.join(' ')).toMatch(/cannot be approved/);
    expect(review.checks.relevance).toBe('fail');
  });

  it('keeps login and captcha as needs_human when the model says reject', () => {
    const review = approvalReview({
      niche: 'restaurant food',
      pageText: 'GitHub login sign in',
      workflowMode: 'assisted',
      verdict: {
        broken: false,
        httpStatus: 200,
        robotsNoindex: false,
        captcha: true,
        loginRequired: true,
        indexable: null,
        linkPolicy: 'dofollow',
        noForm: false,
        pageKind: 'login',
      },
      aiSource: 'ollama',
      aiText: JSON.stringify({
        relevanceScore: 20,
        relevanceReason: 'login wall',
        spamSignals: [],
        linkValue: 'low',
        risks: ['captcha'],
        verdict: 'reject',
      }),
    });
    expect(review.decision).toBe('needs_human');
    expect(review.checks.indexable).toBe('unknown');
    expect(review.reasons.join(' ')).toMatch(/human step/);
  });

  it('lets a valid model verdict make an approval stricter and still shows the rules decision', () => {
    const review = approvalReview({
      niche: 'restaurant pos',
      pageText: 'Submit your site to the directory',
      workflowMode: 'automatic',
      verdict: {
        broken: false,
        httpStatus: 200,
        robotsNoindex: false,
        linkPolicy: 'dofollow',
        linkPolicyEvidence: 'dofollow',
        noForm: false,
        submissionFormIndex: 1,
        pageKind: 'submission',
        suggestedCategory: 'directory',
        captcha: false,
        loginRequired: false,
      },
      aiSource: 'ollama',
      aiText: JSON.stringify({
        relevanceScore: 0,
        relevanceReason: 'The page is not a restaurant POS submission page.',
        spamSignals: [],
        linkValue: 'https://www.jayde.com/submit.html',
        risks: ['not a restaurant page'],
        verdict: 'needs_human',
      }),
    });
    expect(review.decision).toBe('needs_human');
    expect(review.source).toBe('ollama');
    expect(review.rulesDecision).toBe('approve');
    expect(review.aiVerdict).toBe('needs_human');
    expect(review.requiresHumanConfirm).toBe(true);
    expect(review.reasons.join(' ')).toMatch(/stricter than the rules decision approve/);
  });

  it('accepts the qwen2.5:7b review JSON with an empty linkValue', () => {
    const reply = [
      '```json',
      '{"relevanceScore":20,"relevanceReason":"...","spamSignals":[],"linkValue":"","risks":["..."],"verdict":"needs_human"}',
      '```',
    ].join('\n');
    expect(parseAiApprovalJson(reply)).toEqual({
      relevanceScore: 20,
      relevanceReason: '...',
      spamSignals: [],
      linkValue: 'not stated',
      risks: ['...'],
      verdict: 'needs_human',
    });
    expect(parseAiApprovalJson('{"verdict":"reject","relevanceScore":"0"}')).toMatchObject({
      relevanceScore: 0,
      relevanceReason: 'not stated',
      spamSignals: [],
      linkValue: 'not stated',
      risks: [],
      verdict: 'reject',
    });
    expect(parseAiApprovalJson('{"verdict":"maybe","relevanceScore":20}')).toBeNull();
    expect(parseAiApprovalJson('{"relevanceScore":20}')).toBeNull();

    const review = approvalReview({
      niche: 'restaurant pos',
      pageText: '',
      workflowMode: 'stop',
      verdict: { broken: true, brokenReason: 'DNS failure', httpStatus: null, stop: true },
      aiSource: 'ollama',
      aiText: reply,
    });
    expect(review.source).toBe('ollama');
    expect(review.rulesDecision).toBe('reject');
    expect(review.aiVerdict).toBe('needs_human');
    expect(review.decision).toBe('reject');
    expect(review.reasons[0]).toMatch(/Rules decision: reject/);
  });

  it('does not treat a marketing word as niche overlap', () => {
    const review = rulesApprovalReview({
      niche: 'restaurant pos',
      pageText: 'Discover more local businesses. Sign up to add a listing.',
      verdict: {
        broken: false,
        httpStatus: 200,
        robotsNoindex: false,
        linkPolicy: 'dofollow',
        suggestedCategory: 'citation',
        pageKind: 'signup',
        loginRequired: true,
      },
    });
    expect(review.checks.relevance).toBe('pass');
    expect(review.relevanceScore).toBe(40);
    expect(review.reasons.join(' ')).not.toMatch(/discover/);
    expect(review.decision).toBe('needs_human');
  });
});

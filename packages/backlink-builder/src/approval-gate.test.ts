import { describe, expect, it } from 'vitest';
import { approvalReview, rulesApprovalReview } from './approval-gate.js';

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
      verdict: { broken: false, httpStatus: 200, robotsNoindex: false, linkPolicy: 'dofollow', linkPolicyEvidence: 'dofollow' },
      aiSource: 'gemini',
      aiText: 'approve — looks fine',
    });
    expect(review.source).toBe('gemini');
    expect(review.decision).toBe('reject');
    expect(review.reasons.join(' ')).toMatch(/Rules rejected/);
  });

  it('falls back to rules when the model reply is unusable', () => {
    const review = approvalReview({
      niche: 'bakery',
      pageText: 'bakery listing',
      aiSource: 'ollama',
      aiText: 'I am not sure what to do',
    });
    expect(review.source).toBe('rules');
    expect(review.reasons[0]).toMatch(/did not contain approve/);
  });
});

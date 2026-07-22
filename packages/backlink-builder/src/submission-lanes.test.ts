import { describe, expect, it } from 'vitest';
import {
  isPublishApprovalPause,
  submissionLaneForIntervention,
} from '../src/submission-lanes.js';

describe('submission lanes (Phase 6.2)', () => {
  it('routes CAPTCHA / Login / Unclassified to Lane B', () => {
    expect(
      submissionLaneForIntervention({
        gate: 'captcha',
        truthClaim: 'CAPTCHA',
      })
    ).toBe('human_gate');
    expect(
      submissionLaneForIntervention({
        gate: 'login',
        truthClaim: 'Login Required',
      })
    ).toBe('human_gate');
    expect(
      submissionLaneForIntervention({
        gate: 'unclassified',
        unclassified: true,
        truthClaim: 'Unclassified',
      })
    ).toBe('human_gate');
    expect(
      submissionLaneForIntervention({
        gate: 'human_approval',
        truthClaim: 'Manual Approval',
        status: 'needs_approval',
      })
    ).toBe('human_gate');
  });

  it('routes final publish confirmation to Lane A (batch)', () => {
    expect(
      isPublishApprovalPause({
        gate: 'human_approval',
        pauseReason: 'human_approval',
        status: 'needs_approval',
        truthClaim: null,
      })
    ).toBe(true);
    expect(
      submissionLaneForIntervention({
        gate: 'human_approval',
        pauseReason: 'human_approval',
        status: 'needs_approval',
      })
    ).toBe('auto');
  });

  it('never puts CAPTCHA in Lane A', () => {
    expect(
      submissionLaneForIntervention({
        gate: 'captcha',
        pauseReason: 'captcha',
        status: 'watching_captcha',
        truthClaim: 'CAPTCHA',
      })
    ).toBe('human_gate');
  });
});

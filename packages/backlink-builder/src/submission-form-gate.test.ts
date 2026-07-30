import { describe, expect, it } from 'vitest';
import {
  canApproveAfterProbe,
  evaluateSubmissionProbeGate,
  metadataDisqualifiesSubmission,
  probeDisqualifiesSubmission,
} from './submission-form-gate.js';

describe('submission-form-gate', () => {
  it('disqualifies no_form and dead probes', () => {
    expect(
      probeDisqualifiesSubmission({
        band: 'no_form',
        formFound: false,
        alive: true,
      })
    ).toBe(true);
    expect(
      probeDisqualifiesSubmission({
        band: 'dead',
        formFound: false,
        alive: false,
      })
    ).toBe(true);
    expect(
      probeDisqualifiesSubmission({
        band: 'ready',
        formFound: true,
        alive: true,
      })
    ).toBe(false);
  });

  it('maps no_form to Unsupported review decision', () => {
    const g = evaluateSubmissionProbeGate({
      band: 'no_form',
      formFound: false,
      alive: true,
      reasons: ['No submission form detected'],
    });
    expect(g.disqualified).toBe(true);
    expect(g.reviewDecision).toBe('Unsupported');
    expect(g.reason).toMatch(/No submission form/);
  });

  it('blocks approve when unprobed, no_form, or paid in metadata', () => {
    expect(canApproveAfterProbe({}).ok).toBe(false);
    expect(
      canApproveAfterProbe({
        linkProbe: { band: 'no_form', formFound: false, alive: true, probedAt: 'x' },
      }).ok
    ).toBe(false);
    expect(
      canApproveAfterProbe({
        linkProbe: {
          band: 'check',
          formFound: true,
          alive: true,
          listingPricing: 'paid',
          probedAt: 'x',
        },
      }).ok
    ).toBe(false);
    expect(
      canApproveAfterProbe({
        linkProbe: { band: 'ready', formFound: true, alive: true, listingPricing: 'free', probedAt: 'x' },
      }).ok
    ).toBe(true);
  });

  it('maps paid listing to Unsupported', () => {
    const g = evaluateSubmissionProbeGate({
      band: 'check',
      formFound: true,
      alive: true,
      listingPricing: 'paid',
      reasons: ['paid_no_free_word'],
    });
    expect(g.disqualified).toBe(true);
    expect(g.reviewDecision).toBe('Unsupported');
    expect(g.reason).toMatch(/Paid listing/);
  });

  it('metadataDisqualifiesSubmission reads linkProbe', () => {
    expect(
      metadataDisqualifiesSubmission({
        linkProbe: { band: 'no_form', formFound: false, alive: true },
      })
    ).toBe(true);
    expect(
      metadataDisqualifiesSubmission({
        linkProbe: { band: 'ready', formFound: true, alive: true, listingPricing: 'paid' },
      })
    ).toBe(true);
    expect(
      metadataDisqualifiesSubmission({
        linkProbe: { band: 'ready', formFound: true, alive: true, listingPricing: 'free' },
      })
    ).toBe(false);
  });
});

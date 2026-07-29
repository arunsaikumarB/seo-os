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

  it('blocks approve when unprobed or no_form in metadata', () => {
    expect(canApproveAfterProbe({}).ok).toBe(false);
    expect(
      canApproveAfterProbe({
        linkProbe: { band: 'no_form', formFound: false, alive: true, probedAt: 'x' },
      }).ok
    ).toBe(false);
    expect(
      canApproveAfterProbe({
        linkProbe: { band: 'ready', formFound: true, alive: true, probedAt: 'x' },
      }).ok
    ).toBe(true);
  });

  it('metadataDisqualifiesSubmission reads linkProbe', () => {
    expect(
      metadataDisqualifiesSubmission({
        linkProbe: { band: 'no_form', formFound: false, alive: true },
      })
    ).toBe(true);
    expect(metadataDisqualifiesSubmission({ linkProbe: { band: 'ready', formFound: true, alive: true } })).toBe(
      false
    );
  });
});

import { describe, expect, it } from 'vitest';
import {
  classifyUrlProvisional,
  computeAutoManualCounts,
  inferManualReasonFromEvidence,
  manualReasonFromGate,
  resolveItemLane,
  shouldDivertGateToManual,
} from '../src/manual-lane.js';

describe('manual lane (Phase 6.3 / 6.3.1)', () => {
  it('classifies auth paths as provisional Manual', () => {
    const r = classifyUrlProvisional('https://example.com/wp-login.php');
    expect(r.lane).toBe('manual');
    expect(r.provisional).toBe(true);
    expect(r.signal).toBe('auth_path');
  });

  it('classifies clean URLs as provisional Auto', () => {
    const r = classifyUrlProvisional('https://articleslist.net/submit');
    expect(r.lane).toBe('auto');
    expect(r.reason).toBeNull();
  });

  it('diverts CAPTCHA to Manual but not publish-approval-only', () => {
    expect(
      shouldDivertGateToManual({ gate: 'captcha', truthClaim: 'CAPTCHA' })
    ).toBe(true);
    expect(
      shouldDivertGateToManual({
        gate: 'human_approval',
        isPublishApprovalOnly: true,
      })
    ).toBe(false);
  });

  it('maps gates to Excel reasons', () => {
    expect(manualReasonFromGate('cloudflare', 'Cloudflare / Anti-Bot')).toBe('Cloudflare');
    expect(manualReasonFromGate('unsupported')).toBe('Unsupported');
  });

  it('counts automatable vs manual from metadata; excludes terminal', () => {
    const c = computeAutoManualCounts([
      { currentStatus: 'Ready', metadata: { submissionLane: 'auto' } },
      { currentStatus: 'Skipped', metadata: { submissionLane: 'manual', manualReason: 'CAPTCHA' } },
      { currentStatus: 'Deleted', metadata: { submissionLane: 'manual' } },
      { currentStatus: 'Rejected', metadata: { submissionLane: 'auto' } },
      { currentStatus: 'Failed', metadata: { submissionLane: 'auto' } },
    ]);
    expect(c.automatable).toBe(1);
    expect(c.manual).toBe(1);
    expect(c.active).toBe(2);
    expect(c.terminalExcluded).toBe(3);
    expect(c.automatable + c.manual).toBe(c.active);
  });

  it('infers Manual from Waiting Human Unclassified without stamped lane', () => {
    expect(
      inferManualReasonFromEvidence({
        currentStatus: 'Waiting Human',
        truthClaim: 'Unclassified',
        unclassified: true,
      })
    ).toBe('Unclassified');
    expect(
      resolveItemLane({
        currentStatus: 'Waiting Human',
        truthClaim: 'Unclassified',
        unclassified: true,
      }).lane
    ).toBe('manual');
  });

  it('does not treat bare Waiting Human publish-approval as Manual', () => {
    expect(
      inferManualReasonFromEvidence({
        currentStatus: 'Waiting Human',
        pauseReason: 'human_approval',
        jobStatus: 'needs_approval',
      })
    ).toBeNull();
    expect(
      inferManualReasonFromEvidence({
        currentStatus: 'Waiting Human',
      })
    ).toBeNull();
    expect(
      inferManualReasonFromEvidence({
        currentStatus: 'Waiting Human',
        pauseReason: 'human_approval',
        truthClaim: 'Manual Approval',
      })
    ).toBe('Manual Approval');
  });

  it('infers Cloudflare + Unsupported from job / profile evidence', () => {
    expect(
      inferManualReasonFromEvidence({
        currentStatus: 'Waiting Human',
        pauseReason: 'cloudflare',
        truthClaim: 'Cloudflare / Anti-Bot',
      })
    ).toBe('Cloudflare');
    expect(
      inferManualReasonFromEvidence({
        currentStatus: 'Ready',
        profileStatus: 'unsupported',
      })
    ).toBe('Unsupported');
  });

  it('keeps Rejected out of both lanes', () => {
    const r = resolveItemLane({
      currentStatus: 'Rejected',
      truthClaim: 'CAPTCHA',
    });
    expect(r.inActiveCohort).toBe(false);
  });
});

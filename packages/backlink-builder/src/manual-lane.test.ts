import { describe, expect, it } from 'vitest';
import {
  classifyUrlProvisional,
  computeAutoManualCounts,
  manualReasonFromGate,
  shouldDivertGateToManual,
} from '../src/manual-lane.js';

describe('manual lane (Phase 6.3)', () => {
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

  it('counts automatable vs manual from metadata', () => {
    const c = computeAutoManualCounts([
      { currentStatus: 'Ready', metadata: { submissionLane: 'auto' } },
      { currentStatus: 'Skipped', metadata: { submissionLane: 'manual', manualReason: 'CAPTCHA' } },
      { currentStatus: 'Deleted', metadata: { submissionLane: 'manual' } },
    ]);
    expect(c.automatable).toBe(1);
    expect(c.manual).toBe(1);
  });
});

import { describe, expect, it } from 'vitest';
import { verificationFollowUp } from './verification.js';

describe('verification follow-up', () => {
  it('marks verified only when the checker outcome is verified', () => {
    expect(verificationFollowUp({ outcome: 'verified', attempt: 0 }).action).toBe('verified');
    expect(verificationFollowUp({ outcome: 'pending', attempt: 0 }).action).not.toBe('verified');
  });

  it('retries pending, broken, and unreachable with backoff, then holds pending', () => {
    const first = verificationFollowUp({ outcome: 'pending', attempt: 0 });
    expect(first.action).toBe('retry');
    expect(first.startAfterSeconds).toBe(15 * 60);
    expect(verificationFollowUp({ outcome: 'pending', attempt: 1 }).startAfterSeconds).toBe(60 * 60);
    expect(verificationFollowUp({ outcome: 'unreachable', attempt: 2 }).startAfterSeconds).toBe(6 * 60 * 60);
    expect(verificationFollowUp({ outcome: 'broken', attempt: 3 }).startAfterSeconds).toBe(24 * 60 * 60);
    expect(verificationFollowUp({ outcome: 'pending', attempt: 4 }).action).toBe('pending');
    expect(verificationFollowUp({ outcome: 'broken', attempt: 4 }).action).toBe('lost');
    expect(verificationFollowUp({ outcome: 'unreachable', attempt: 4 }).action).toBe('lost');
  });
});

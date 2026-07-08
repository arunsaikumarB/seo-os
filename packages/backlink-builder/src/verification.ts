import type { VerificationStatus } from './backlink-types.js';

export function canVerify(status: VerificationStatus): boolean {
  return status === 'pending' || status === 'unreachable';
}

export function verificationLabel(status: VerificationStatus): string {
  const labels: Record<VerificationStatus, string> = {
    pending: 'Pending verification',
    verified: 'Link verified',
    lost: 'Link lost',
    unreachable: 'Could not reach',
  };
  return labels[status] ?? status;
}

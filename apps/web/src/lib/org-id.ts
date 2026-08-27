import { DEMO_ORG_ID } from '@/demo/data';

const ORG_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** True when id is a live API organization UUID (not demo/local placeholders). */
export function isLiveOrgId(orgId: string | null | undefined): orgId is string {
  return !!orgId && ORG_UUID_RE.test(orgId);
}

export function isDemoOrgId(orgId: string | null | undefined): boolean {
  return orgId === DEMO_ORG_ID || (typeof orgId === 'string' && orgId.startsWith('demo-'));
}

/** Pick the first membership org id that is safe for live API calls. */
export function resolveLiveOrgId(
  currentOrgId: string | null | undefined,
  membershipOrgIds: string[]
): string | null {
  const valid = new Set(membershipOrgIds.filter(isLiveOrgId));
  if (currentOrgId && valid.has(currentOrgId)) return currentOrgId;
  return membershipOrgIds.find(isLiveOrgId) ?? null;
}

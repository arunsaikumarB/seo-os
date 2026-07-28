import { SignJWT, jwtVerify } from 'jose';
import { AppError } from '@seo-os/shared';
import { getEnv } from '../../config/env.js';
import { getAssistedPackage } from '../browser-execution/assisted-manual.service.js';
import type { AssistedPackagePayload } from '@seo-os/backlink-builder';

const HANDOFF_AUD = 'seo-os-extension-handoff';
const HANDOFF_TYP = 'extension_handoff';
const HANDOFF_TTL_SEC = 60 * 30; // 30 minutes — session only, not permanent business storage

export type ExtensionPackageFields = {
  title: string;
  url: string;
  description: string;
  shortDescription: string;
  businessName: string;
  email: string;
  phone: string;
  category: string;
  facebook: string;
  linkedin: string;
  twitter: string;
  address: string;
  city: string;
  state: string;
  country: string;
  zip: string;
};

export type ExtensionCurrentOpportunity = {
  opportunityId: string;
  packageId: string;
  workspaceId: string;
  domain: string;
  entryUrl: string;
  package: ExtensionPackageFields;
  /** Architecture hook — future field-mapping memory key */
  learningKey: string;
};

type HandoffClaims = {
  typ: typeof HANDOFF_TYP;
  packageId: string;
  workspaceId: string;
  orgId: string;
  opportunityId: string;
  domain: string;
  entryUrl: string;
};

function secretKey(): Uint8Array {
  return new TextEncoder().encode(getEnv().SUPABASE_JWT_SECRET);
}

function fieldValue(
  payload: AssistedPackagePayload,
  role: string
): string {
  const fromFields = (payload.fields ?? []).find((f) => f.role === role)?.value;
  if (fromFields?.trim()) return fromFields.trim();
  const paste = (payload.pasteReadyContent ?? []).find((p) => p.role === role)?.value;
  return String(paste ?? '').trim();
}

function categoryValue(payload: AssistedPackagePayload): string {
  const cat = (payload.fields ?? []).find((f) => f.role === 'category');
  if (!cat) return '';
  // Deterministic only: recommended option or single confident value
  if (cat.recommendedOption?.trim()) return cat.recommendedOption.trim();
  if (cat.confidence === 'high' && cat.value?.trim()) return cat.value.trim();
  return '';
}

/** Map opportunity package → flat fill values (never workspace demo profile). */
export function mapAssistedToExtensionPackage(
  payload: AssistedPackagePayload
): ExtensionPackageFields {
  const shortDescription =
    fieldValue(payload, 'short_desc') || fieldValue(payload, 'short_description');
  const longDescription = fieldValue(payload, 'long_desc') || fieldValue(payload, 'description');
  return {
    title: fieldValue(payload, 'title'),
    url: fieldValue(payload, 'url'),
    description: longDescription || shortDescription,
    shortDescription,
    businessName: fieldValue(payload, 'business_name') || fieldValue(payload, 'name'),
    email: fieldValue(payload, 'email'),
    phone: fieldValue(payload, 'phone'),
    category: categoryValue(payload),
    facebook: fieldValue(payload, 'facebook'),
    linkedin: fieldValue(payload, 'linkedin'),
    twitter: fieldValue(payload, 'twitter'),
    address: fieldValue(payload, 'address'),
    city: fieldValue(payload, 'city'),
    state: fieldValue(payload, 'state'),
    country: fieldValue(payload, 'country'),
    zip: fieldValue(payload, 'zip') || fieldValue(payload, 'postal'),
  };
}

export async function createExtensionHandoff(input: {
  workspaceId: string;
  orgId: string;
  packageId: string;
}): Promise<{
  token: string;
  expiresAt: string;
  opportunityId: string;
  domain: string;
  entryUrl: string;
}> {
  const row = await getAssistedPackage(input.workspaceId, input.packageId);
  const opportunityId = String(row.opportunityId ?? '');
  const domain = String(row.domain ?? '');
  const entryUrl = String(row.entryUrl ?? '');
  if (!opportunityId || !entryUrl) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Package missing opportunity or entry URL');
  }

  const expiresAt = new Date(Date.now() + HANDOFF_TTL_SEC * 1000);
  const token = await new SignJWT({
    typ: HANDOFF_TYP,
    packageId: input.packageId,
    workspaceId: input.workspaceId,
    orgId: input.orgId,
    opportunityId,
    domain,
    entryUrl,
  } satisfies HandoffClaims)
    .setProtectedHeader({ alg: 'HS256' })
    .setAudience(HANDOFF_AUD)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(secretKey());

  return {
    token,
    expiresAt: expiresAt.toISOString(),
    opportunityId,
    domain,
    entryUrl,
  };
}

export async function resolveExtensionCurrentOpportunity(
  handoffToken: string
): Promise<ExtensionCurrentOpportunity> {
  let claims: HandoffClaims;
  try {
    const { payload } = await jwtVerify(handoffToken, secretKey(), {
      audience: HANDOFF_AUD,
    });
    if (payload.typ !== HANDOFF_TYP) {
      throw new Error('wrong typ');
    }
    claims = payload as unknown as HandoffClaims;
  } catch {
    throw new AppError(401, 'AUTH_INVALID_TOKEN', 'Invalid or expired extension handoff token');
  }

  const row = await getAssistedPackage(claims.workspaceId, claims.packageId);
  const payload = (row.package ?? {}) as AssistedPackagePayload;

  return {
    opportunityId: String(row.opportunityId ?? claims.opportunityId),
    packageId: String(row.id ?? claims.packageId),
    workspaceId: claims.workspaceId,
    domain: String(row.domain ?? claims.domain),
    entryUrl: String(row.entryUrl ?? claims.entryUrl),
    package: mapAssistedToExtensionPackage(payload),
    learningKey: `${claims.workspaceId}:${claims.domain}`,
  };
}

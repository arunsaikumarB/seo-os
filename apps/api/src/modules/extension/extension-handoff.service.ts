import { randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { AppError } from '@seo-os/shared';
import { getEnv } from '../../config/env.js';
import { getAssistedPackage } from '../browser-execution/assisted-manual.service.js';
import type { AssistedPackagePayload } from '@seo-os/backlink-builder';
import { logger } from '../../lib/logger.js';

const HANDOFF_AUD = 'backlink-agent-extension-handoff';
const HANDOFF_TYP = 'extension_handoff';
/** Short-lived single-use handoff — ~5 minutes */
const HANDOFF_TTL_SEC = 60 * 5;

/** jti → expiry ms; burned tokens are deleted on redeem */
const burnedJtis = new Map<string, number>();

function pruneBurned(): void {
  const now = Date.now();
  for (const [jti, exp] of burnedJtis) {
    if (exp <= now) burnedJtis.delete(jti);
  }
}

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
  connected: true;
  projectId: string;
  opportunityId: string;
  packageId: string;
  workspaceId: string;
  domain: string;
  entryUrl: string;
  package: ExtensionPackageFields;
  learningKey: string;
};

type HandoffClaims = {
  typ: typeof HANDOFF_TYP;
  jti: string;
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

function fieldValue(payload: AssistedPackagePayload, role: string): string {
  const fromFields = (payload.fields ?? []).find((f) => f.role === role)?.value;
  if (fromFields?.trim()) return fromFields.trim();
  const paste = (payload.pasteReadyContent ?? []).find((p) => p.role === role)?.value;
  return String(paste ?? '').trim();
}

function categoryValue(payload: AssistedPackagePayload): string {
  const cat = (payload.fields ?? []).find((f) => f.role === 'category');
  if (!cat) return '';
  if (cat.recommendedOption?.trim()) return cat.recommendedOption.trim();
  if (cat.confidence === 'high' && cat.value?.trim()) return cat.value.trim();
  return '';
}

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

function toCurrent(
  workspaceId: string,
  row: Awaited<ReturnType<typeof getAssistedPackage>>,
  claims: Pick<HandoffClaims, 'opportunityId' | 'packageId' | 'domain' | 'entryUrl' | 'workspaceId'>
): ExtensionCurrentOpportunity {
  const payload = (row.package ?? {}) as AssistedPackagePayload;
  const opportunityId = String(row.opportunityId ?? claims.opportunityId);
  const domain = String(row.domain ?? claims.domain);
  return {
    connected: true,
    projectId: workspaceId,
    opportunityId,
    packageId: String(row.id ?? claims.packageId),
    workspaceId,
    domain,
    entryUrl: String(row.entryUrl ?? claims.entryUrl),
    package: mapAssistedToExtensionPackage(payload),
    learningKey: `${workspaceId}:${domain}`,
  };
}

/**
 * Create a short-lived handoff. Returns the package in the response so the Backlink Agent
 * tab can hydrate Companion in-memory without burning the single-use token.
 * The directory tab redeems the token once via GET.
 */
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
  packageId: string;
  projectId: string;
  package: ExtensionPackageFields;
}> {
  pruneBurned();
  const row = await getAssistedPackage(input.workspaceId, input.packageId);
  const opportunityId = String(row.opportunityId ?? '');
  const domain = String(row.domain ?? '');
  const entryUrl = String(row.entryUrl ?? '');
  if (!opportunityId || !entryUrl) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Package missing opportunity or entry URL');
  }

  const jti = randomUUID();
  const expiresAt = new Date(Date.now() + HANDOFF_TTL_SEC * 1000);
  const token = await new SignJWT({
    typ: HANDOFF_TYP,
    jti,
    packageId: input.packageId,
    workspaceId: input.workspaceId,
    orgId: input.orgId,
    opportunityId,
    domain,
    entryUrl,
  } satisfies HandoffClaims)
    .setProtectedHeader({ alg: 'HS256' })
    .setAudience(HANDOFF_AUD)
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(secretKey());

  const current = toCurrent(input.workspaceId, row, {
    opportunityId,
    packageId: input.packageId,
    domain,
    entryUrl,
    workspaceId: input.workspaceId,
  });

  logger.info(
    { jti, opportunityId, domain, workspaceId: input.workspaceId, expiresAt: expiresAt.toISOString() },
    'extension handoff created'
  );

  return {
    token,
    expiresAt: expiresAt.toISOString(),
    opportunityId,
    domain,
    entryUrl,
    packageId: input.packageId,
    projectId: input.workspaceId,
    package: current.package,
  };
}

/**
 * Redeem handoff token (single-use). Burns jti after successful auth.
 */
export async function resolveExtensionCurrentOpportunity(
  handoffToken: string
): Promise<ExtensionCurrentOpportunity> {
  pruneBurned();

  let claims: HandoffClaims;
  let jti: string;
  try {
    const { payload } = await jwtVerify(handoffToken, secretKey(), {
      audience: HANDOFF_AUD,
    });
    if (payload.typ !== HANDOFF_TYP) {
      throw new Error('wrong typ');
    }
    jti = String(payload.jti ?? (payload as HandoffClaims).jti ?? '');
    if (!jti) throw new Error('missing jti');
    claims = payload as unknown as HandoffClaims;
  } catch {
    throw new AppError(
      401,
      'AUTH_INVALID_TOKEN',
      'Handoff expired or invalid. Please reopen the package from Backlink Agent.'
    );
  }

  if (burnedJtis.has(jti)) {
    throw new AppError(
      401,
      'AUTH_INVALID_TOKEN',
      'Handoff already used. Please reopen the package from Backlink Agent.'
    );
  }

  // Burn before fetch so concurrent double-redeem fails closed
  burnedJtis.set(jti, Date.now() + HANDOFF_TTL_SEC * 1000);

  try {
    const row = await getAssistedPackage(claims.workspaceId, claims.packageId);
    const result = toCurrent(claims.workspaceId, row, claims);
    logger.info(
      { jti, opportunityId: result.opportunityId, domain: result.domain },
      'extension handoff redeemed'
    );
    return result;
  } catch (err) {
    // Allow retry if package lookup failed (do not burn forever on infra blip)
    burnedJtis.delete(jti);
    throw err;
  }
}

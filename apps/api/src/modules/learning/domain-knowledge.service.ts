/**
 * Companion domain field-mapping knowledge — shared, deterministic, no AI.
 */
import { AppError } from '@seo-os/shared';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { logger } from '../../lib/logger.js';

const FILLABLE = new Set([
  'business_name',
  'title',
  'website',
  'email',
  'phone',
  'description',
  'address',
  'city',
  'state',
  'country',
  'zip',
  'category',
  'facebook',
  'linkedin',
  'twitter',
  'skip',
]);

/** Accept camelCase package keys from clients → FillableRole */
const MAP_ALIASES: Record<string, string> = {
  businessname: 'business_name',
  business_name: 'business_name',
  companyname: 'business_name',
  title: 'title',
  website: 'website',
  url: 'website',
  email: 'email',
  phone: 'phone',
  description: 'description',
  longdesc: 'description',
  address: 'address',
  city: 'city',
  state: 'state',
  country: 'country',
  zip: 'zip',
  postal: 'zip',
  category: 'category',
  facebook: 'facebook',
  linkedin: 'linkedin',
  twitter: 'twitter',
  skip: 'skip',
};

export type FieldMappingRow = {
  websiteField: string;
  mappedTo: string;
  confidence: number;
  verifiedBy: string;
  updatedAt: string;
};

export type DomainKnowledge = {
  domain: string;
  fieldMappings: FieldMappingRow[];
  categories: unknown[];
  wizardSteps: unknown[];
  verified: boolean;
  successCount: number;
  lastVerified: string | null;
  updatedAt: string | null;
  fieldCount: number;
};

export type DomainKnowledgeSummary = {
  domain: string;
  fieldCount: number;
  verified: boolean;
  verifiedPct: number;
  successCount: number;
  lastVerified: string | null;
  updatedAt: string | null;
};

function normalizeDomain(domain: string): string {
  let d = String(domain ?? '')
    .trim()
    .toLowerCase();
  d = d.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0] ?? d;
  return d;
}

function normalizeWebsiteField(raw: string): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

export function normalizeMappedTo(raw: string): string {
  const key = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  const compact = key.replace(/_/g, '');
  const mapped = MAP_ALIASES[key] ?? MAP_ALIASES[compact] ?? key;
  if (!FILLABLE.has(mapped)) {
    throw new AppError(400, 'VALIDATION_ERROR', `Invalid mappedTo: ${raw}`);
  }
  return mapped;
}

function rowToKnowledge(row: {
  domain: string;
  field_mappings: unknown;
  category_mapping: unknown;
  wizard_steps: unknown;
  verified: boolean;
  success_count: number;
  last_verified_at: string | null;
  updated_at: string | null;
}): DomainKnowledge {
  const fieldMappings = Array.isArray(row.field_mappings)
    ? (row.field_mappings as FieldMappingRow[])
    : [];
  return {
    domain: row.domain,
    fieldMappings,
    categories: Array.isArray(row.category_mapping) ? row.category_mapping : [],
    wizardSteps: Array.isArray(row.wizard_steps) ? row.wizard_steps : [],
    verified: Boolean(row.verified),
    successCount: Number(row.success_count ?? 0),
    lastVerified: row.last_verified_at,
    updatedAt: row.updated_at,
    fieldCount: fieldMappings.length,
  };
}

export async function getDomainKnowledge(
  orgId: string,
  domainRaw: string
): Promise<DomainKnowledge> {
  const domain = normalizeDomain(domainRaw);
  if (!domain) throw new AppError(400, 'VALIDATION_ERROR', 'domain required');

  const { data, error } = await getSupabaseAdmin()
    .from('companion_domain_knowledge')
    .select('*')
    .eq('org_id', orgId)
    .ilike('domain', domain)
    .maybeSingle();

  if (error) {
    logger.error({ err: error, orgId, domain }, 'getDomainKnowledge failed');
    throw new AppError(500, 'INTERNAL_ERROR', 'Failed to load domain knowledge');
  }

  if (!data) {
    return {
      domain,
      fieldMappings: [],
      categories: [],
      wizardSteps: [],
      verified: false,
      successCount: 0,
      lastVerified: null,
      updatedAt: null,
      fieldCount: 0,
    };
  }

  return rowToKnowledge(data);
}

export async function listDomainKnowledge(orgId: string): Promise<DomainKnowledgeSummary[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('companion_domain_knowledge')
    .select(
      'domain, field_mappings, verified, success_count, last_verified_at, updated_at'
    )
    .eq('org_id', orgId)
    .order('updated_at', { ascending: false });

  if (error) {
    logger.error({ err: error, orgId }, 'listDomainKnowledge failed');
    throw new AppError(500, 'INTERNAL_ERROR', 'Failed to list domain knowledge');
  }

  return (data ?? []).map((row) => {
    const mappings = Array.isArray(row.field_mappings)
      ? (row.field_mappings as FieldMappingRow[])
      : [];
    const verifiedCount = mappings.filter(
      (m) => Number(m.confidence) >= 1 || m.verifiedBy === 'user'
    ).length;
    const fieldCount = mappings.length;
    return {
      domain: row.domain,
      fieldCount,
      verified: Boolean(row.verified),
      verifiedPct: fieldCount ? Math.round((verifiedCount / fieldCount) * 100) : 0,
      successCount: Number(row.success_count ?? 0),
      lastVerified: row.last_verified_at,
      updatedAt: row.updated_at,
    };
  });
}

export async function upsertFieldMapping(input: {
  orgId: string;
  domain: string;
  websiteField: string;
  mappedTo: string;
  confidence?: number;
  verifiedBy?: string;
}): Promise<DomainKnowledge> {
  const domain = normalizeDomain(input.domain);
  const websiteField = normalizeWebsiteField(input.websiteField);
  const mappedTo = normalizeMappedTo(input.mappedTo);
  if (!domain || !websiteField) {
    throw new AppError(400, 'VALIDATION_ERROR', 'domain and websiteField required');
  }

  const confidence = Math.min(1, Math.max(0, Number(input.confidence ?? 1)));
  const verifiedBy = String(input.verifiedBy ?? 'user').slice(0, 64);
  const now = new Date().toISOString();

  const existing = await getDomainKnowledge(input.orgId, domain);
  const nextMappings = [...existing.fieldMappings];
  const idx = nextMappings.findIndex(
    (m) => normalizeWebsiteField(m.websiteField) === websiteField
  );
  const entry: FieldMappingRow = {
    websiteField,
    mappedTo,
    confidence,
    verifiedBy,
    updatedAt: now,
  };
  if (idx >= 0) nextMappings[idx] = entry;
  else nextMappings.push(entry);

  const verified = nextMappings.some((m) => m.verifiedBy === 'user' || m.confidence >= 1);
  const successCount = existing.successCount + (verifiedBy === 'user' ? 1 : 0);

  const { data, error } = await getSupabaseAdmin()
    .from('companion_domain_knowledge')
    .upsert(
      {
        org_id: input.orgId,
        domain,
        field_mappings: nextMappings,
        category_mapping: existing.categories,
        wizard_steps: existing.wizardSteps,
        verified,
        success_count: successCount,
        last_verified_at: now,
        updated_at: now,
      },
      { onConflict: 'org_id,domain' }
    )
    .select('*')
    .single();

  if (error) {
    // Unique index is on (org_id, lower(domain)) — fallback update by id if upsert key mismatch
    logger.warn({ err: error, domain }, 'upsert conflict path — trying update');
    const current = await getSupabaseAdmin()
      .from('companion_domain_knowledge')
      .select('id')
      .eq('org_id', input.orgId)
      .ilike('domain', domain)
      .maybeSingle();

    if (current.data?.id) {
      const { data: updated, error: upErr } = await getSupabaseAdmin()
        .from('companion_domain_knowledge')
        .update({
          field_mappings: nextMappings,
          verified,
          success_count: successCount,
          last_verified_at: now,
          updated_at: now,
        })
        .eq('id', current.data.id)
        .select('*')
        .single();
      if (upErr) {
        logger.error({ err: upErr }, 'update field mapping failed');
        throw new AppError(500, 'INTERNAL_ERROR', 'Failed to save field mapping');
      }
      logger.info(
        { orgId: input.orgId, domain, websiteField, mappedTo },
        'companion field mapping saved'
      );
      return rowToKnowledge(updated);
    }

    const { data: inserted, error: insErr } = await getSupabaseAdmin()
      .from('companion_domain_knowledge')
      .insert({
        org_id: input.orgId,
        domain,
        field_mappings: nextMappings,
        verified,
        success_count: successCount,
        last_verified_at: now,
        updated_at: now,
      })
      .select('*')
      .single();
    if (insErr) {
      logger.error({ err: insErr }, 'insert field mapping failed');
      throw new AppError(500, 'INTERNAL_ERROR', 'Failed to save field mapping');
    }
    logger.info(
      { orgId: input.orgId, domain, websiteField, mappedTo },
      'companion field mapping saved'
    );
    return rowToKnowledge(inserted);
  }

  logger.info(
    { orgId: input.orgId, domain, websiteField, mappedTo },
    'companion field mapping saved'
  );
  return rowToKnowledge(data);
}

export async function replaceDomainMappings(input: {
  orgId: string;
  domain: string;
  fieldMappings: Array<{ websiteField: string; mappedTo: string; confidence?: number }>;
}): Promise<DomainKnowledge> {
  const domain = normalizeDomain(input.domain);
  const now = new Date().toISOString();
  const fieldMappings: FieldMappingRow[] = input.fieldMappings.map((m) => ({
    websiteField: normalizeWebsiteField(m.websiteField),
    mappedTo: normalizeMappedTo(m.mappedTo),
    confidence: Math.min(1, Math.max(0, Number(m.confidence ?? 1))),
    verifiedBy: 'user',
    updatedAt: now,
  }));

  const existing = await getDomainKnowledge(input.orgId, domain);
  const { data, error } = await getSupabaseAdmin()
    .from('companion_domain_knowledge')
    .upsert(
      {
        org_id: input.orgId,
        domain,
        field_mappings: fieldMappings,
        category_mapping: existing.categories,
        wizard_steps: existing.wizardSteps,
        verified: fieldMappings.length > 0,
        success_count: existing.successCount,
        last_verified_at: now,
        updated_at: now,
      },
      { onConflict: 'org_id,domain' }
    )
    .select('*')
    .single();

  if (error) {
    // Same fallback as upsert
    const current = await getSupabaseAdmin()
      .from('companion_domain_knowledge')
      .select('id')
      .eq('org_id', input.orgId)
      .ilike('domain', domain)
      .maybeSingle();
    if (current.data?.id) {
      const { data: updated, error: upErr } = await getSupabaseAdmin()
        .from('companion_domain_knowledge')
        .update({
          field_mappings: fieldMappings,
          verified: fieldMappings.length > 0,
          last_verified_at: now,
          updated_at: now,
        })
        .eq('id', current.data.id)
        .select('*')
        .single();
      if (upErr) throw new AppError(500, 'INTERNAL_ERROR', 'Failed to replace mappings');
      return rowToKnowledge(updated);
    }
    throw new AppError(500, 'INTERNAL_ERROR', error.message);
  }

  return rowToKnowledge(data);
}

export async function deleteFieldMapping(input: {
  orgId: string;
  domain: string;
  websiteField: string;
}): Promise<DomainKnowledge> {
  const domain = normalizeDomain(input.domain);
  const websiteField = normalizeWebsiteField(input.websiteField);
  const existing = await getDomainKnowledge(input.orgId, domain);
  const next = existing.fieldMappings.filter(
    (m) => normalizeWebsiteField(m.websiteField) !== websiteField
  );
  return replaceDomainMappings({
    orgId: input.orgId,
    domain,
    fieldMappings: next,
  });
}

/**
 * Directory Form Intelligence — analyze / persist / review DirectoryFormSchema.
 * Reuses Form Reader HTML fetch paths; never auto-submits.
 */
import {
  applyDirectoryFieldReview,
  buildDirectoryFormSchema,
  detectDirectorySchemaDrift,
  normalizeSiteDomain,
  populateDirectoryFormFromProfile,
  type BusinessProfileForDirectory,
  type DirectoryCanonicalField,
  type DirectoryFormSchema,
  type SiteRecipe,
} from '@seo-os/backlink-builder';
import { AppError } from '@seo-os/shared';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { logger } from '../../lib/logger.js';
import { fetchRenderedHtml } from './browser-runtime.service.js';
import { getBrandContextForBee } from './bee-assets.js';

const admin = () => getSupabaseAdmin();

async function fetchHtmlForDirectory(url: string): Promise<{ html: string; finalUrl: string }> {
  // Prefer lightweight HTTP first
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 18_000);
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; SEO-OS-DirectoryForm/1.0; +https://seo-os.local)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    clearTimeout(t);
    const html = await res.text();
    if (html && html.length > 200 && /<form[\s>]/i.test(html)) {
      return { html, finalUrl: res.url || url };
    }
  } catch (err) {
    logger.warn({ err, url }, 'directory-form: HTTP fetch failed — trying browser');
  }

  const rendered = await fetchRenderedHtml(url, { timeoutMs: 30_000 });
  const html = String(rendered ?? '');
  if (!html.trim()) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Could not load directory submission page HTML');
  }
  return { html, finalUrl: url };
}

async function loadRecipe(
  workspaceId: string,
  domain: string
): Promise<{ profileId: string | null; recipe: SiteRecipe | null }> {
  const { data } = await admin()
    .from('site_profiles')
    .select('id, recipe')
    .eq('workspace_id', workspaceId)
    .eq('domain', domain)
    .maybeSingle();
  const recipe =
    data?.recipe && typeof data.recipe === 'object' ? (data.recipe as SiteRecipe) : null;
  return { profileId: data?.id ?? null, recipe };
}

async function saveSchemaOnRecipe(
  workspaceId: string,
  domain: string,
  schema: DirectoryFormSchema,
  baseRecipe: SiteRecipe | null
): Promise<void> {
  const recipe: SiteRecipe = baseRecipe
    ? { ...baseRecipe, directoryFormSchema: schema }
    : {
        domain,
        entryUrl: schema.directoryUrl,
        resolvedFormUrl: schema.submissionUrl,
        formFingerprint: schema.formFingerprint,
        fields: [],
        dropdownOptions: {},
        gate: (schema.gate as SiteRecipe['gate']) || 'none',
        notes: 'Directory form schema only',
        lastVerifiedAt: schema.analyzedAt,
        correctionCount: 0,
        multiStep: false,
        directoryFormSchema: schema,
      };

  const existing = await loadRecipe(workspaceId, domain);
  if (existing.profileId) {
    const { error } = await admin()
      .from('site_profiles')
      .update({ recipe, updated_at: new Date().toISOString() })
      .eq('id', existing.profileId);
    if (error) throw new AppError(500, 'INTERNAL_ERROR', error.message);
    return;
  }
  const { error } = await admin().from('site_profiles').insert({
    workspace_id: workspaceId,
    domain,
    recipe,
    profile_status: 'complete',
    fingerprint: {},
    learning: {},
    crawl_stats: { source: 'directory_form_intelligence' },
  });
  if (error) throw new AppError(500, 'INTERNAL_ERROR', error.message);
}

function profileFromBrand(brand: Awaited<ReturnType<typeof getBrandContextForBee>>): BusinessProfileForDirectory {
  return {
    businessName: brand.brandName ?? null,
    companyName: brand.companyName ?? brand.brandName ?? null,
    websiteUrl: brand.projectDomain ? `https://${brand.projectDomain}` : null,
    email: brand.contactEmail ?? null,
    phone: brand.contactPhone ?? null,
    streetAddress: null,
    city: null,
    state: null,
    postalCode: null,
    country: null,
    industry: brand.industry ?? null,
    category: brand.industry ?? null,
    title: brand.brandName ?? null,
    description: brand.tagline ?? null,
    facebookUrl: null,
    instagramUrl: null,
    twitterUrl: null,
    linkedinUrl: null,
    youtubeUrl: null,
    googleMapsUrl: null,
    logoUrl: null,
  };
}

/** Analyze a directory submission URL and persist DirectoryFormSchema. */
export async function analyzeDirectoryForm(input: {
  workspaceId: string;
  url: string;
  force?: boolean;
  businessCategory?: string | null;
}): Promise<{
  schema: DirectoryFormSchema;
  reused: boolean;
  drift: { changed: boolean; reasons: string[] } | null;
}> {
  const url = String(input.url ?? '').trim();
  if (!url) throw new AppError(400, 'VALIDATION_ERROR', 'url required');
  const domain = normalizeSiteDomain(url);
  if (!domain) throw new AppError(400, 'VALIDATION_ERROR', 'Could not parse domain from url');

  const existing = await loadRecipe(input.workspaceId, domain);
  const prior = existing.recipe?.directoryFormSchema ?? null;

  if (prior && !input.force) {
    const ageMs = Date.now() - new Date(prior.analyzedAt).getTime();
    const fresh = Number.isFinite(ageMs) && ageMs < 14 * 24 * 60 * 60 * 1000;
    if (fresh && prior.status !== 'stale') {
      const brand = await getBrandContextForBee(input.workspaceId);
      const populated = populateDirectoryFormFromProfile(prior, profileFromBrand(brand));
      return { schema: populated, reused: true, drift: null };
    }
  }

  const { html, finalUrl } = await fetchHtmlForDirectory(url);
  const brand = await getBrandContextForBee(input.workspaceId);
  let schema = buildDirectoryFormSchema({
    html,
    directoryUrl: url,
    submissionUrl: finalUrl,
    businessCategory: input.businessCategory || brand.industry || null,
  });
  schema = populateDirectoryFormFromProfile(schema, profileFromBrand(brand));

  const drift = prior ? detectDirectorySchemaDrift(prior, schema) : null;
  if (drift?.changed) {
    schema = { ...schema, status: 'stale', reviewRequired: true };
  }

  await saveSchemaOnRecipe(input.workspaceId, domain, schema, existing.recipe);
  logger.info(
    {
      workspaceId: input.workspaceId,
      domain,
      fieldCount: schema.fields.length,
      pattern: schema.formPatternHint,
      confidence: schema.overallConfidence,
      reused: false,
    },
    'directory-form: analyzed'
  );
  return { schema, reused: false, drift };
}

export async function getDirectoryFormSchema(
  workspaceId: string,
  domainRaw: string
): Promise<DirectoryFormSchema | null> {
  const domain = normalizeSiteDomain(domainRaw);
  if (!domain) throw new AppError(400, 'VALIDATION_ERROR', 'domain required');
  const { recipe } = await loadRecipe(workspaceId, domain);
  return recipe?.directoryFormSchema ?? null;
}

export async function reviewDirectoryFormSchema(input: {
  workspaceId: string;
  domain: string;
  corrections: Array<{ selector: string; canonicalField: string }>;
}): Promise<DirectoryFormSchema> {
  const domain = normalizeSiteDomain(input.domain);
  const { recipe } = await loadRecipe(input.workspaceId, domain);
  const prior = recipe?.directoryFormSchema;
  if (!prior) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'No directory form schema for domain');

  const corrections = input.corrections.map((c) => ({
    selector: c.selector,
    canonicalField: c.canonicalField as DirectoryCanonicalField,
  }));
  const reviewed = applyDirectoryFieldReview(prior, corrections);
  await saveSchemaOnRecipe(input.workspaceId, domain, reviewed, recipe);
  return reviewed;
}

export async function listDirectoryFormSchemas(
  workspaceId: string
): Promise<
  Array<{
    domain: string;
    submissionUrl: string;
    fieldCount: number;
    overallConfidence: number;
    status: string;
    formPatternHint: string | null;
    analyzedAt: string;
    reviewRequired: boolean;
  }>
> {
  const { data, error } = await admin()
    .from('site_profiles')
    .select('domain, recipe')
    .eq('workspace_id', workspaceId)
    .not('recipe', 'is', null)
    .limit(500);
  if (error) throw new AppError(500, 'INTERNAL_ERROR', error.message);

  const out: Array<{
    domain: string;
    submissionUrl: string;
    fieldCount: number;
    overallConfidence: number;
    status: string;
    formPatternHint: string | null;
    analyzedAt: string;
    reviewRequired: boolean;
  }> = [];

  for (const row of data ?? []) {
    const recipe = row.recipe as SiteRecipe | null;
    const schema = recipe?.directoryFormSchema;
    if (!schema) continue;
    out.push({
      domain: String(row.domain),
      submissionUrl: schema.submissionUrl,
      fieldCount: schema.fields.length,
      overallConfidence: schema.overallConfidence,
      status: schema.status,
      formPatternHint: schema.formPatternHint,
      analyzedAt: schema.analyzedAt,
      reviewRequired: schema.reviewRequired,
    });
  }
  return out.sort((a, b) => b.analyzedAt.localeCompare(a.analyzedAt));
}

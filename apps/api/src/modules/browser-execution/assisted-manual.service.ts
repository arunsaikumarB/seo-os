/**
 * Phase 7 — Assisted Manual packages + Site Recipes (pilot ≤10).
 * Additive: does not change Auto/Manual routing, CSM, Truth Engine, or BEE worker.
 * Never auto-submits or solves CAPTCHA/OTP/login.
 */
import {
  ASSISTED_MANUAL_PILOT_MAX,
  ASSISTED_PACKAGE_TTL_DAYS,
  ASSISTED_PREPARE_BATCH_MAX,
  applyHumanFieldCorrection,
  buildAssistedPackage,
  buildSiteRecipe,
  computeAssistedLaneCounts,
  evaluateFingerprintStatus,
  extractFormFieldFacts,
  findSimilarPackagePairs,
  normalizeSiteDomain,
  type AssistedPackagePayload,
  type FieldRole,
  type PackageStatus,
  type SiteRecipe,
} from '@seo-os/backlink-builder';
import { AppError } from '@seo-os/shared';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { logger } from '../../lib/logger.js';
import {
  getManualSubmissionsBoard,
  loadLaneEvidenceForWorkspace,
} from './manual-lane-backfill.service.js';
import { resolveItemLane } from '@seo-os/backlink-builder';

function admin() {
  return getSupabaseAdmin();
}

const PILOT_BATCH = 'assisted-content-ready';

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000),
      headers: {
        'User-Agent': 'SEO-OS-AssistedManual/1.0 (+form-reader; never submits)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('text/html') && !ct.includes('application/xhtml')) {
      const text = await res.text();
      return text.slice(0, 500_000);
    }
    return (await res.text()).slice(0, 500_000);
  } catch (err) {
    logger.warn({ err, url }, 'assisted-manual: fetch html failed');
    return null;
  }
}

function asRecipe(raw: unknown): SiteRecipe | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as SiteRecipe;
  if (!r.domain || !r.formFingerprint || !Array.isArray(r.fields)) return null;
  return r;
}

async function upsertRecipeOnProfile(
  workspaceId: string,
  domain: string,
  recipe: SiteRecipe
): Promise<void> {
  const { data: existing } = await admin()
    .from('site_profiles')
    .select('id, recipe')
    .eq('workspace_id', workspaceId)
    .eq('domain', domain)
    .maybeSingle();

  if (existing?.id) {
    await admin()
      .from('site_profiles')
      .update({ recipe, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
    return;
  }

  await admin().from('site_profiles').insert({
    workspace_id: workspaceId,
    domain,
    recipe,
    profile_status: 'complete',
    fingerprint: {},
    learning: {},
    crawl_stats: { source: 'assisted_manual_form_reader' },
  });
}

async function loadContentForOpportunity(opportunityId: string) {
  const { data: pack } = await admin()
    .from('content_packs')
    .select('pack')
    .eq('opportunity_id', opportunityId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  const p = (pack?.pack as Record<string, unknown> | null) ?? {};
  const { data: opp } = await admin()
    .from('opportunities')
    .select('title, domain, url, website_name, metadata')
    .eq('id', opportunityId)
    .maybeSingle();

  const meta = (opp?.metadata as Record<string, unknown> | null) ?? {};
  const enrichment = (meta.importEnrichment as Record<string, unknown> | null) ?? {};

  const longDesc = String(
    p.longDescription ?? p.body ?? p.businessDescription ?? enrichment.description ?? ''
  );
  const shortDesc = String(p.shortDescription ?? p.excerpt ?? longDesc.slice(0, 160));
  const businessName = String(
    p.businessName ?? opp?.website_name ?? opp?.title ?? opp?.domain ?? ''
  );
  const images = Array.isArray(p.suggestedImages) ? p.suggestedImages : [];
  const imageFileName =
    typeof images[0] === 'string'
      ? String(images[0]).split('/').pop()
      : `${(businessName || 'listing').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}-listing.jpg`;

  return {
    title: String(p.seoTitle ?? p.headline ?? opp?.title ?? ''),
    shortDescription: shortDesc,
    longDescription: longDesc,
    businessName,
    url: String(p.website ?? opp?.url ?? ''),
    email: String(p.email ?? ''),
    phone: String(p.phone ?? ''),
    address: String(p.address ?? ''),
    categoryHints: Array.isArray(p.categorySuggestions)
      ? (p.categorySuggestions as string[])
      : [businessName, String(p.backlinkType ?? '')],
    imageFileName,
  };
}

/** Prepare Assisted Manual packages for every content-ready site (not Manual-only). */
export async function prepareAssistedPackages(
  workspaceId: string,
  opts: { opportunityIds?: string[]; entryUrlOverrides?: Record<string, string> } = {}
) {
  const contentReadyIds = await listContentReadyOpportunityIds(workspaceId);
  const readySet = new Set(contentReadyIds);

  let targetIds = opts.opportunityIds?.length
    ? opts.opportunityIds.filter((id) => readySet.has(id) || contentReadyIds.length === 0)
    : contentReadyIds;

  // If explicit IDs requested but not yet in content-ready set, still allow (re-prepare)
  if (opts.opportunityIds?.length) {
    targetIds = [...new Set(opts.opportunityIds)];
  }

  targetIds = targetIds.slice(0, ASSISTED_PREPARE_BATCH_MAX);

  const prepared: unknown[] = [];
  const errors: Array<{ opportunityId: string; error: string }> = [];

  for (const opportunityId of targetIds) {
    try {
      const pkg = await prepareOnePackage(workspaceId, opportunityId, {
        entryUrlOverride: opts.entryUrlOverrides?.[opportunityId],
      });
      prepared.push(pkg);
    } catch (err) {
      errors.push({
        opportunityId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  await enforceSimilarity(workspaceId);

  return {
    prepared: prepared.length,
    errors,
    totalCandidates: contentReadyIds.length,
    packages: await listAssistedPackages(workspaceId),
  };
}

/** @deprecated Use prepareAssistedPackages — alias kept for older callers */
export const prepareAssistedPilot = prepareAssistedPackages;

/** Single-site prepare after content generation handoff (fire-and-forget safe). */
export async function prepareAssistedForOpportunity(
  workspaceId: string,
  opportunityId: string
) {
  const saved = await prepareOnePackage(workspaceId, opportunityId);
  await enforceSimilarity(workspaceId).catch((err) =>
    logger.warn({ err, workspaceId }, 'assisted similarity check failed')
  );
  return saved;
}

async function listContentReadyOpportunityIds(workspaceId: string): Promise<string[]> {
  const ids = new Set<string>();

  const { data: packs } = await admin()
    .from('content_packs')
    .select('opportunity_id')
    .eq('workspace_id', workspaceId)
    .limit(ASSISTED_PREPARE_BATCH_MAX);
  for (const p of packs ?? []) {
    if (p.opportunity_id) ids.add(String(p.opportunity_id));
  }

  const { data: opps } = await admin()
    .from('opportunities')
    .select('id, campaign_lifecycle, generation_status')
    .eq('workspace_id', workspaceId)
    .neq('campaign_lifecycle', 'Deleted')
    .not('automation_status', 'in', '("deleted","ignored")')
    .limit(ASSISTED_PREPARE_BATCH_MAX);

  for (const o of opps ?? []) {
    const life = String(o.campaign_lifecycle ?? '');
    const gen = String(o.generation_status ?? '');
    if (
      life === 'Package Generated' ||
      life === 'Ready' ||
      gen === 'Completed' ||
      gen === 'Needs Review'
    ) {
      ids.add(String(o.id));
    }
  }

  return [...ids].slice(0, ASSISTED_PREPARE_BATCH_MAX);
}

async function prepareOnePackage(
  workspaceId: string,
  opportunityId: string,
  opts: { entryUrlOverride?: string } = {}
) {
  const { data: opp } = await admin()
    .from('opportunities')
    .select('id, domain, url, website_name, title, metadata, site_profile_id')
    .eq('id', opportunityId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (!opp) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Opportunity not found');

  const meta = (opp.metadata as Record<string, unknown> | null) ?? {};
  const domain = normalizeSiteDomain(String(opp.domain ?? opp.url ?? ''));
  const entryUrl =
    opts.entryUrlOverride ||
    String(meta.divertedUrl ?? meta.entryUrl ?? opp.url ?? `https://${domain}`);

  const { data: profile } = await admin()
    .from('site_profiles')
    .select('id, recipe')
    .eq('workspace_id', workspaceId)
    .eq('domain', domain)
    .maybeSingle();

  const existingRecipe = asRecipe(profile?.recipe);
  const html = await fetchHtml(entryUrl);
  const formFound = Boolean(html && extractFormFieldFacts(html).length > 0);

  const recipe = html
    ? buildSiteRecipe({
        domain,
        entryUrl,
        html,
        existing: existingRecipe,
      })
    : (existingRecipe ??
      ({
        domain,
        entryUrl,
        formFingerprint: 'fp_missing',
        fields: [],
        dropdownOptions: {},
        gate: 'none',
        notes: 'No form HTML fetched',
        lastVerifiedAt: new Date().toISOString(),
        correctionCount: 0,
        multiStep: false,
      } satisfies SiteRecipe));

  await upsertRecipeOnProfile(workspaceId, domain, recipe);

  const content = await loadContentForOpportunity(opportunityId);
  const preparedAt = new Date().toISOString();
  const expiresAt = new Date(
    Date.now() + ASSISTED_PACKAGE_TTL_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  const payload = buildAssistedPackage({
    recipe,
    content,
    preparedAt,
    fingerprintStatus: 'fresh',
    formFound,
  });

  // Block use if over-limit values remain after fit
  if (payload.fields.some((f) => f.overLimit)) {
    payload.bucket = 'needs_person';
    payload.failureReason = 'Content exceeds known character limit — regenerate or edit';
  }

  const row = {
    workspace_id: workspaceId,
    opportunity_id: opportunityId,
    domain,
    entry_url: entryUrl,
    form_fingerprint: recipe.formFingerprint,
    prepared_at: preparedAt,
    expires_at: expiresAt,
    bucket: payload.bucket,
    status: payload.status,
    gate: payload.gate,
    fingerprint_status: payload.fingerprintStatus,
    payload,
    correction_count: recipe.correctionCount,
    pilot_batch_id: PILOT_BATCH,
    failure_reason: payload.failureReason,
    updated_at: new Date().toISOString(),
  };

  const { data: saved, error } = await admin()
    .from('assisted_packages')
    .upsert(row, { onConflict: 'workspace_id,opportunity_id' })
    .select('*')
    .single();
  if (error) throw new AppError(500, 'INTERNAL_ERROR', error.message);

  await admin()
    .from('opportunities')
    .update({ assisted_package_id: saved.id })
    .eq('id', opportunityId);

  return saved;
}

async function enforceSimilarity(workspaceId: string) {
  const { data: rows } = await admin()
    .from('assisted_packages')
    .select('id, payload')
    .eq('workspace_id', workspaceId)
    .eq('pilot_batch_id', PILOT_BATCH);
  if (!rows?.length) return;

  const texts = rows.map((r) => {
    const p = r.payload as AssistedPackagePayload;
    const desc =
      p.fields?.find((f) => f.role === 'long_desc')?.value ||
      p.fields?.find((f) => f.role === 'short_desc')?.value ||
      '';
    return { id: String(r.id), text: desc };
  });

  const pairs = findSimilarPackagePairs(texts);
  for (const pair of pairs) {
    // Mark the later package for regenerate (needs_person) — do not silently ship duplicates
    await admin()
      .from('assisted_packages')
      .update({
        bucket: 'needs_person',
        failure_reason: `Duplicate content vs another package (similarity ≥ 0.85) — regenerate`,
        fingerprint_status: 'fresh',
        updated_at: new Date().toISOString(),
        metrics: { similarityPair: pair },
      })
      .eq('id', pair.b);
  }
}

export async function listAssistedPackages(workspaceId: string) {
  const { data: rows } = await admin()
    .from('assisted_packages')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('prepared_at', { ascending: false });

  const packages = [];
  for (const row of rows ?? []) {
    // List: TTL-only freshness (network re-check on open/export)
    const preparedAt = String(row.prepared_at);
    const status = evaluateFingerprintStatus({
      preparedAt,
      storedFingerprint: String(row.form_fingerprint),
      liveFingerprint: null,
    });
    let current = row;
    if (status === 'stale' && row.fingerprint_status !== 'stale') {
      const payload = {
        ...(row.payload as AssistedPackagePayload),
        fingerprintStatus: 'stale' as const,
        bucket: 'needs_person' as const,
        failureReason: 'Package expired — re-prepare',
      };
      const { data: updated } = await admin()
        .from('assisted_packages')
        .update({
          fingerprint_status: 'stale',
          bucket: 'needs_person',
          failure_reason: payload.failureReason,
          payload,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id)
        .select('*')
        .single();
      current = updated ?? row;
    }
    packages.push(formatPackageRow(current));
  }

  const board = await getManualSubmissionsBoard(workspaceId);
  const packageOppIds = new Set(packages.map((p) => String(p.opportunityId)));
  const manualWithPackage = (board.items ?? []).filter(
    (i): i is NonNullable<typeof i> => i != null && packageOppIds.has(i.id)
  ).length;

  const assistedCounts = computeAssistedLaneCounts({
    automatable: board.counts.automatable,
    manualTotal: board.counts.manual,
    assistedPackages: packages.map((p) => ({
      bucket: p.bucket as 'ready' | 'check_fields' | 'needs_person',
    })),
    manualWithPackage,
  });

  return {
    honesty: [
      'Does not submit anything automatically.',
      'Does not solve CAPTCHA / OTP / login — you clear those on the site.',
      'Does not guarantee the listing goes live.',
      'Does not fully prepare multi-step forms.',
      'Does not attach images for you.',
    ],
    pilot: {
      max: ASSISTED_MANUAL_PILOT_MAX,
      used: packages.length,
      batchId: PILOT_BATCH,
      canAdd: true,
      note: 'Every content-ready site gets a package after generation. Auto-publish stays off.',
    },
    counts: assistedCounts,
    laneConservation: board.conservation,
    packages,
  };
}

async function refreshPackageFreshness(row: Record<string, unknown>) {
  const preparedAt = String(row.prepared_at);
  const storedFp = String(row.form_fingerprint);
  const entryUrl = String(row.entry_url);
  const payload = row.payload as AssistedPackagePayload;

  // TTL check without network
  let status = evaluateFingerprintStatus({
    preparedAt,
    storedFingerprint: storedFp,
    liveFingerprint: null,
  });

  // Re-fetch only when opening/listing if not already changed
  if (status === 'fresh') {
    const html = await fetchHtml(entryUrl);
    if (html) {
      const liveFp = buildSiteRecipe({
        domain: String(row.domain),
        entryUrl,
        html,
      }).formFingerprint;
      status = evaluateFingerprintStatus({
        preparedAt,
        storedFingerprint: storedFp,
        liveFingerprint: liveFp,
      });
    }
  }

  if (status !== row.fingerprint_status) {
    const nextPayload = {
      ...payload,
      fingerprintStatus: status,
      bucket:
        status === 'changed' || status === 'stale' ? 'needs_person' : payload.bucket,
      failureReason:
        status === 'changed'
          ? 'Form changed — re-prepare'
          : status === 'stale'
            ? 'Package expired — re-prepare'
            : payload.failureReason,
    };
    const { data: updated } = await admin()
      .from('assisted_packages')
      .update({
        fingerprint_status: status,
        bucket: nextPayload.bucket,
        failure_reason: nextPayload.failureReason,
        payload: nextPayload,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)
      .select('*')
      .single();
    return updated ?? row;
  }
  return row;
}

function formatPackageRow(row: Record<string, unknown>) {
  const payload = (row.payload as AssistedPackagePayload) ?? ({} as AssistedPackagePayload);
  return {
    id: row.id,
    opportunityId: row.opportunity_id,
    domain: row.domain,
    entryUrl: row.entry_url,
    bucket: row.bucket,
    status: row.status,
    gate: row.gate,
    fingerprintStatus: row.fingerprint_status,
    preparedAt: row.prepared_at,
    expiresAt: row.expires_at,
    correctionCount: row.correction_count,
    minutesSpent: row.minutes_spent,
    rejectedAtSubmit: row.rejected_at_submit,
    failureReason: row.failure_reason,
    pilotBatchId: row.pilot_batch_id,
    package: payload,
  };
}

export async function getAssistedPackage(workspaceId: string, packageId: string) {
  const { data: row } = await admin()
    .from('assisted_packages')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('id', packageId)
    .maybeSingle();
  if (!row) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Package not found');
  const refreshed = await refreshPackageFreshness(row);
  // Block stale/changed from use
  if (
    refreshed.fingerprint_status === 'changed' ||
    refreshed.fingerprint_status === 'stale'
  ) {
    return {
      ...formatPackageRow(refreshed),
      blocked: true,
      blockReason: String(refreshed.failure_reason ?? 'Re-prepare required'),
    };
  }
  return { ...formatPackageRow(refreshed), blocked: false };
}

export async function updateAssistedPackageStatus(
  workspaceId: string,
  packageId: string,
  body: {
    status?: PackageStatus;
    minutesSpent?: number;
    rejectedAtSubmit?: boolean;
  }
) {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.status) patch.status = body.status;
  if (body.minutesSpent != null) patch.minutes_spent = body.minutesSpent;
  if (body.rejectedAtSubmit != null) patch.rejected_at_submit = body.rejectedAtSubmit;

  const { data, error } = await admin()
    .from('assisted_packages')
    .update(patch)
    .eq('workspace_id', workspaceId)
    .eq('id', packageId)
    .select('*')
    .single();
  if (error) throw new AppError(500, 'INTERNAL_ERROR', error.message);
  return formatPackageRow(data);
}

export async function correctAssistedField(
  workspaceId: string,
  packageId: string,
  body: { selector: string; role?: FieldRole; markPackageGood?: boolean }
) {
  const { data: row } = await admin()
    .from('assisted_packages')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('id', packageId)
    .maybeSingle();
  if (!row) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Package not found');

  const domain = String(row.domain);
  const { data: profile } = await admin()
    .from('site_profiles')
    .select('id, recipe')
    .eq('workspace_id', workspaceId)
    .eq('domain', domain)
    .maybeSingle();

  let recipe = asRecipe(profile?.recipe);
  if (!recipe) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Site recipe missing — re-prepare first');
  }

  if (body.markPackageGood) {
    recipe = {
      ...recipe,
      correctionCount: recipe.correctionCount,
      lastVerifiedAt: new Date().toISOString(),
      notes: [recipe.notes, 'Package marked good'].filter(Boolean).join(' · '),
    };
  } else {
    recipe = applyHumanFieldCorrection(recipe, {
      selector: body.selector,
      role: body.role,
    });
  }

  await upsertRecipeOnProfile(workspaceId, domain, recipe);

  // Re-build package values with corrected recipe (no re-fetch required)
  const content = await loadContentForOpportunity(String(row.opportunity_id));
  const payload = buildAssistedPackage({
    recipe,
    content,
    preparedAt: String(row.prepared_at),
    fingerprintStatus: row.fingerprint_status as 'fresh' | 'stale' | 'changed',
    formFound: true,
    status: row.status as PackageStatus,
  });

  const { data: updated, error } = await admin()
    .from('assisted_packages')
    .update({
      payload,
      bucket: payload.bucket,
      correction_count: recipe.correctionCount,
      failure_reason: payload.failureReason,
      updated_at: new Date().toISOString(),
    })
    .eq('id', packageId)
    .select('*')
    .single();
  if (error) throw new AppError(500, 'INTERNAL_ERROR', error.message);

  return formatPackageRow(updated);
}

export async function getAssistedPilotMetrics(workspaceId: string) {
  const { data: rows } = await admin()
    .from('assisted_packages')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('pilot_batch_id', PILOT_BATCH);

  const list = rows ?? [];
  const withMinutes = list.filter((r) => r.minutes_spent != null);
  const minutes = withMinutes.map((r) => Number(r.minutes_spent)).sort((a, b) => a - b);
  const median =
    minutes.length === 0
      ? null
      : minutes.length % 2 === 1
        ? minutes[(minutes.length - 1) / 2]
        : (minutes[minutes.length / 2 - 1]! + minutes[minutes.length / 2]!) / 2;

  const corrected = list.filter((r) => Number(r.correction_count) > 0).length;
  const ready = list.filter((r) => r.bucket === 'ready').length;
  const checkFields = list.filter((r) => r.bucket === 'check_fields').length;
  const needsPerson = list.filter((r) => r.bucket === 'needs_person').length;
  const rejected = list.filter((r) => r.rejected_at_submit === true).length;

  return {
    pilotMax: ASSISTED_MANUAL_PILOT_MAX,
    n: list.length,
    medianMinutesPerSite: median,
    targetMedianMinutes: 4,
    correctionRate: list.length ? corrected / list.length : null,
    targetCorrectionRate: 0.2,
    bucketMix: { ready, checkFields, needsPerson },
    rejectionRate: list.length ? rejected / list.length : null,
    learning: {
      note: 'Re-prepare the same 10 after corrections; correction rate must drop on second pass.',
      totalCorrections: list.reduce((s, r) => s + Number(r.correction_count ?? 0), 0),
    },
    goNoGo: {
      medianOk: median != null && median <= 4,
      correctionOk: list.length ? corrected / list.length <= 0.2 : false,
      learningPending: true,
    },
  };
}

/** Excel export for Assisted Manual packages (standalone team artifact). */
export async function exportAssistedPackagesWorkbook(workspaceId: string) {
  const ExcelJS = await import('exceljs');
  const board = await listAssistedPackages(workspaceId);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SEO OS Phase 7';
  const sheet = wb.addWorksheet('Assisted Manual');

  sheet.addRow([
    'Website',
    'Bucket',
    'Status',
    'Entry URL',
    'Gate',
    'Gate Notes',
    'Fingerprint',
    'Prepared At',
    'Field Label',
    'Role',
    'Value',
    'Chars',
    'Max',
    'Confidence',
    'Dropdown Recommendation',
    'Options',
    'Human Step',
    'Failure Reason',
    'Corrections',
  ]);

  for (const pkg of board.packages) {
    const fields = pkg.package?.fields?.length
      ? pkg.package.fields
      : [
          {
            label: '',
            role: '',
            value: '',
            charCount: 0,
            maxlength: null,
            confidence: '',
            recommendedOption: null,
            options: [],
            humanStep: null,
          },
        ];
    for (const f of fields) {
      sheet.addRow([
        pkg.domain,
        pkg.bucket,
        pkg.status,
        pkg.entryUrl,
        pkg.gate,
        pkg.package?.gateNotes ?? '',
        pkg.fingerprintStatus,
        pkg.preparedAt,
        f.label,
        f.role,
        f.value,
        f.charCount,
        f.maxlength ?? '',
        f.confidence,
        f.recommendedOption ?? '',
        (f.options ?? []).join(' | '),
        f.humanStep ?? '',
        pkg.failureReason ?? '',
        pkg.correctionCount,
      ]);
    }
  }

  const honesty = wb.addWorksheet('Honesty');
  honesty.addRow(['Phase 7 does NOT:']);
  for (const line of board.honesty) honesty.addRow([line]);

  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  return {
    body: buf,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    filename: 'assisted-manual-packages.xlsx',
  };
}

/** Lane + package summary for Import / Submit / Track / Health. */
export async function getAssistedLaneSummary(workspaceId: string) {
  const evidence = await loadLaneEvidenceForWorkspace(workspaceId);
  let automatable = 0;
  let manualTotal = 0;
  const manualIds = new Set<string>();
  for (const row of evidence) {
    const resolved = resolveItemLane(row);
    if (!resolved.inActiveCohort) continue;
    if (resolved.lane === 'auto') automatable++;
    else {
      manualTotal++;
      manualIds.add(row.id);
    }
  }

  const { data: pkgs } = await admin()
    .from('assisted_packages')
    .select('bucket, opportunity_id')
    .eq('workspace_id', workspaceId);

  const manualWithPackage = (pkgs ?? []).filter((p) =>
    manualIds.has(String(p.opportunity_id))
  ).length;

  return computeAssistedLaneCounts({
    automatable,
    manualTotal,
    assistedPackages: (pkgs ?? []).map((p) => ({
      bucket: p.bucket as 'ready' | 'check_fields' | 'needs_person',
    })),
    manualWithPackage,
  });
}

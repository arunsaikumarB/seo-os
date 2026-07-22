/**
 * Phase 6.3.1 — Backfill Manual diversion from EXISTING gate/Unsupported evidence.
 * Does not re-run Truth Engine / SIE detection — only stamps lanes + diverts live jobs.
 */
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { logger } from '../../lib/logger.js';
import {
  inferManualReasonFromEvidence,
  isLaneTerminalExcluded,
  manualReasonFromGate,
  readLaneMeta,
  resolveItemLane,
  type ManualEvidenceInput,
  type ManualReason,
} from '@seo-os/backlink-builder';
import { listCampaignItems, type CampaignItemRow } from '../campaigns/campaign-state.service.js';

export type LaneEvidenceRow = ManualEvidenceInput & {
  id: string;
  websiteUrl?: string | null;
  domain?: string | null;
  jobId?: string | null;
};

function gateFromReason(reason: ManualReason): string {
  switch (reason) {
    case 'CAPTCHA':
      return 'captcha';
    case 'Login':
      return 'login';
    case 'Registration':
      return 'registration';
    case 'Cloudflare':
      return 'cloudflare';
    case 'OTP':
      return 'otp';
    case 'Manual Approval':
      return 'human_approval';
    case 'Unsupported':
      return 'unsupported';
    case 'Unclassified':
      return 'unclassified';
    default:
      return 'unclassified';
  }
}

function requiresHumanFromMeta(meta: Record<string, unknown>): boolean {
  const sie = (meta.siteIntelligence as Record<string, unknown> | null) ?? null;
  if (sie?.requiresHuman === true) return true;
  const anti = (sie?.antiSpam as Record<string, unknown> | null) ?? null;
  if (anti?.requiresHuman === true) return true;
  const contact = (meta.contactForm as Record<string, unknown> | null) ?? null;
  const cfAnti = (contact?.antiSpam as Record<string, unknown> | null) ?? null;
  if (cfAnti?.requiresHuman === true) return true;
  if (meta.captchaRequired === true || meta.requiresHuman === true) return true;
  return false;
}

function strategyChosenFromMeta(meta: Record<string, unknown>): string | null {
  const sie = (meta.siteIntelligence as Record<string, unknown> | null) ?? null;
  if (sie?.strategy != null) return String(sie.strategy);
  const strat = (meta.strategy as Record<string, unknown> | null) ?? null;
  if (strat?.chosen != null) return String(strat.chosen);
  if (meta.workflowQueue === 'Unsupported') return 'Unsupported';
  return null;
}

/** Load job + site-profile evidence for each Campaign Item (batch). */
export async function loadLaneEvidenceForWorkspace(
  workspaceId: string
): Promise<LaneEvidenceRow[]> {
  const items = await listCampaignItems(workspaceId, { includeDeleted: false });
  return attachLaneEvidence(workspaceId, items);
}

export async function attachLaneEvidence(
  workspaceId: string,
  items: CampaignItemRow[]
): Promise<LaneEvidenceRow[]> {
  if (!items.length) return [];

  const ids = items.map((i) => i.id);
  const domains = [
    ...new Set(
      items
        .map((i) => String(i.domain ?? '').toLowerCase().replace(/^www\./, ''))
        .filter(Boolean)
    ),
  ];

  const jobsByOpp = new Map<
    string,
    {
      id: string;
      status: string;
      disposition: string | null;
      pause_reason: string | null;
      truth_claim: string | null;
      unclassified: boolean | null;
    }
  >();
  const profileByDomain = new Map<string, string>();

  const [{ data: jobs }, { data: profiles }] = await Promise.all([
    getSupabaseAdmin()
      .from('execution_jobs')
      .select(
        'id, opportunity_id, status, disposition, pause_reason, truth_claim, unclassified, created_at'
      )
      .eq('workspace_id', workspaceId)
      .in('opportunity_id', ids)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    domains.length
      ? getSupabaseAdmin()
          .from('site_profiles')
          .select('domain, profile_status')
          .eq('workspace_id', workspaceId)
          .in('domain', domains)
      : Promise.resolve({ data: [] as Array<{ domain: string; profile_status: string }> }),
  ]);

  for (const j of jobs ?? []) {
    const oid = j.opportunity_id ? String(j.opportunity_id) : '';
    if (oid && !jobsByOpp.has(oid)) {
      jobsByOpp.set(oid, {
        id: String(j.id),
        status: String(j.status),
        disposition: j.disposition != null ? String(j.disposition) : null,
        pause_reason: j.pause_reason != null ? String(j.pause_reason) : null,
        truth_claim: j.truth_claim != null ? String(j.truth_claim) : null,
        unclassified: j.unclassified === true,
      });
    }
  }
  for (const p of profiles ?? []) {
    const d = String(p.domain ?? '')
      .toLowerCase()
      .replace(/^www\./, '');
    if (d) profileByDomain.set(d, String(p.profile_status));
  }

  return items.map((item) => {
    const meta = (item.metadata as Record<string, unknown> | null) ?? {};
    const job = jobsByOpp.get(item.id);
    const domainKey = String(item.domain ?? '')
      .toLowerCase()
      .replace(/^www\./, '');
    const metaClaim =
      meta.truthClaim != null
        ? String(meta.truthClaim)
        : meta.truth_claim != null
          ? String(meta.truth_claim)
          : null;
    return {
      id: item.id,
      websiteUrl: item.websiteUrl,
      domain: item.domain,
      currentStatus: item.currentStatus,
      metadata: meta,
      jobId: job?.id ?? null,
      jobStatus: job?.status ?? null,
      jobDisposition: job?.disposition ?? null,
      pauseReason: job?.pause_reason ?? (meta.divertedGate != null ? String(meta.divertedGate) : null),
      truthClaim: job?.truth_claim ?? metaClaim,
      unclassified: job?.unclassified === true || meta.unclassified === true,
      profileStatus: profileByDomain.get(domainKey) ?? null,
      requiresHuman: requiresHumanFromMeta(meta),
      strategyChosen: strategyChosenFromMeta(meta),
    };
  });
}

async function stampOpportunityManual(
  workspaceId: string,
  opportunityId: string,
  reason: ManualReason,
  gate: string,
  prevMeta: Record<string, unknown>
) {
  const { updateCampaignItem } = await import('../campaigns/campaign-state.service.js');
  const nextStatus =
    prevMeta.laneSticky === true && String(prevMeta.submissionLane) === 'manual'
      ? undefined
      : ('Skipped' as const);

  try {
    if (nextStatus) {
      await updateCampaignItem(workspaceId, opportunityId, {
        currentStatus: nextStatus,
        submissionStatus: 'Skipped',
        lastError: `Manual — ${reason}`,
        force: true,
      });
    }
  } catch {
    /* lifecycle optional — metadata stamp is authoritative for lanes */
  }

  await getSupabaseAdmin()
    .from('opportunities')
    .update({
      metadata: {
        ...prevMeta,
        submissionLane: 'manual',
        manualReason: reason,
        laneSource: 'backfill_existing_gate',
        laneSticky: true,
        divertedGate: gate,
        truthClaim: prevMeta.truthClaim ?? reason,
      },
      automation_status: 'manual_offline',
      updated_at: new Date().toISOString(),
    })
    .eq('id', opportunityId)
    .eq('workspace_id', workspaceId);
}

/**
 * Stamp Manual on every active item that already has gate/Unsupported evidence,
 * and divert live Waiting-Human / watching_* jobs via divertToManualOffline.
 */
export async function backfillManualLanes(workspaceId: string): Promise<{
  scanned: number;
  stamped: number;
  diverted: number;
  skippedTerminal: number;
}> {
  const evidence = await loadLaneEvidenceForWorkspace(workspaceId);
  let stamped = 0;
  let diverted = 0;
  let skippedTerminal = 0;

  const LIVE_JOB =
    /^(waiting_human|needs_approval|watching_|blocked_|paused|running|queued|starting)/i;

  for (const row of evidence) {
    if (isLaneTerminalExcluded(row.currentStatus)) {
      skippedTerminal++;
      continue;
    }

    const meta = readLaneMeta(row.metadata ?? null);
    const reason = inferManualReasonFromEvidence(row);
    if (!reason) continue;

    // Already sticky Manual with same (or any) reason — still divert live jobs if needed
    const alreadyManual = meta.submissionLane === 'manual' && meta.laneSticky === true;
    const gate = row.pauseReason
      ? String(row.pauseReason)
      : gateFromReason(reason);

    if (!alreadyManual) {
      await stampOpportunityManual(
        workspaceId,
        row.id,
        reason,
        gate,
        (row.metadata as Record<string, unknown>) ?? {}
      );
      stamped++;
    }

    const jobStatus = String(row.jobStatus ?? '');
    const jobId = row.jobId;
    if (jobId && LIVE_JOB.test(jobStatus)) {
      try {
        const { divertToManualOffline } = await import('./bee-intervention-actions.service.js');
        await divertToManualOffline(workspaceId, jobId, {
          gate,
          truthClaim: row.truthClaim ?? null,
          reason,
          pausedUrl: row.websiteUrl ?? null,
        });
        diverted++;
      } catch (err) {
        logger.warn(
          { err, jobId, opportunityId: row.id },
          'manual lane backfill: divert failed (metadata already stamped)'
        );
      }
    }
  }

  logger.info(
    { workspaceId, scanned: evidence.length, stamped, diverted, skippedTerminal },
    'manual lane backfill complete'
  );

  return { scanned: evidence.length, stamped, diverted, skippedTerminal };
}

/** Build evidence rows + counts for API (runs backfill first). */
export async function getManualSubmissionsBoard(workspaceId: string) {
  await backfillManualLanes(workspaceId);
  const evidence = await loadLaneEvidenceForWorkspace(workspaceId);
  const { computeAutoManualCounts } = await import('@seo-os/backlink-builder');
  const counts = computeAutoManualCounts(evidence);

  const items = evidence
    .map((row) => {
      const resolved = resolveItemLane(row);
      if (!resolved.inActiveCohort || resolved.lane !== 'manual') return null;
      const meta = (row.metadata as Record<string, unknown>) ?? {};
      const sie = (meta.siteIntelligence as Record<string, unknown> | null) ?? {};
      const enrichment = (meta.importEnrichment as Record<string, unknown> | null) ?? {};
      return {
        id: row.id,
        website: String(row.domain ?? row.websiteUrl ?? row.id),
        reason: String(resolved.reason ?? 'Manual'),
        url: row.websiteUrl ?? null,
        confidence: resolved.confidence,
        platform: String(sie.platform ?? meta.cms ?? ''),
        strategy: String(sie.strategy ?? meta.workflowQueue ?? ''),
        contentRef: String(
          enrichment.anchorText ?? enrichment.description ?? enrichment.targetPage ?? ''
        ),
      };
    })
    .filter(Boolean);

  return {
    counts,
    items,
    metricsSource: 'campaign_state' as const,
    conservation: {
      automatable: counts.automatable,
      manual: counts.manual,
      terminalExcluded: counts.terminalExcluded,
      active: counts.active,
      ok: counts.automatable + counts.manual === counts.active,
    },
  };
}

export { manualReasonFromGate };

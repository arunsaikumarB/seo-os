/**
 * AI Review board + bulk actions — all writes go through CSM updateCampaignItem.
 */
import {
  assignReviewTier,
  computeAiReviewSummary,
  decideAfterAnalysis,
  isAiReviewTerminal,
  metadataDisqualifiesSubmission,
  canApproveAfterProbe,
  looksLikeDirectorySubmitPath,
  domainLooksLikeDirectory,
  looksLikePostSubmitConfirmPath,
  getClassificationLabel,
  type ApprovedBy,
  type ReviewDecision,
  type ReviewTier,
} from '@seo-os/backlink-builder';
import {
  listCampaignItems,
  updateCampaignItem,
  type CampaignItemRow,
} from './campaign-state.service.js';
import { getSupabaseAdmin } from '../../lib/supabase.js';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function reachabilityCandidates(url: string): string[] {
  const raw = String(url ?? '').trim();
  if (!raw) return [];
  const out: string[] = [];
  const push = (u: string) => {
    if (u && !out.includes(u)) out.push(u);
  };
  push(raw);
  try {
    const u = new URL(raw.includes('://') ? raw : `https://${raw}`);
    const host = u.hostname.replace(/^www\./, '');
    push(`https://${host}${u.pathname}${u.search}`);
    push(`https://www.${host}${u.pathname}${u.search}`);
    push(`http://${host}${u.pathname}${u.search}`);
  } catch {
    /* keep raw only */
  }
  return out;
}

async function probeHomepageAlive(
  url: string
): Promise<{ ok: boolean; detail: string; status: number | null }> {
  const candidates = reachabilityCandidates(url);
  let lastDetail = 'fetch_failed';
  let lastStatus: number | null = null;
  for (const candidate of candidates) {
    try {
      const res = await fetch(candidate, {
        method: 'GET',
        redirect: 'follow',
        signal: AbortSignal.timeout(12_000),
        headers: {
          'User-Agent': BROWSER_UA,
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
      lastStatus = res.status;
      if (res.ok) {
        return { ok: true, detail: 'ok', status: res.status };
      }
      lastDetail = `http_${res.status}`;
    } catch (err) {
      lastDetail = err instanceof Error ? err.message : 'fetch_failed';
      lastStatus = null;
    }
  }
  return { ok: false, detail: lastDetail, status: lastStatus };
}

/**
 * Re-check Approved / Ready sites; mark unreachable ones Dead Website.
 * Prevents dead directories from staying approved after a fail-open import.
 */
export async function healUnreachableApprovedSites(
  workspaceId: string,
  opts: { limit?: number; concurrency?: number } = {}
): Promise<{ checked: number; markedDead: number; samples: string[] }> {
  const limit = opts.limit ?? 40;
  const concurrency = opts.concurrency ?? 6;
  const items = await listCampaignItems(workspaceId, { includeDeleted: false });
  const candidates = items
    .filter((i) => {
      if (i.reviewDecision === 'Dead Website') return false;
      if (i.currentStatus === 'Deleted' || i.currentStatus === 'Rejected') return false;
      const approvedLike =
        i.reviewDecision === 'Approved' ||
        i.currentStatus === 'Approved' ||
        i.currentStatus === 'Ready' ||
        i.currentStatus === 'Package Generated' ||
        i.approval === 'approved';
      return approvedLike && Boolean(String(i.websiteUrl ?? '').trim());
    })
    .slice(0, limit);

  let markedDead = 0;
  const samples: string[] = [];

  for (let i = 0; i < candidates.length; i += concurrency) {
    const batch = candidates.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async (item) => {
        const url = String(item.websiteUrl ?? '').trim();
        if (!url) return;
        const probe = await probeHomepageAlive(url);
        if (probe.ok) return;
        await updateCampaignItem(workspaceId, item.id, {
          currentStatus: 'Failed',
          reviewDecision: 'Dead Website',
          reviewTier: 'needs_classification',
          approvedBy: null,
          approval: 'pending',
          lastError: `Unreachable website — ${probe.detail}`,
          force: true,
        });
        markedDead++;
        if (samples.length < 12) {
          samples.push(`${item.domain ?? url}: ${probe.detail}`);
        }
      })
    );
  }

  return { checked: candidates.length, markedDead, samples };
}

/**
 * Re-check Dead Website rows; revive to Recommended when the URL is actually reachable.
 * Fixes sticky false-deads from bot UA / transient TLS failures.
 */
export async function healFalseDeadSites(
  workspaceId: string,
  opts: { limit?: number; concurrency?: number } = {}
): Promise<{ checked: number; revived: number; samples: string[] }> {
  const limit = opts.limit ?? 30;
  const concurrency = opts.concurrency ?? 6;
  const items = await listCampaignItems(workspaceId, { includeDeleted: false });
  const candidates = items
    .filter(
      (i) =>
        i.reviewDecision === 'Dead Website' && Boolean(String(i.websiteUrl ?? '').trim())
    )
    .slice(0, limit);

  let revived = 0;
  const samples: string[] = [];

  for (let i = 0; i < candidates.length; i += concurrency) {
    const batch = candidates.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async (item) => {
        const url = String(item.websiteUrl ?? '').trim();
        if (!url) return;
        const probe = await probeHomepageAlive(url);
        if (!probe.ok) return;

        const meta =
          typeof item.raw.metadata === 'object' && item.raw.metadata
            ? { ...(item.raw.metadata as Record<string, unknown>) }
            : {};
        meta.userMovedToRecommended = true;
        meta.userMovedToRecommendedAt = new Date().toISOString();
        meta.falseDeadHealed = {
          at: new Date().toISOString(),
          detail: probe.detail,
          status: probe.status,
        };
        if (meta.linkProbe && typeof meta.linkProbe === 'object') {
          const lp = { ...(meta.linkProbe as Record<string, unknown>) };
          if (lp.band === 'dead' || lp.alive === false) {
            meta.linkProbe = {
              ...lp,
              band: 'unprobed',
              alive: null,
              formFound: null,
              reasons: ['cleared_false_dead_heal'],
              probedAt: new Date().toISOString(),
            };
          }
        }

        await getSupabaseAdmin()
          .from('opportunities')
          .update({ metadata: meta, updated_at: new Date().toISOString() })
          .eq('id', item.id)
          .eq('workspace_id', workspaceId);

        await updateCampaignItem(workspaceId, item.id, {
          currentStatus: 'Classified',
          reviewDecision: 'Pending',
          reviewTier: 'recommended',
          approvedBy: null,
          approval: 'pending',
          lastError: null,
          blockerReason: null,
          force: true,
        });
        revived++;
        if (samples.length < 12) {
          samples.push(`${item.domain ?? url}: revived`);
        }
      })
    );
  }

  return { checked: candidates.length, revived, samples };
}

/**
 * Re-label forum_posting → directory_submission when URL/domain is clearly a directory submit page.
 * Also park post-submit confirmation URLs as Unsupported.
 */
export async function healMisclassifiedDirectoryForums(
  workspaceId: string,
  opts: { limit?: number } = {}
): Promise<{ checked: number; fixed: number; samples: string[] }> {
  const limit = opts.limit ?? 80;
  const items = await listCampaignItems(workspaceId, { includeDeleted: false });
  let fixed = 0;
  const samples: string[] = [];
  let checked = 0;

  for (const item of items) {
    if (checked >= limit) break;
    const url = String(item.websiteUrl ?? '').trim();
    const domain = String(item.domain ?? '').trim();
    if (!url && !domain) continue;

    const classId = String(item.classification ?? '').toLowerCase();
    const isForumish = classId === 'forum_posting' || classId === 'forum' || classId === 'community';
    const isSponsorish = classId === 'sponsorship';
    const confirm = looksLikePostSubmitConfirmPath(url);
    const dirLike =
      looksLikeDirectorySubmitPath(url) || domainLooksLikeDirectory(domain);

    const meta =
      typeof item.raw.metadata === 'object' && item.raw.metadata
        ? (item.raw.metadata as Record<string, unknown>)
        : {};
    // Never undo a user "Move to Recommended" override
    if (meta.userMovedToRecommended === true) continue;

    if (confirm) {
      checked++;
      // Already parked, or user revived to Recommended / Approved — leave alone
      if (
        (item.reviewDecision === 'Unsupported' && item.currentStatus === 'Ignored') ||
        item.reviewDecision === 'Pending' ||
        item.reviewDecision === 'Approved' ||
        item.reviewTier === 'recommended'
      ) {
        continue;
      }
      await updateCampaignItem(workspaceId, item.id, {
        classification: 'outreach_required',
        currentStatus: 'Ignored',
        reviewDecision: 'Unsupported',
        reviewTier: 'needs_classification',
        approvedBy: null,
        approval: 'rejected',
        lastError:
          'Post-submit confirmation URL — not a live listing form (use the real /submit page)',
        force: true,
      });
      fixed++;
      if (samples.length < 12) samples.push(`${domain || url}: confirm→unsupported`);
      continue;
    }

    if (!isForumish && !(isSponsorish && dirLike)) continue;
    if (!dirLike) continue;
    checked++;

    await updateCampaignItem(workspaceId, item.id, {
      classification: 'directory_submission',
      currentStatus:
        item.currentStatus === 'Approved' || item.reviewDecision === 'Approved'
          ? item.currentStatus
          : 'Classified',
      reviewDecision:
        item.reviewDecision === 'Approved'
          ? 'Approved'
          : item.reviewDecision === 'Rejected'
            ? 'Rejected'
            : 'Pending',
      reviewTier:
        (item.confidenceScore ?? 0) > 90 ? 'auto_approved' : 'recommended',
      lastError: null,
      force: true,
    });

    // Patch metadata.classification label for UI
    try {
      const meta =
        typeof item.raw.metadata === 'object' && item.raw.metadata
          ? { ...(item.raw.metadata as Record<string, unknown>) }
          : {};
      const prevClass =
        typeof meta.classification === 'object' && meta.classification
          ? (meta.classification as Record<string, unknown>)
          : {};
      meta.classification = {
        ...prevClass,
        id: 'directory_submission',
        displayName: getClassificationLabel('directory_submission'),
        reason: 'Reclassified: directory submit path/domain (not forum)',
        healedFrom: classId || 'unknown',
      };
      await getSupabaseAdmin()
        .from('opportunities')
        .update({
          opportunity_type: 'directory',
          metadata: meta,
          updated_at: new Date().toISOString(),
        })
        .eq('id', item.id)
        .eq('workspace_id', workspaceId);
    } catch {
      /* best-effort metadata patch */
    }

    fixed++;
    if (samples.length < 12) samples.push(`${domain || url}: ${classId}→directory_submission`);
  }

  return { checked, fixed, samples };
}

export type AiReviewItem = {
  id: string;
  website: string;
  domain: string | null;
  confidenceScore: number | null;
  reviewTier: ReviewTier | null;
  reviewDecision: ReviewDecision | null;
  approvedBy: ApprovedBy;
  classification: string | null;
  classificationLabel: string | null;
  currentStatus: string;
  lastError: string | null;
  duplicateOfId: string | null;
  canApprove: boolean;
  reason: string | null;
};

function toReviewItem(i: CampaignItemRow): AiReviewItem {
  const decision = i.reviewDecision ?? null;
  const terminal = isAiReviewTerminal({
    reviewDecision: decision,
    currentStatus: i.currentStatus,
  });
  const needsClass =
    !terminal &&
    (decision === 'Needs Classification' || i.reviewTier === 'needs_classification');
  const classified =
    Boolean(i.classification) && String(i.classification).toLowerCase() !== 'unknown';
  const meta =
    typeof i.raw.metadata === 'object' && i.raw.metadata
      ? (i.raw.metadata as Record<string, unknown>)
      : {};
  const probeGate = canApproveAfterProbe(meta);
  const noForm = metadataDisqualifiesSubmission(meta);

  let reason: string | null = null;
  // Dead / Unsupported: show the real park reason, not "Run Link Probe first"
  if (decision === 'Dead Website') {
    reason =
      i.lastError ||
      'Server could not open this URL (timeout / TLS / bot block). Browser may still work — Move to Recommended to override.';
  } else if (decision === 'Unsupported') {
    reason = i.lastError || 'Unsupported for free submit';
  } else if (!probeGate.ok) {
    reason = probeGate.reason ?? null;
  } else if (noForm) {
    reason = 'No submission form — cannot approve for backlink submit';
  } else if (
    typeof i.raw.metadata === 'object' &&
    i.raw.metadata &&
    typeof (i.raw.metadata as Record<string, unknown>).classification === 'object'
  ) {
    reason =
      String(
        ((i.raw.metadata as Record<string, unknown>).classification as Record<string, unknown>)
          ?.reason ?? ''
      ) || null;
  }

  return {
    id: i.id,
    website: i.websiteUrl ?? i.domain ?? i.id,
    domain: i.domain ?? null,
    confidenceScore: i.confidenceScore ?? null,
    reviewTier: i.reviewTier ?? null,
    reviewDecision: decision,
    approvedBy: i.approvedBy ?? null,
    classification: i.classification ?? null,
    classificationLabel: i.classificationLabel ?? null,
    currentStatus: i.currentStatus,
    lastError: i.lastError ?? null,
    duplicateOfId: i.duplicateOfId ?? null,
    canApprove: !needsClass && !terminal && classified && probeGate.ok && !noForm,
    reason,
  };
}

export async function getAiReviewBoard(workspaceId: string) {
  const { startPerfSpan } = await import('../../lib/perf-trace.js');
  const span = startPerfSpan('ai_review', { board: true });

  // Revoke previously approved sites that no longer resolve (timeout/DNS/4xx/5xx)
  try {
    await healUnreachableApprovedSites(workspaceId, { limit: 20, concurrency: 8 });
  } catch (e) {
    console.warn('[AI Review] reachability heal failed', e);
  }

  // Revive sticky false-deads when the URL responds 2xx on recheck
  try {
    await healFalseDeadSites(workspaceId, { limit: 30, concurrency: 6 });
  } catch (e) {
    console.warn('[AI Review] false-dead heal failed', e);
  }

  // Fix phpLD directories mislabeled Forum from category dropdown "Chats and Forums"
  try {
    await healMisclassifiedDirectoryForums(workspaceId, { limit: 80 });
  } catch (e) {
    console.warn('[AI Review] directory reclassify heal failed', e);
  }

  const items = await listCampaignItems(workspaceId, { includeDeleted: false });

  // Heal rows stuck with terminal status/decision but stale needs_classification tier
  const healFns: Array<() => Promise<unknown>> = [];
  for (const item of items) {
    const terminalStatus =
      item.currentStatus === 'Rejected' ||
      item.currentStatus === 'Approved' ||
      item.currentStatus === 'Ignored' ||
      item.currentStatus === 'Skipped';
    const decision = item.reviewDecision;
    const decisionTerminal =
      decision === 'Rejected' ||
      decision === 'Approved' ||
      decision === 'Unsupported' ||
      decision === 'Duplicate' ||
      decision === 'Dead Website';
    const tierStuck = item.reviewTier === 'needs_classification';
    const decisionStuck =
      decision === 'Needs Classification' ||
      decision === 'Pending' ||
      decision == null;
    if ((terminalStatus || decisionTerminal) && (tierStuck || (terminalStatus && decisionStuck))) {
      const nextDecision: ReviewDecision = decisionTerminal
        ? (decision as ReviewDecision)
        : item.currentStatus === 'Rejected'
          ? 'Rejected'
          : item.currentStatus === 'Approved'
            ? 'Approved'
            : item.currentStatus === 'Skipped'
              ? 'Duplicate'
              : 'Unsupported';
      healFns.push(() =>
        updateCampaignItem(workspaceId, item.id, {
          reviewDecision: nextDecision,
          reviewTier: null,
          force: true,
        }).catch(() => undefined)
      );
    }
  }
  // P1 — parallel heal (was sequential)
  for (let i = 0; i < healFns.length; i += 8) {
    await Promise.all(healFns.slice(i, i + 8).map((fn) => fn()));
  }

  const fresh =
    healFns.length > 0
      ? await listCampaignItems(workspaceId, { includeDeleted: false })
      : items;
  const summary = computeAiReviewSummary(fresh);
  const rows = fresh.map(toReviewItem);

  const autoApproved = rows
    .filter(
      (r) =>
        !isAiReviewTerminal(r) &&
        (r.reviewTier === 'auto_approved' ||
          (r.reviewDecision === 'Approved' && r.approvedBy === 'auto'))
    )
    .sort((a, b) => (b.confidenceScore ?? 0) - (a.confidenceScore ?? 0));
  const recommended = rows
    .filter(
      (r) =>
        !isAiReviewTerminal(r) &&
        r.reviewTier === 'recommended' &&
        (r.reviewDecision === 'Pending' || r.reviewDecision == null)
    )
    .sort((a, b) => (b.confidenceScore ?? 0) - (a.confidenceScore ?? 0));
  // Awaiting classification only — never Rejected / Approved / Dead / etc.
  const needsClassification = rows
    .filter((r) => {
      if (isAiReviewTerminal(r)) return false;
      if (r.reviewDecision === 'Rejected' || r.currentStatus === 'Rejected') return false;
      if (r.reviewDecision === 'Approved' || r.currentStatus === 'Approved') return false;
      return (
        r.reviewTier === 'needs_classification' ||
        r.reviewDecision === 'Needs Classification'
      );
    })
    .sort((a, b) => (b.confidenceScore ?? 0) - (a.confidenceScore ?? 0));
  const rejected = rows.filter(
    (r) => r.reviewDecision === 'Rejected' || r.currentStatus === 'Rejected'
  );
  const unsupported = rows.filter((r) => r.reviewDecision === 'Unsupported');
  const duplicate = rows.filter((r) => r.reviewDecision === 'Duplicate');
  const dead = rows.filter((r) => r.reviewDecision === 'Dead Website');
  const userApproved = rows.filter(
    (r) => r.reviewDecision === 'Approved' && r.approvedBy === 'user'
  );

  span.end(true, { items: rows.length, heals: healFns.length });
  return {
    summary,
    tiers: {
      autoApproved,
      recommended,
      needsClassification,
      userApproved,
      rejected,
      unsupported,
      duplicate,
      dead,
    },
    items: rows,
    metricsSource: 'campaign_state' as const,
  };
}

export type AiReviewBulkAction =
  | 'approve'
  | 'reject'
  | 'unsupported'
  | 'outreach'
  | 'retry_analysis';

/** Terminal buckets — bulk Approve moves these into Recommended (not final Approve). */
const REVIVE_TO_RECOMMENDED = new Set([
  'Dead Website',
  'Unsupported',
  'Duplicate',
  'Rejected',
]);

/**
 * Stamp user override + clear stale dead/no_form/paid probe so heals cannot
 * immediately park the row back into Unsupported / Dead.
 */
async function stampMovedToRecommendedMetadata(
  workspaceId: string,
  opportunityId: string,
  meta: Record<string, unknown>
) {
  const lp =
    meta.linkProbe && typeof meta.linkProbe === 'object'
      ? { ...(meta.linkProbe as Record<string, unknown>) }
      : null;
  const band = lp ? String(lp.band ?? '') : '';
  const clearProbe =
    Boolean(lp) &&
    (band === 'dead' ||
      band === 'no_form' ||
      lp?.listingPricing === 'paid' ||
      lp?.alive === false);

  const nextMeta: Record<string, unknown> = {
    ...meta,
    userMovedToRecommended: true,
    userMovedToRecommendedAt: new Date().toISOString(),
  };
  if (clearProbe && lp) {
    nextMeta.linkProbe = {
      ...lp,
      band: 'unprobed',
      alive: null,
      formFound: null,
      listingPricing: 'unknown',
      reasons: ['cleared_on_move_to_recommended'],
      probedAt: new Date().toISOString(),
    };
  }

  await getSupabaseAdmin()
    .from('opportunities')
    .update({ metadata: nextMeta, updated_at: new Date().toISOString() })
    .eq('id', opportunityId)
    .eq('workspace_id', workspaceId);
}

async function moveItemToRecommended(
  workspaceId: string,
  itemId: string,
  meta: Record<string, unknown>
) {
  // Stamp first so any board heal that runs mid-write respects the override
  await stampMovedToRecommendedMetadata(workspaceId, itemId, meta);
  await updateCampaignItem(workspaceId, itemId, {
    currentStatus: 'Classified',
    reviewDecision: 'Pending',
    reviewTier: 'recommended',
    approvedBy: null,
    approval: 'pending',
    lastError: null,
    blockerReason: null,
    force: true,
  });
}

export async function bulkAiReviewAction(
  workspaceId: string,
  action: AiReviewBulkAction,
  itemIds: string[]
) {
  const before = await getAiReviewBoard(workspaceId);
  const byId = new Map(before.items.map((i) => [i.id, i]));
  const fullItems = await listCampaignItems(workspaceId, { includeDeleted: false });
  const byFull = new Map(fullItems.map((i) => [i.id, i]));
  let succeeded = 0;
  let skipped = 0;
  let movedToRecommended = 0;
  const skipReasons: string[] = [];
  const errors: string[] = [];

  for (const id of itemIds) {
    const item = byId.get(id);
    if (!item) {
      skipped++;
      skipReasons.push(`${id}: not found`);
      continue;
    }

    try {
      if (action === 'approve') {
        if (item.reviewDecision === 'Approved') {
          // idempotent no-op
          succeeded++;
          continue;
        }

        const full = byFull.get(id);
        const meta =
          full && typeof full.raw?.metadata === 'object' && full.raw.metadata
            ? (full.raw.metadata as Record<string, unknown>)
            : {};

        // Dead / Unsupported / Duplicate / Rejected → Recommended (user override)
        if (
          REVIVE_TO_RECOMMENDED.has(String(item.reviewDecision ?? '')) ||
          item.currentStatus === 'Rejected' ||
          item.currentStatus === 'Ignored' ||
          item.currentStatus === 'Failed' ||
          item.currentStatus === 'Skipped'
        ) {
          await moveItemToRecommended(workspaceId, id, meta);
          succeeded++;
          movedToRecommended++;
          continue;
        }

        if (
          item.reviewDecision === 'Needs Classification' ||
          item.reviewTier === 'needs_classification'
        ) {
          const classified =
            Boolean(item.classification) &&
            String(item.classification).toLowerCase() !== 'unknown';
          if (!classified) {
            skipped++;
            skipReasons.push(`${item.website}: need classification first`);
            continue;
          }
          await moveItemToRecommended(workspaceId, id, meta);
          succeeded++;
          movedToRecommended++;
          continue;
        }

        if (!item.canApprove) {
          skipped++;
          skipReasons.push(
            `${item.website}: ${item.reason ?? 'cannot approve yet — run link probe / classify first'}`
          );
          continue;
        }

        const probeOk = canApproveAfterProbe(meta);
        if (!probeOk.ok) {
          skipped++;
          skipReasons.push(`${item.website}: ${probeOk.reason ?? 'probe gate failed'}`);
          continue;
        }
        if (metadataDisqualifiesSubmission(meta)) {
          skipped++;
          skipReasons.push(`${item.website}: disqualified by probe (dead/no-form/paid)`);
          continue;
        }
        await updateCampaignItem(workspaceId, id, {
          currentStatus: 'Approved',
          reviewDecision: 'Approved',
          reviewTier: 'recommended',
          approvedBy: 'user',
          approval: 'approved',
          force: true,
        });
        succeeded++;
      } else if (action === 'reject') {
        if (item.reviewDecision === 'Rejected' || item.currentStatus === 'Rejected') {
          succeeded++;
          continue;
        }
        await updateCampaignItem(workspaceId, id, {
          currentStatus: 'Rejected',
          reviewDecision: 'Rejected',
          // Clear tier so stale needs_classification cannot keep the row in that cohort
          reviewTier: null,
          approvedBy: 'user',
          approval: 'rejected',
          force: true,
        });
        succeeded++;
      } else if (action === 'unsupported') {
        await updateCampaignItem(workspaceId, id, {
          currentStatus: 'Ignored',
          reviewDecision: 'Unsupported',
          reviewTier: null,
          approvedBy: null,
          force: true,
        });
        succeeded++;
      } else if (action === 'outreach') {
        // Map to Ignored / outreach flag in lifecycle
        await updateCampaignItem(workspaceId, id, {
          currentStatus: 'Ignored',
          reviewDecision: 'Unsupported',
          reviewTier: null,
          approvedBy: null,
          lastError: 'Moved to outreach',
          force: true,
        });
        succeeded++;
      } else if (action === 'retry_analysis') {
        await updateCampaignItem(workspaceId, id, {
          currentStatus: 'Analyzed',
          reviewDecision: 'Pending',
          reviewTier: null,
          confidenceScore: null,
          approvedBy: null,
          lastError: null,
          force: true,
        });
        succeeded++;
      }
    } catch (err) {
      errors.push(`${item.website}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const board = await getAiReviewBoard(workspaceId);
  const summary = board.summary;

  if (succeeded > 0 || errors.length > 0) {
    try {
      const { notifyStageCompleteAsync } = await import('../platform/stage-notify.service.js');
      const pending = Number((summary as { pending?: number })?.pending ?? 0);
      const approved = Number((summary as { approved?: number })?.approved ?? succeeded);
      notifyStageCompleteAsync({
        workspaceId,
        kind: 'ai_review',
        stageName: 'AI Review',
        summary:
          errors.length > 0
            ? `${action}: ${succeeded} succeeded · ${errors.length} failed · ${skipped} skipped`
            : movedToRecommended > 0 && movedToRecommended === succeeded
              ? `Moved ${movedToRecommended} to Recommended`
              : `${action}: ${succeeded} sites · ${pending} still pending · ${approved} approved`,
        outcome: errors.length > 0 ? 'partial' : 'success',
        href: `/projects/${workspaceId}/content/library`,
        payload: {
          fingerprint: `ai-review:${action}:${succeeded}:${pending}:${errors.length}`,
          action,
          succeeded,
          skipped,
          movedToRecommended,
          failed: errors.length,
        },
      });
    } catch {
      /* notify optional */
    }
  }

  return {
    action,
    succeeded,
    skipped,
    movedToRecommended,
    skipReasons: skipReasons.slice(0, 20),
    errors: errors.slice(0, 20),
    summary,
    board,
  };
}

export async function setAiReviewClassification(
  workspaceId: string,
  itemId: string,
  classificationId: string
) {
  const conf = 75; // unlocks recommended band after user picks type
  const tier = assignReviewTier(conf, classificationId);
  await updateCampaignItem(workspaceId, itemId, {
    classification: classificationId,
    confidenceScore: conf,
    reviewTier: tier,
    reviewDecision: tier === 'needs_classification' ? 'Needs Classification' : 'Pending',
    currentStatus: 'Classified',
    force: true,
  });
  return getAiReviewBoard(workspaceId);
}

/** Set the same website type on many items in one step (Needs Classification bulk). */
export async function bulkSetAiReviewClassification(
  workspaceId: string,
  itemIds: string[],
  classificationId: string
) {
  const conf = 75;
  const tier = assignReviewTier(conf, classificationId);
  let succeeded = 0;
  let skipped = 0;
  const skipReasons: string[] = [];
  const errors: string[] = [];

  const before = await getAiReviewBoard(workspaceId);
  const byId = new Map(before.items.map((i) => [i.id, i]));

  for (const id of itemIds) {
    const item = byId.get(id);
    if (!item) {
      skipped++;
      skipReasons.push(`${id}: not found`);
      continue;
    }
    try {
      await updateCampaignItem(workspaceId, id, {
        classification: classificationId,
        confidenceScore: conf,
        reviewTier: tier,
        reviewDecision: tier === 'needs_classification' ? 'Needs Classification' : 'Pending',
        currentStatus: 'Classified',
        force: true,
      });
      succeeded++;
    } catch (err) {
      errors.push(`${item.website}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const board = await getAiReviewBoard(workspaceId);
  return {
    action: 'classify' as const,
    classificationId,
    succeeded,
    skipped,
    skipReasons: skipReasons.slice(0, 20),
    errors: errors.slice(0, 20),
    summary: board.summary,
    board,
  };
}

/** Apply analysis result through CSM (auto-approve / gate / dead / duplicate). */
export async function applyAnalysisToCampaignItem(
  workspaceId: string,
  itemId: string,
  opts: {
    confidenceScore: number;
    classificationId?: string | null;
    deadWebsite?: boolean;
    duplicateOfId?: string | null;
    homepageReachable?: boolean | null;
    formConfirmed?: boolean | null;
    paidListing?: boolean | null;
    notQualified?: boolean | null;
  }
) {
  const decision = decideAfterAnalysis(opts);
  await updateCampaignItem(workspaceId, itemId, {
    currentStatus: decision.lifecycle,
    confidenceScore: decision.confidenceScore,
    reviewTier: decision.reviewTier,
    reviewDecision: decision.reviewDecision,
    approvedBy: decision.approvedBy,
    approval: decision.reviewDecision === 'Approved' ? 'approved' : 'pending',
    lastError: decision.lastError ?? null,
    duplicateOfId: decision.duplicateOfId ?? null,
    force: true,
  });
}

export async function backfillAiReviewFields(workspaceId: string) {
  const items = await listCampaignItems(workspaceId, { includeDeleted: true });
  let updated = 0;
  for (const item of items) {
    if (item.reviewDecision) continue;
    let decision: ReviewDecision = 'Pending';
    let approvedBy: ApprovedBy = null;
    let tier: ReviewTier | null = item.reviewTier ?? null;
    const conf =
      item.confidenceScore ??
      (typeof (item.raw.metadata as Record<string, unknown>)?.classification === 'object'
        ? Number(
            (
              (item.raw.metadata as Record<string, unknown>).classification as Record<
                string,
                unknown
              >
            )?.confidence ?? 0
          )
        : null);

    if (
      item.currentStatus === 'Approved' ||
      (item.approval === 'approved' && item.currentStatus !== 'Rejected')
    ) {
      decision = 'Approved';
      approvedBy = 'user';
      tier = tier ?? (conf != null && conf > 90 ? 'auto_approved' : 'recommended');
    } else if (item.currentStatus === 'Rejected') {
      decision = 'Rejected';
    } else if (item.currentStatus === 'Ignored') {
      decision = 'Unsupported';
    } else if (item.currentStatus === 'Skipped') {
      decision = 'Duplicate';
    } else if (
      item.currentStatus === 'Failed' &&
      String(item.lastError ?? '').toLowerCase().includes('dead')
    ) {
      decision = 'Dead Website';
    } else if (conf != null) {
      tier = assignReviewTier(conf, item.classification);
      if (tier === 'needs_classification') decision = 'Needs Classification';
      else if (tier === 'auto_approved') {
        decision = 'Approved';
        approvedBy = 'auto';
      } else decision = 'Pending';
    }

    await updateCampaignItem(workspaceId, item.id, {
      reviewDecision: decision,
      reviewTier: tier,
      confidenceScore: conf,
      approvedBy,
      force: true,
    });
    updated++;
  }
  return { updated, summary: computeAiReviewSummary(await listCampaignItems(workspaceId)) };
}

/** Find existing campaign item by domain for duplicate detection. */
export async function findExistingByDomain(workspaceId: string, domain: string) {
  const d = domain.toLowerCase().replace(/^www\./, '');
  const { data } = await getSupabaseAdmin()
    .from('opportunities')
    .select('id, domain')
    .eq('workspace_id', workspaceId)
    .ilike('domain', d)
    .neq('automation_status', 'deleted')
    .limit(1)
    .maybeSingle();
  return data ? String(data.id) : null;
}

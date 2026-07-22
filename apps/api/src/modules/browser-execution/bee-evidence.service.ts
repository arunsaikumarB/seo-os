/**
 * Phase 4.5 — Evidence Record storage + truth write-gate.
 * Classifications without evidence are rejected and logged as truth violations.
 */
import { randomUUID } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { logger } from '../../lib/logger.js';

export type EvidenceSignal = {
  id: string;
  kind: string;
  detail: string;
};

export type CaptureEvidenceInput = {
  workspaceId: string;
  jobId: string;
  opportunityId?: string | null;
  claim: string;
  detectorId?: string | null;
  signals: EvidenceSignal[];
  url?: string | null;
  screenshotBase64?: string | null;
  domHtml?: string | null;
  stage?: string | null;
  workerId?: string | null;
  leaseGeneration?: number | null;
  verified?: boolean;
  unclassified?: boolean;
};

export async function logTruthViolation(params: {
  workspaceId?: string | null;
  jobId?: string | null;
  opportunityId?: string | null;
  kind: string;
  source: string;
  detail?: Record<string, unknown>;
}): Promise<void> {
  try {
    await getSupabaseAdmin().from('execution_truth_violations').insert({
      id: randomUUID(),
      workspace_id: params.workspaceId ?? null,
      job_id: params.jobId ?? null,
      opportunity_id: params.opportunityId ?? null,
      kind: params.kind,
      source: params.source,
      detail: params.detail ?? {},
    });
  } catch (err) {
    logger.warn({ err, kind: params.kind }, 'Failed to log truth violation');
  }
  logger.warn(
    {
      kind: params.kind,
      source: params.source,
      jobId: params.jobId,
      detail: params.detail,
    },
    'Truth violation'
  );
}

async function uploadDomSnapshot(
  workspaceId: string,
  jobId: string,
  html: string
): Promise<string | null> {
  const path = `browser-execution/${workspaceId}/${jobId}/dom-${Date.now()}.html.gz`;
  try {
    const compressed = gzipSync(Buffer.from(html, 'utf8'));
    const { error } = await getSupabaseAdmin().storage
      .from('browser-execution')
      .upload(path, compressed, { contentType: 'application/gzip', upsert: true });
    if (error) {
      logger.debug({ error }, 'DOM snapshot upload skipped');
      return null;
    }
    return path;
  } catch {
    return null;
  }
}

async function uploadScreenshot(
  workspaceId: string,
  jobId: string,
  base64: string
): Promise<string | null> {
  const path = `browser-execution/${workspaceId}/${jobId}/evidence-${Date.now()}.jpg`;
  try {
    const buf = Buffer.from(base64, 'base64');
    const { error } = await getSupabaseAdmin().storage
      .from('browser-execution')
      .upload(path, buf, { contentType: 'image/jpeg', upsert: true });
    if (error) return null;
    await getSupabaseAdmin().from('execution_assets').insert({
      id: randomUUID(),
      workspace_id: workspaceId,
      job_id: jobId,
      step_id: null,
      kind: 'screenshot',
      label: 'truth_evidence',
      storage_path: path,
      mime_type: 'image/jpeg',
      meta: {},
    });
    return path;
  } catch {
    return null;
  }
}

/** Capture Evidence Record atomically with the claim. Owned by the job/item. */
export async function captureEvidenceRecord(
  input: CaptureEvidenceInput
): Promise<{ id: string; screenshotPath: string | null; domPath: string | null } | null> {
  const screenshotPath = input.screenshotBase64
    ? await uploadScreenshot(input.workspaceId, input.jobId, input.screenshotBase64)
    : null;
  const domPath = input.domHtml
    ? await uploadDomSnapshot(input.workspaceId, input.jobId, input.domHtml)
    : null;

  const id = randomUUID();
  const row = {
    id,
    workspace_id: input.workspaceId,
    job_id: input.jobId,
    opportunity_id: input.opportunityId ?? null,
    claim: input.claim,
    detector_id: input.detectorId ?? null,
    signals: input.signals ?? [],
    url: input.url ?? null,
    screenshot_path: screenshotPath,
    dom_snapshot_path: domPath,
    stage: input.stage ?? null,
    worker_id: input.workerId ?? null,
    lease_generation: input.leaseGeneration ?? null,
    verified: input.verified !== false,
    unclassified: input.unclassified === true,
    captured_at: new Date().toISOString(),
  };

  const { error } = await getSupabaseAdmin().from('execution_evidence').insert(row);
  if (error) {
    logger.warn({ error, jobId: input.jobId }, 'Evidence insert failed');
    await logTruthViolation({
      workspaceId: input.workspaceId,
      jobId: input.jobId,
      kind: 'evidence_persist_failed',
      source: 'captureEvidenceRecord',
      detail: { message: error.message, claim: input.claim },
    });
    return null;
  }

  // Soft-link on job for queue filters
  await getSupabaseAdmin()
    .from('execution_jobs')
    .update({
      evidence_id: id,
      truth_claim: input.claim,
      unclassified: input.unclassified === true,
      evidence: {
        evidenceId: id,
        claim: input.claim,
        detectorId: input.detectorId,
        signals: input.signals,
        url: input.url,
        screenshotPath,
        domSnapshotPath: domPath,
        stage: input.stage,
        verified: input.verified !== false,
        unclassified: input.unclassified === true,
        capturedAt: row.captured_at,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.jobId)
    .eq('workspace_id', input.workspaceId);

  return { id, screenshotPath, domPath };
}

/**
 * Gate: intervention classification writes require evidence.
 * Returns false (and logs) when evidence is missing.
 */
export async function assertEvidenceForClassification(params: {
  workspaceId: string;
  jobId: string;
  claim: string;
  evidenceId: string | null | undefined;
  source: string;
}): Promise<boolean> {
  if (params.evidenceId) {
    const { data } = await getSupabaseAdmin()
      .from('execution_evidence')
      .select('id')
      .eq('id', params.evidenceId)
      .eq('job_id', params.jobId)
      .maybeSingle();
    if (data?.id) return true;
  }
  await logTruthViolation({
    workspaceId: params.workspaceId,
    jobId: params.jobId,
    kind: 'classification_without_evidence',
    source: params.source,
    detail: { claim: params.claim, evidenceId: params.evidenceId ?? null },
  });
  return false;
}

export async function getEvidenceForJob(workspaceId: string, jobId: string) {
  const { data } = await getSupabaseAdmin()
    .from('execution_evidence')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('job_id', jobId)
    .order('captured_at', { ascending: false })
    .limit(10);
  return data ?? [];
}

/** Optional: decompress stored DOM for AI review (bounded size). */
export async function loadDomSnapshotText(storagePath: string): Promise<string | null> {
  try {
    const { data, error } = await getSupabaseAdmin().storage
      .from('browser-execution')
      .download(storagePath);
    if (error || !data) return null;
    const buf = Buffer.from(await data.arrayBuffer());
    if (storagePath.endsWith('.gz')) {
      return gunzipSync(buf).toString('utf8').slice(0, 80_000);
    }
    return buf.toString('utf8').slice(0, 80_000);
  } catch {
    return null;
  }
}

export async function getTruthAudit(workspaceId: string) {
  const { data: jobs } = await getSupabaseAdmin()
    .from('execution_jobs')
    .select(
      'id, status, pause_reason, evidence_id, truth_claim, unclassified, false_intervention, lease_holder, metrics'
    )
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .limit(5000);

  const interventionStatuses = new Set([
    'paused',
    'needs_approval',
    'blocked_captcha',
    'blocked_mfa',
    'blocked_email_verify',
    'blocked_phone_verify',
    'awaiting_user',
    'ready_for_review',
    'ready_to_continue',
    'watching_captcha',
    'watching_login',
    'watching_mfa',
    'watching_email',
    'watching_phone',
  ]);

  let classifications = 0;
  let missingEvidence = 0;
  let falseInterventions = 0;
  let unclassified = 0;
  const classificationRows: Array<{
    jobId: string;
    claim: string | null;
    evidenceId: string | null;
    hasEvidence: boolean;
  }> = [];

  for (const j of jobs ?? []) {
    const s = String(j.status);
    if (!interventionStatuses.has(s)) continue;
    classifications++;
    const hasEv = Boolean(j.evidence_id);
    if (!hasEv) missingEvidence++;
    if (j.false_intervention === true) falseInterventions++;
    if (j.unclassified === true) unclassified++;
    classificationRows.push({
      jobId: String(j.id),
      claim: j.truth_claim != null ? String(j.truth_claim) : j.pause_reason != null ? String(j.pause_reason) : null,
      evidenceId: j.evidence_id != null ? String(j.evidence_id) : null,
      hasEvidence: hasEv,
    });
  }

  const { data: violations } = await getSupabaseAdmin()
    .from('execution_truth_violations')
    .select('id, kind, source, detail, job_id, created_at')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(100);

  // Phantom-state: Starting/Running without timeline Browser Allocated / Website Opened
  const inFlight = (jobs ?? []).filter((j) =>
    ['preparing', 'launching_browser', 'navigating', 'analyzing_form', 'filling_fields', 'submitting'].includes(
      String(j.status)
    )
  );
  let phantomStates = 0;
  for (const j of inFlight.slice(0, 50)) {
    const { data: events } = await getSupabaseAdmin()
      .from('execution_timeline')
      .select('event')
      .eq('job_id', j.id)
      .in('event', ['Browser Allocated', 'Website Opened'])
      .limit(5);
    const names = new Set((events ?? []).map((e) => String(e.event)));
    const s = String(j.status);
    if (s === 'launching_browser' && !names.has('Browser Allocated')) phantomStates++;
    if (
      ['navigating', 'analyzing_form', 'filling_fields', 'submitting'].includes(s) &&
      !names.has('Website Opened')
    ) {
      phantomStates++;
    }
  }

  const falseRate =
    classifications > 0 ? Math.round((falseInterventions / classifications) * 1000) / 1000 : 0;

  return {
    classifications,
    missingEvidence, // must be 0
    falseInterventions,
    falseInterventionRate: falseRate,
    unclassified,
    phantomStates, // must be 0
    rejectedWrites: violations ?? [],
    classificationAudit: classificationRows.slice(0, 100),
    invariants: {
      missingEvidenceZero: missingEvidence === 0,
      phantomStatesZero: phantomStates === 0,
    },
  };
}

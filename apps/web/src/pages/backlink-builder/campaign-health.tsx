/**
 * Campaign Health — internal audit table (plain HTML-ish UI).
 * Route is not linked from main nav; open directly for sync debugging.
 */
import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useApi } from '@/hooks/use-api';
import { useExecutionSummary } from '@/hooks/use-execution-summary';

type HealthRow = {
  website: string;
  imported: boolean;
  analyzed: boolean;
  approved: boolean;
  package: string | null;
  images: string | null;
  metadata: string | null;
  videoMeta: string | null;
  schema: string | null;
  generationStatus: string | null;
  qualityScore: number | null;
  retryCount: number | null;
  packageApprovedBy: string | null;
  submission: string | null;
  verification: string | null;
  currentStatus: string;
  confidence: number | null;
  tier: string | null;
  reviewDecision: string | null;
  approvedBy: string | null;
  lastError: string | null;
  updatedAt: string | null;
};

type AssetAudit = { generated: number; missingFailed: number };

type HealthData = {
  totals: Record<string, number> & { byStatus?: Record<string, number> };
  generationAudit?: {
    packages: AssetAudit;
    images: AssetAudit;
    metadata: AssetAudit;
    videoMetadata: AssetAudit;
    schema: AssetAudit;
  };
  orphans?: { count: number; items: Array<{ table: string; id: string; opportunityId: string | null }> };
  orphanSweep?: { deleted: number; remaining: number; byTable: Record<string, number> };
  generationProgress?: Record<string, number | boolean>;
  executionAudit?: {
    workers: { healthy: number; idle: number; running: number; stuck: number };
    browsers: {
      allocated: number;
      free: number;
      contexts: number;
      max: number;
      dbSessionRunning?: number;
      allocatedEqualsContexts?: boolean;
      runtimeHealthy?: boolean;
      runtimeError?: string | null;
      browsersPath?: string | null;
      withinCeiling?: boolean;
    };
    queue: {
      queued: number;
      running: number;
      waitingHuman: number;
      completed: number;
      failed: number;
      retrying: number;
      deleted: number;
      ignored: number;
    };
    queueIntegrity?: {
      distinctItemsWithActiveJobs: number;
      activeJobs: number;
      duplicateActiveJobs: number;
      jobItemRatio: number;
      maxActivePerItem: number;
      assertMaxOneActivePerItem: boolean;
      duplicateViolations?: Array<{ opportunityId: string; jobIds: string[]; count: number }>;
    };
    invariants: {
      stuckWorkersZero: boolean;
      browsersWithinCeiling: boolean;
      allocatedEqualsContexts?: boolean;
      runtimeHealthy?: boolean;
      duplicateActiveJobsZero?: boolean;
    };
  };
  truthAudit?: {
    classifications: number;
    missingEvidence: number;
    falseInterventions: number;
    falseInterventionRate: number;
    unclassified: number;
    phantomStates: number;
    rejectedWrites: Array<{ kind: string; source: string; created_at?: string }>;
    invariants: { missingEvidenceZero: boolean; phantomStatesZero: boolean };
  };
  siteIntelligenceAudit?: {
    total: number;
    byStatus?: Record<string, number>;
    byStrategy?: Record<string, number>;
    avgPagesFetched?: number;
    avgElapsedMs?: number;
    wordpressHealth?: {
      detected: number;
      comment: number;
      guestPost: number;
      dashboard: number;
      contactForm: number;
      email: number;
      registration: number;
      unsupported: number;
      successRate: number | null;
    };
    directoryHealth?: {
      detected: number;
      supported: number;
      free: number;
      paid: number;
      dashboard: number;
      email: number;
      contactForm: number;
      unsupported: number;
      successRate: number | null;
    };
    contactFormHealth?: {
      detected: number;
      supported: number;
      unsupported: number;
      successful: number;
      failed: number;
      captcha: number;
      manualReview: number;
      averageCompletionTimeMs: number | null;
      successRate: number | null;
    };
    profiles?: Array<{
      domain: string;
      status: string;
      platform: string | null;
      strategy: string | null;
      entryUrl: string | null;
      expectedInterventions: string[];
    }>;
    error?: string;
  };
  handoffAudit?: {
    generatedPackages?: number;
    submissionReady?: number;
    inFlight?: number;
    completed?: number;
    blocked?: number;
    blockers?: Record<string, number>;
    conservationLeft?: number;
    conservationRight?: number;
    ok?: boolean;
    waitingHuman?: number;
    executionJobsQueued?: number;
    executionJobsRunning?: number;
    violations?: Array<{ id: string; website: string; reason: string }>;
    error?: string;
  };
  executionDiagnostics?: {
    readyItems: number;
    executionJobsCreated: number;
    jobsQueued: number;
    jobsRunning: number;
    jobsWaitingHuman: number;
    jobsFailed: number;
    jobsCompleted: number;
    jobsSkipped: number;
    missingExecutionJobs: number;
    pipelineBroken: boolean;
    rootCause: string | null;
    ensureSummary?: {
      created: number;
      started: number;
      skippedTerminal: number;
      failed: number;
      alreadyHadJob: number;
    };
    items?: Array<{
      campaignItemId: string;
      website: string;
      domain: string | null;
      currentStatus: string | null;
      executionJobExists: boolean;
      executionJobStatus: string | null;
      whyNoJob: string | null;
      verifiedBlocker: string | null;
      creationError: string | null;
      startApiCalled: boolean | null;
      startApiResponse: string | null;
    }>;
    error?: string;
  };
  items: HealthRow[];
};

export function CampaignHealthPage() {
  const { projectId = '' } = useParams();
  const { request } = useApi();
  const execSummary = useExecutionSummary(projectId, 2_000);
  const sum = execSummary.data;

  const health = useQuery({
    queryKey: ['campaign-health', projectId],
    queryFn: () =>
      request<{ data: HealthData }>(
        `/v1/projects/${projectId}/backlink-builder/campaign-health`
      ),
    enabled: !!projectId,
    refetchInterval: 5_000,
  });

  const assisted = useQuery({
    queryKey: ['assisted-manual', projectId],
    queryFn: () =>
      request<{
        data: {
          counts: {
            automatable: number;
            assisted: number;
            manual: number;
            ready: number;
            checkFields: number;
            needsPerson: number;
            conservationOk: boolean;
          };
        };
      }>(`/v1/projects/${projectId}/backlink-builder/assisted-manual`),
    enabled: !!projectId,
    staleTime: 15_000,
  });

  const data = health.data?.data;
  const totals = data?.totals;
  const audit = data?.generationAudit;
  const orphans = data?.orphans;
  const ac = assisted.data?.data.counts;

  // Phase 6.1 — Track Results ≡ Campaign Health Execution Summary ≡ CSM waiting / cohort
  useEffect(() => {
    if (!sum || !totals) return;
    const submissionCohort =
      (totals.byStatus?.['Package Generated'] ?? 0) +
      (totals.ready ?? 0) +
      (totals.submitting ?? 0) +
      (totals.waiting ?? 0) +
      (totals.retrying ?? 0) +
      (totals.submitted ?? 0) +
      (totals.verified ?? 0) +
      (totals.completed ?? 0) +
      (totals.failed ?? 0) +
      (totals.skipped ?? 0) +
      (totals.rejected ?? 0);
    const waitingMismatch = sum.waitingHuman !== (totals.waiting ?? 0);
    const totalMismatch = submissionCohort > 0 && sum.total !== submissionCohort;
    if (waitingMismatch || totalMismatch) {
      console.error(
        '[truth] Cross-page invariant violated: Track Results / Execution Summary ≠ Campaign Health',
        {
          execWaitingHuman: sum.waitingHuman,
          csmWaiting: totals.waiting,
          execTotal: sum.total,
          submissionCohort,
          progressPercent: sum.progressPercent,
        }
      );
    }
  }, [sum, totals]);

  return (
    <div className="space-y-4 p-2 font-mono text-xs">
      <div>
        <h1 className="text-sm font-semibold">Campaign Health (audit)</h1>
        <p className="text-muted-foreground">
          Dev-only · every Campaign Item once · totals from Campaign State Manager
        </p>
      </div>

      {sum ? (
        <div className="flex flex-wrap gap-3 border border-emerald-700/40 p-2">
          <span className="font-semibold">Execution Summary</span>
          <span>progress={sum.progressPercent}%</span>
          <span>completed={sum.completed}</span>
          <span>running={sum.running}</span>
          <span>waitingHuman={sum.waitingHuman}</span>
          <span>remaining={sum.remaining}</span>
          <span>failed={sum.failed}</span>
          <span>skipped={sum.skipped}</span>
          <span>state={sum.campaignState}</span>
        </div>
      ) : null}

      {ac ? (
        <div className="flex flex-wrap gap-3 border border-sky-700/40 p-2">
          <span className="font-semibold">Assisted Manual (Phase 7)</span>
          <span>automatable={ac.automatable}</span>
          <span>assisted={ac.assisted}</span>
          <span>ready={ac.ready}</span>
          <span>checkFields={ac.checkFields}</span>
          <span>needsPerson={ac.needsPerson}</span>
          <span>manualOffline={ac.manual}</span>
          <span>conservation={ac.conservationOk ? 'ok' : 'FAIL'}</span>
        </div>
      ) : null}

      {totals ? (
        <div className="flex flex-wrap gap-3 border p-2">
          <span>imported={totals.imported}</span>
          <span>approved={totals.approved}</span>
          <span>submissionReady={totals.ready}</span>
          <span>packageGenerated={totals.packageGenerated}</span>
          <span>submitted={totals.submitted}</span>
          <span>verified={totals.verified}</span>
          <span>failed={totals.failed}</span>
          <span>waiting={totals.waiting}</span>
          <span>deleted={totals.deleted}</span>
          <span>total={totals.totalIncludingDeleted ?? totals.total}</span>
        </div>
      ) : null}

      {audit ? (
        <div className="border p-2 space-y-2">
          <p className="font-semibold">Generation audit</p>
          <table className="w-full max-w-md border-collapse">
            <thead>
              <tr className="border-b">
                <th className="text-left py-1">Asset</th>
                <th className="text-left py-1">Generated</th>
                <th className="text-left py-1">Missing/Failed</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ['Packages', audit.packages],
                  ['Images', audit.images],
                  ['Metadata', audit.metadata],
                  ['Video Metadata', audit.videoMetadata],
                  ['Schema', audit.schema],
                ] as const
              ).map(([label, row]) => (
                <tr key={label} className="border-b">
                  <td className="py-1">{label}</td>
                  <td className="py-1">{row.generated}</td>
                  <td className="py-1">{row.missingFailed}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            Orphan assets: {orphans?.count ?? 0}
            {data.orphanSweep
              ? ` · swept ${data.orphanSweep.deleted} (remaining ${data.orphanSweep.remaining})`
              : ''}
            {orphans && orphans.count > 0
              ? ` · ${orphans.items
                  .slice(0, 5)
                  .map((o) => `${o.table}:${o.id}`)
                  .join(', ')}`
              : ' (must be 0)'}
          </p>
        </div>
      ) : null}

      {data?.handoffAudit ? (
        <div
          className={`border p-2 space-y-2 ${
            data.handoffAudit.ok === false
              ? 'border-red-700 bg-red-950/20'
              : 'border-emerald-700/40'
          }`}
        >
          <p className="font-semibold">Handoff Audit (Generation → Submission Ready)</p>
          <p>
            Generated Packages: {data.handoffAudit.generatedPackages ?? 0}
          </p>
          <p>
            Submission Ready: {data.handoffAudit.submissionReady ?? 0}
          </p>
          <p>
            Execution Jobs: {data.handoffAudit.executionJobsQueued ?? 0} queued ·{' '}
            {data.handoffAudit.executionJobsRunning ?? 0} running
          </p>
          <p>
            Completed: {data.handoffAudit.completed ?? 0} · Waiting Human:{' '}
            {data.handoffAudit.waitingHuman ?? 0} · In flight:{' '}
            {data.handoffAudit.inFlight ?? 0}
          </p>
          <p>
            Blocked: {data.handoffAudit.blocked ?? 0}
            {data.handoffAudit.blockers
              ? ` → needs_review ${data.handoffAudit.blockers.needs_review ?? 0} · quality_failed ${data.handoffAudit.blockers.quality_failed ?? 0} · unsupported ${data.handoffAudit.blockers.unsupported ?? 0} · awaiting_profile ${data.handoffAudit.blockers.awaiting_site_profile ?? 0} · outreach ${data.handoffAudit.blockers.outreach_path ?? 0} · other ${data.handoffAudit.blockers.other ?? 0}`
              : ''}
          </p>
          <p className={data.handoffAudit.ok ? 'text-emerald-500' : 'text-red-400 font-semibold'}>
            CONSERVATION CHECK: {data.handoffAudit.conservationLeft ?? 0} ={' '}
            {(data.handoffAudit.submissionReady ?? 0) +
              (data.handoffAudit.inFlight ?? 0) +
              (data.handoffAudit.completed ?? 0) +
              (data.handoffAudit.blocked ?? 0)}{' '}
            {data.handoffAudit.ok ? '✅' : '❌'}
          </p>
          {data.handoffAudit.ok === false && Array.isArray(data.handoffAudit.violations) ? (
            <ul className="text-xs list-disc pl-4">
              {data.handoffAudit.violations.slice(0, 20).map((v: {
                id: string;
                website: string;
                reason: string;
              }) => (
                <li key={v.id + v.reason}>
                  {v.website} ({v.id}): {v.reason}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {data?.executionDiagnostics ? (
        <div
          className={`border p-2 space-y-2 ${
            data.executionDiagnostics.pipelineBroken
              ? 'border-red-700 bg-red-950/20'
              : 'border-emerald-700/40'
          }`}
        >
          <p className="font-semibold">Execution Diagnostics (Production Validation)</p>
          {data.executionDiagnostics.pipelineBroken ? (
            <p className="text-red-400 font-semibold">
              ❌ Execution pipeline broken — Ready ({data.executionDiagnostics.readyItems}) &gt;
              Execution Jobs ({data.executionDiagnostics.executionJobsCreated})
            </p>
          ) : (
            <p className="text-emerald-500">✓ Ready items covered by execution jobs or terminal skips</p>
          )}
          {data.executionDiagnostics.rootCause ? (
            <p>Root cause: {data.executionDiagnostics.rootCause}</p>
          ) : null}
          <p>
            Ready {data.executionDiagnostics.readyItems} · Jobs Created{' '}
            {data.executionDiagnostics.executionJobsCreated} · Queued{' '}
            {data.executionDiagnostics.jobsQueued} · Running{' '}
            {data.executionDiagnostics.jobsRunning} · Waiting Human{' '}
            {data.executionDiagnostics.jobsWaitingHuman} · Failed{' '}
            {data.executionDiagnostics.jobsFailed} · Completed{' '}
            {data.executionDiagnostics.jobsCompleted} · Skipped{' '}
            {data.executionDiagnostics.jobsSkipped} · Missing{' '}
            {data.executionDiagnostics.missingExecutionJobs}
          </p>
          {data.executionDiagnostics.ensureSummary ? (
            <p>
              Ensure: created={data.executionDiagnostics.ensureSummary.created} started=
              {data.executionDiagnostics.ensureSummary.started} skippedTerminal=
              {data.executionDiagnostics.ensureSummary.skippedTerminal} failed=
              {data.executionDiagnostics.ensureSummary.failed} alreadyHad=
              {data.executionDiagnostics.ensureSummary.alreadyHadJob}
            </p>
          ) : null}
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b">
                <th className="text-left py-1">Website</th>
                <th className="text-left py-1">Job?</th>
                <th className="text-left py-1">Status</th>
                <th className="text-left py-1">Start API</th>
                <th className="text-left py-1">Why / Blocker</th>
              </tr>
            </thead>
            <tbody>
              {(data.executionDiagnostics.items ?? []).slice(0, 40).map((row) => (
                <tr key={row.campaignItemId} className="border-b">
                  <td className="py-1">{row.website}</td>
                  <td className="py-1">{row.executionJobExists ? 'yes' : 'NO'}</td>
                  <td className="py-1">{row.executionJobStatus ?? '—'}</td>
                  <td className="py-1">
                    {row.startApiCalled == null
                      ? '—'
                      : row.startApiCalled
                        ? String(row.startApiResponse ?? 'called')
                        : 'not called'}
                  </td>
                  <td className="py-1 max-w-[320px] truncate">
                    {row.verifiedBlocker || row.whyNoJob || row.creationError || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {data?.executionAudit ? (
        <div className="border p-2 space-y-2">
          <p className="font-semibold">Execution audit (Phase 4)</p>
          <p>
            Workers: Healthy {data.executionAudit.workers.healthy} · Idle{' '}
            {data.executionAudit.workers.idle} · Running {data.executionAudit.workers.running} ·
            Stuck {data.executionAudit.workers.stuck} (must be 0)
          </p>
          <p>
            Browsers: Allocated {data.executionAudit.browsers.allocated} · Free{' '}
            {data.executionAudit.browsers.free} · Contexts {data.executionAudit.browsers.contexts}{' '}
            (Allocated == Contexts{' '}
            {data.executionAudit.browsers.allocatedEqualsContexts !== false ? 'OK' : 'FAIL'} · max{' '}
            {data.executionAudit.browsers.max})
          </p>
          {data.executionAudit.browsers.runtimeHealthy === false ? (
            <p className="text-destructive text-sm">
              Browser runtime unhealthy
              {data.executionAudit.browsers.browsersPath
                ? ` · PLAYWRIGHT_BROWSERS_PATH=${data.executionAudit.browsers.browsersPath}`
                : ''}
              {data.executionAudit.browsers.runtimeError
                ? ` — ${data.executionAudit.browsers.runtimeError}`
                : ' — Chromium not launchable (not a stuck queue)'}
            </p>
          ) : null}
          <p>
            Queue: Queued {data.executionAudit.queue.queued} · Running{' '}
            {data.executionAudit.queue.running} · Waiting Human{' '}
            {data.executionAudit.queue.waitingHuman} · Completed{' '}
            {data.executionAudit.queue.completed} · Failed {data.executionAudit.queue.failed} ·
            Retrying {data.executionAudit.queue.retrying} · Deleted{' '}
            {data.executionAudit.queue.deleted} · Ignored {data.executionAudit.queue.ignored}
          </p>
          {data.executionAudit.queueIntegrity ? (
            <p>
              Queue integrity (Phase 6): Items{' '}
              {data.executionAudit.queueIntegrity.distinctItemsWithActiveJobs} · Active jobs{' '}
              {data.executionAudit.queueIntegrity.activeJobs} · Duplicate active{' '}
              {data.executionAudit.queueIntegrity.duplicateActiveJobs} (must be 0) · Ratio{' '}
              {data.executionAudit.queueIntegrity.jobItemRatio} (target 1.0) · max/item{' '}
              {data.executionAudit.queueIntegrity.maxActivePerItem}
            </p>
          ) : null}
          <p>
            Invariants: stuck=0{' '}
            {data.executionAudit.invariants.stuckWorkersZero ? 'OK' : 'FAIL'} · ceiling{' '}
            {data.executionAudit.invariants.browsersWithinCeiling ? 'OK' : 'FAIL'}
            {data.executionAudit.invariants.allocatedEqualsContexts != null
              ? ` · Allocated==Contexts ${data.executionAudit.invariants.allocatedEqualsContexts ? 'OK' : 'FAIL'}`
              : ''}
            {data.executionAudit.invariants.runtimeHealthy != null
              ? ` · runtime ${data.executionAudit.invariants.runtimeHealthy ? 'OK' : 'FAIL'}`
              : ''}
            {data.executionAudit.invariants.duplicateActiveJobsZero != null
              ? ` · duplicates=0 ${data.executionAudit.invariants.duplicateActiveJobsZero ? 'OK' : 'FAIL'}`
              : ''}
          </p>
          {data.executionAudit.queueIntegrity?.duplicateViolations?.length ? (
            <p className="text-destructive text-sm">
              Violations:{' '}
              {data.executionAudit.queueIntegrity.duplicateViolations
                .slice(0, 8)
                .map((v) => `${v.opportunityId.slice(0, 8)}…×${v.count}`)
                .join(', ')}
            </p>
          ) : null}
        </div>
      ) : null}

      {data?.truthAudit ? (
        <div className="border p-2 space-y-2">
          <p className="font-semibold">Truth audit (Phase 4.5)</p>
          <p>
            Classifications {data.truthAudit.classifications} · Missing evidence{' '}
            {data.truthAudit.missingEvidence} (must be 0) · Unclassified{' '}
            {data.truthAudit.unclassified} · False interventions{' '}
            {data.truthAudit.falseInterventions} (rate {data.truthAudit.falseInterventionRate}) ·
            Phantom states {data.truthAudit.phantomStates} (must be 0)
          </p>
          <p>
            Invariants: missingEvidence=0{' '}
            {data.truthAudit.invariants.missingEvidenceZero ? 'OK' : 'FAIL'} · phantom=0{' '}
            {data.truthAudit.invariants.phantomStatesZero ? 'OK' : 'FAIL'}
          </p>
          <p>
            Rejected writes (last {data.truthAudit.rejectedWrites.length}):{' '}
            {data.truthAudit.rejectedWrites
              .slice(0, 8)
              .map((v) => `${v.kind}@${v.source}`)
              .join(' · ') || 'none'}
          </p>
        </div>
      ) : null}

      {data?.siteIntelligenceAudit ? (
        <div className="border p-2 space-y-2">
          <p className="font-semibold">Site Intelligence (Phase 5)</p>
          {'error' in data.siteIntelligenceAudit && data.siteIntelligenceAudit.error ? (
            <p>unavailable — apply migration 092</p>
          ) : (
            <>
              <p>
                Profiles {data.siteIntelligenceAudit.total} · avg pages{' '}
                {data.siteIntelligenceAudit.avgPagesFetched ?? 0} · avg ms{' '}
                {data.siteIntelligenceAudit.avgElapsedMs ?? 0}
              </p>
              <p>
                Status:{' '}
                {Object.entries(data.siteIntelligenceAudit.byStatus ?? {})
                  .map(([k, v]) => `${k}=${v}`)
                  .join(' · ') || 'none'}
              </p>
              <p>
                Strategy:{' '}
                {Object.entries(data.siteIntelligenceAudit.byStrategy ?? {})
                  .map(([k, v]) => `${k}=${v}`)
                  .join(' · ') || 'none'}
              </p>
              {data.siteIntelligenceAudit.wordpressHealth ? (
                <div className="border border-dashed p-2 space-y-1">
                  <p className="font-semibold">WordPress Health (Capability 1)</p>
                  <p>
                    Detected {data.siteIntelligenceAudit.wordpressHealth.detected} · Comment{' '}
                    {data.siteIntelligenceAudit.wordpressHealth.comment} · Guest Post{' '}
                    {data.siteIntelligenceAudit.wordpressHealth.guestPost} · Dashboard{' '}
                    {data.siteIntelligenceAudit.wordpressHealth.dashboard} · Contact{' '}
                    {data.siteIntelligenceAudit.wordpressHealth.contactForm} · Email{' '}
                    {data.siteIntelligenceAudit.wordpressHealth.email} · Unsupported{' '}
                    {data.siteIntelligenceAudit.wordpressHealth.unsupported} · Success Rate{' '}
                    {data.siteIntelligenceAudit.wordpressHealth.successRate ?? '—'}
                  </p>
                </div>
              ) : null}
              {data.siteIntelligenceAudit.directoryHealth ? (
                <div className="border border-dashed p-2 space-y-1">
                  <p className="font-semibold">Directory Health (Capability 2)</p>
                  <p>
                    Detected {data.siteIntelligenceAudit.directoryHealth.detected} · Supported{' '}
                    {data.siteIntelligenceAudit.directoryHealth.supported} · Free{' '}
                    {data.siteIntelligenceAudit.directoryHealth.free} · Paid{' '}
                    {data.siteIntelligenceAudit.directoryHealth.paid} · Dashboard{' '}
                    {data.siteIntelligenceAudit.directoryHealth.dashboard} · Email{' '}
                    {data.siteIntelligenceAudit.directoryHealth.email} · Contact{' '}
                    {data.siteIntelligenceAudit.directoryHealth.contactForm} · Unsupported{' '}
                    {data.siteIntelligenceAudit.directoryHealth.unsupported} · Success Rate{' '}
                    {data.siteIntelligenceAudit.directoryHealth.successRate ?? '—'}
                  </p>
                </div>
              ) : null}
              {data.siteIntelligenceAudit.contactFormHealth ? (
                <div className="border border-dashed p-2 space-y-1">
                  <p className="font-semibold">Contact Form Health (Capability 3)</p>
                  <p>
                    Detected {data.siteIntelligenceAudit.contactFormHealth.detected} · Supported{' '}
                    {data.siteIntelligenceAudit.contactFormHealth.supported} · Unsupported{' '}
                    {data.siteIntelligenceAudit.contactFormHealth.unsupported} · Successful{' '}
                    {data.siteIntelligenceAudit.contactFormHealth.successful} · Failed{' '}
                    {data.siteIntelligenceAudit.contactFormHealth.failed} · CAPTCHA{' '}
                    {data.siteIntelligenceAudit.contactFormHealth.captcha} · Manual Review{' '}
                    {data.siteIntelligenceAudit.contactFormHealth.manualReview} · Avg Time{' '}
                    {data.siteIntelligenceAudit.contactFormHealth.averageCompletionTimeMs ?? '—'}
                    ms · Success Rate{' '}
                    {data.siteIntelligenceAudit.contactFormHealth.successRate ?? '—'}
                  </p>
                </div>
              ) : null}
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-1">Domain</th>
                    <th className="text-left py-1">Status</th>
                    <th className="text-left py-1">Platform</th>
                    <th className="text-left py-1">Strategy</th>
                    <th className="text-left py-1">Entry</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.siteIntelligenceAudit.profiles ?? []).slice(0, 40).map((p) => (
                    <tr key={p.domain} className="border-b">
                      <td className="py-1">{p.domain}</td>
                      <td className="py-1">{p.status}</td>
                      <td className="py-1">{p.platform ?? '—'}</td>
                      <td className="py-1">{p.strategy ?? '—'}</td>
                      <td className="py-1 max-w-[220px] truncate">{p.entryUrl ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      ) : null}

      {health.isLoading ? <p>Loading…</p> : null}
      {health.isError ? <p className="text-red-600">Failed to load campaign health</p> : null}

      <div className="overflow-x-auto border">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b bg-muted/40">
              {[
                'Website',
                'Imported',
                'Analyzed',
                'Approved',
                'Package',
                'Images',
                'Metadata',
                'Video Meta',
                'Schema',
                'Gen Status',
                'Quality',
                'Retries',
                'Pkg By',
                'Submission',
                'Verification',
                'Current Status',
                'Confidence',
                'Tier',
                'Review Decision',
                'Approved By',
                'Last Error',
                'Updated At',
              ].map((h) => (
                <th key={h} className="px-2 py-1 font-medium whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((row) => (
              <tr key={`${row.website}-${row.updatedAt}`} className="border-b">
                <td className="px-2 py-1 max-w-[180px] truncate">{row.website}</td>
                <td className="px-2 py-1">{row.imported ? 'Y' : ''}</td>
                <td className="px-2 py-1">{row.analyzed ? 'Y' : ''}</td>
                <td className="px-2 py-1">{row.approved ? 'Y' : ''}</td>
                <td className="px-2 py-1">{row.package}</td>
                <td className="px-2 py-1">{row.images}</td>
                <td className="px-2 py-1">{row.metadata}</td>
                <td className="px-2 py-1">{row.videoMeta}</td>
                <td className="px-2 py-1">{row.schema}</td>
                <td className="px-2 py-1">{row.generationStatus}</td>
                <td className="px-2 py-1">{row.qualityScore ?? ''}</td>
                <td className="px-2 py-1">{row.retryCount ?? ''}</td>
                <td className="px-2 py-1">{row.packageApprovedBy}</td>
                <td className="px-2 py-1">{row.submission}</td>
                <td className="px-2 py-1">{row.verification}</td>
                <td className="px-2 py-1">{row.currentStatus}</td>
                <td className="px-2 py-1">{row.confidence ?? ''}</td>
                <td className="px-2 py-1">{row.tier ?? ''}</td>
                <td className="px-2 py-1">{row.reviewDecision ?? ''}</td>
                <td className="px-2 py-1">{row.approvedBy ?? ''}</td>
                <td className="px-2 py-1 max-w-[200px] truncate">{row.lastError}</td>
                <td className="px-2 py-1 whitespace-nowrap">{row.updatedAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

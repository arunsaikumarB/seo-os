/**
 * Campaign Health — internal audit table (plain HTML-ish UI).
 * Route is not linked from main nav; open directly for sync debugging.
 */
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useApi } from '@/hooks/use-api';

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
  generationProgress?: Record<string, number | boolean>;
  executionAudit?: {
    workers: { healthy: number; idle: number; running: number; stuck: number };
    browsers: { allocated: number; free: number; contexts: number; max: number };
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
    invariants: { stuckWorkersZero: boolean; browsersWithinCeiling: boolean };
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
  items: HealthRow[];
};

export function CampaignHealthPage() {
  const { projectId = '' } = useParams();
  const { request } = useApi();

  const health = useQuery({
    queryKey: ['campaign-health', projectId],
    queryFn: () =>
      request<{ data: HealthData }>(
        `/v1/projects/${projectId}/backlink-builder/campaign-health`
      ),
    enabled: !!projectId,
    refetchInterval: 5_000,
  });

  const data = health.data?.data;
  const totals = data?.totals;
  const audit = data?.generationAudit;
  const orphans = data?.orphans;

  return (
    <div className="space-y-4 p-2 font-mono text-xs">
      <div>
        <h1 className="text-sm font-semibold">Campaign Health (audit)</h1>
        <p className="text-muted-foreground">
          Dev-only · every Campaign Item once · totals from Campaign State Manager
        </p>
      </div>

      {totals ? (
        <div className="flex flex-wrap gap-3 border p-2">
          <span>imported={totals.imported}</span>
          <span>approved={totals.approved}</span>
          <span>ready={totals.ready}</span>
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
            {orphans && orphans.count > 0
              ? ` · ${orphans.items
                  .slice(0, 5)
                  .map((o) => `${o.table}:${o.id}`)
                  .join(', ')}`
              : ' (must be 0)'}
          </p>
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
            (Allocated + Free ≤ {data.executionAudit.browsers.max})
          </p>
          <p>
            Queue: Queued {data.executionAudit.queue.queued} · Running{' '}
            {data.executionAudit.queue.running} · Waiting Human{' '}
            {data.executionAudit.queue.waitingHuman} · Completed{' '}
            {data.executionAudit.queue.completed} · Failed {data.executionAudit.queue.failed} ·
            Retrying {data.executionAudit.queue.retrying} · Deleted{' '}
            {data.executionAudit.queue.deleted} · Ignored {data.executionAudit.queue.ignored}
          </p>
          <p>
            Invariants: stuck=0{' '}
            {data.executionAudit.invariants.stuckWorkersZero ? 'OK' : 'FAIL'} · ceiling{' '}
            {data.executionAudit.invariants.browsersWithinCeiling ? 'OK' : 'FAIL'}
          </p>
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

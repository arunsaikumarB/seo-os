import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  SkipForward,
  Trash2,
  RotateCcw,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useApi } from '@/hooks/use-api';
import {
  useInterventions,
  type InterventionItem,
  type InterventionsPayload,
} from '@/components/browser/needs-your-action-queue';
import { useBeeExecutionProgress } from '@/hooks/use-bee-execution-progress';
import {
  openInterventionWindow,
  runCompleteAllSequence,
} from '@/lib/intervention-window';
import { useExecutionSummary, explainWaitingHuman } from '@/hooks/use-execution-summary';
import { cn } from '@/lib/utils';

type Props = {
  projectId: string;
  /** When true and queue empty during a running campaign, show calm empty copy */
  campaignActive?: boolean;
};

type InterventionDetail = {
  jobId: string;
  website: string;
  reason: string;
  title: string;
  instruction: string;
  explanation?: string;
  gate: string;
  completedByAi: string[];
  userOnly: string;
  pausedUrl?: string | null;
  currentStepLabel?: string;
  stepLabel?: string;
  screenshot?: { url?: string | null } | null;
};

function gateHeadline(item: InterventionItem, detail?: InterventionDetail | null): string {
  if (detail?.title) return detail.title.replace(/^AI needs your help —\s*/i, '').trim() || detail.title;
  const g = item.gate;
  if (g === 'login') return 'Login Required';
  if (g === 'signup') return 'Registration Required';
  if (g === 'captcha' || g === 'cloudflare') return 'CAPTCHA / Security Check';
  if (g === 'human_approval') return 'Manual Approval Required';
  if (g === 'mfa' || g === 'otp') return 'Verification Code Required';
  if (g === 'email_verify') return 'Email Verification Required';
  if (g === 'phone_verify') return 'Phone Verification Required';
  if (g === 'unclassified') return 'Unclassified — needs diagnosis';
  return item.title || item.reason || 'Action Required';
}

const DEFAULT_DONE = [
  'Website navigation',
  'Form detection',
  'Content generation',
  'Image upload',
];

function lanePayload(data: InterventionsPayload | undefined) {
  const laneBItems = data?.laneB?.items ?? data?.items?.filter((i) => i.lane !== 'auto') ?? [];
  const laneAItems = data?.laneA?.items ?? data?.items?.filter((i) => i.lane === 'auto') ?? [];
  const autoSubmitting = data?.autoSubmitting ?? data?.lanes?.autoSubmitting ?? 0;
  return {
    laneAItems,
    laneBItems,
    laneACount: data?.laneA?.count ?? laneAItems.length,
    laneBCount: data?.laneB?.count ?? laneBItems.length,
    autoSubmitting,
  };
}

/**
 * Phase 6.2 — Two-lane submission surface:
 * Lane A = AI submitting (+ batch publish confirm)
 * Lane B = genuine human gates only (CAPTCHA / Login / Manual / Unclassified)
 */
export function HumanInterventionQueue({ projectId, campaignActive }: Props) {
  const { request } = useApi();
  const qc = useQueryClient();
  const progress = useBeeExecutionProgress(projectId, 2_000);
  const summary = useExecutionSummary(projectId, 1_500);
  const interventions = useInterventions(projectId, 2_000);
  const payload = interventions.data?.data;
  const { laneAItems, laneBItems, laneACount, laneBCount, autoSubmitting } = lanePayload(payload);

  const [index, setIndex] = useState(0);
  const [showDetails, setShowDetails] = useState(false);
  const [completeAllRunning, setCompleteAllRunning] = useState(false);
  const [completeAllStep, setCompleteAllStep] = useState<string | null>(null);
  const [justFinishedAll, setJustFinishedAll] = useState(false);
  const [successFlash, setSuccessFlash] = useState<string | null>(null);

  const items = laneBItems;
  const needsHelp = laneBCount;
  const current = items[Math.min(index, Math.max(0, items.length - 1))] ?? null;

  const p = progress.data;
  const sum = summary.data;
  const submitted = sum?.completed ?? p?.submitted ?? p?.completedJobs ?? 0;
  const running = sum?.running ?? p?.running ?? 0;
  const remaining = sum?.remaining ?? p?.remainingJobs ?? 0;
  const showProgressStrip =
    needsHelp > 0 ||
    laneACount > 0 ||
    autoSubmitting > 0 ||
    Boolean(campaignActive) ||
    submitted > 0 ||
    running > 0 ||
    remaining > 0;

  const progressStrip = showProgressStrip ? (
    <Card className="rounded-2xl border-border/40">
      <CardContent className="pt-5 pb-4">
        <p className="text-sm font-medium mb-3 flex items-center gap-2">
          <span aria-hidden>🤖</span> AI Progress
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(
            [
              ['Completed', submitted],
              ['Running', running],
              ['Need you', needsHelp],
              ['Remaining', remaining],
            ] as const
          ).map(([label, value]) => (
            <div key={label}>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p
                className={cn(
                  'text-xl font-semibold tabular-nums mt-0.5',
                  label === 'Need you' && value > 0 && 'text-amber-800 dark:text-amber-200'
                )}
              >
                {value}
              </p>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Lane A: {laneACount + autoSubmitting} submitting automatically
          {' · '}
          Lane B: {needsHelp} need you (CAPTCHA / Login / Manual)
        </p>
        {sum && sum.total > 0 ? (
          <div className="mt-3 space-y-1">
            <p className="text-xs text-muted-foreground tabular-nums">
              Progress {Math.round(sum.progressPercent)}%
            </p>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, sum.progressPercent))}%` }}
              />
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  ) : null;

  useEffect(() => {
    if (index >= items.length && items.length > 0) setIndex(0);
  }, [items.length, index]);

  useEffect(() => {
    setShowDetails(false);
  }, [current?.jobId]);

  const detailQ = useQuery({
    queryKey: ['bee-intervention', projectId, current?.jobId],
    queryFn: () =>
      request<{ data: InterventionDetail }>(
        `/v1/projects/${projectId}/browser/jobs/${current!.jobId}/intervention`
      ),
    enabled: !!projectId && !!current?.jobId,
    refetchInterval: 4_000,
  });
  const detail = detailQ.data?.data;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['bee-interventions', projectId] });
    qc.invalidateQueries({ queryKey: ['bee-jobs', projectId] });
    qc.invalidateQueries({ queryKey: ['bee-stats', projectId] });
    qc.invalidateQueries({ queryKey: ['bee-opportunities', projectId] });
    qc.invalidateQueries({ queryKey: ['execution-state', projectId] });
    qc.invalidateQueries({ queryKey: ['execution-summary', projectId] });
    qc.invalidateQueries({ queryKey: ['bee-execution-progress', projectId] });
    qc.invalidateQueries({ queryKey: ['backlink-pending', projectId] });
  };

  const laneBIds = useMemo(() => items.map((i) => i.jobId), [items]);

  const bulk = useMutation({
    mutationFn: (action: 'skip' | 'delete_forever' | 'retry') =>
      request<{ data: { ok: number; failed: number } }>(
        `/v1/projects/${projectId}/browser/interventions/bulk`,
        {
          method: 'POST',
          body: JSON.stringify({ jobIds: laneBIds, action }),
        }
      ),
    onSuccess: (res, action) => {
      const labels: Record<string, string> = {
        skip: 'Skipped for this campaign',
        delete_forever: 'Deleted forever — Global Ignore updated',
        retry: 'Retrying',
      };
      toast.success(`${labels[action] ?? action}: ${res.data.ok} site(s)`);
      setIndex(0);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submitLaneA = useMutation({
    mutationFn: () =>
      request<{ data: { ok: number; failed: number } }>(
        `/v1/projects/${projectId}/browser/interventions/approve-lane-a`,
        { method: 'POST', body: JSON.stringify({}) }
      ),
    onSuccess: (res) => {
      toast.success(`Submitted ${res.data.ok} site(s) — AI continues`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const skipOne = useMutation({
    mutationFn: (jobId: string) =>
      request(`/v1/projects/${projectId}/browser/interventions/bulk`, {
        method: 'POST',
        body: JSON.stringify({ jobIds: [jobId], action: 'skip' }),
      }),
    onSuccess: () => {
      toast.success('Skipped for this campaign');
      setSuccessFlash('Skipped. Moving on…');
      window.setTimeout(() => setSuccessFlash(null), 1_800);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteOne = useMutation({
    mutationFn: (jobId: string) =>
      request(`/v1/projects/${projectId}/browser/interventions/bulk`, {
        method: 'POST',
        body: JSON.stringify({ jobIds: [jobId], action: 'delete_forever' }),
      }),
    onSuccess: () => {
      toast.success('Deleted forever — Global Ignore List updated');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const runCompleteAllLaneB = async () => {
    if (completeAllRunning || laneBIds.length === 0) return;
    setCompleteAllRunning(true);
    setJustFinishedAll(false);
    try {
      await runCompleteAllSequence(projectId, laneBIds, ({ index: i, total, phase }) => {
        if (phase === 'opening' || phase === 'waiting') {
          setCompleteAllStep(`Website ${i + 1} of ${total}`);
        }
        if (phase === 'done') {
          setSuccessFlash('✓ Completed — AI resumed. Opening next website…');
          window.setTimeout(() => setSuccessFlash(null), 2_000);
          invalidate();
        }
        if (phase === 'finished') {
          setJustFinishedAll(true);
          setCompleteAllStep(null);
        }
      });
      toast.success('All Lane B gates cleared. AI continues automatically.');
      invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Complete All stopped');
    } finally {
      setCompleteAllRunning(false);
      setCompleteAllStep(null);
    }
  };

  const laneASection =
    laneACount > 0 || autoSubmitting > 0 ? (
      <Card className="rounded-2xl border-emerald-500/25 bg-emerald-500/[0.03]">
        <CardContent className="pt-5 pb-5 space-y-3">
          <div>
            <h2 className="text-base font-semibold tracking-tight">Lane A — AI is submitting</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {autoSubmitting > 0
                ? `${autoSubmitting} site${autoSubmitting === 1 ? '' : 's'} in progress automatically.`
                : null}
              {laneACount > 0
                ? ` ${laneACount} ready to publish — one confirmation covers all.`
                : autoSubmitting > 0
                  ? ' No human action needed.'
                  : null}
            </p>
          </div>
          {laneAItems.length > 0 ? (
            <ul className="text-sm space-y-1 max-h-36 overflow-y-auto">
              {laneAItems.slice(0, 12).map((i) => (
                <li key={i.jobId} className="flex justify-between gap-2">
                  <span className="truncate">{i.website}</span>
                  <span className="text-muted-foreground shrink-0">Ready to publish</span>
                </li>
              ))}
              {laneAItems.length > 12 ? (
                <li className="text-muted-foreground">+{laneAItems.length - 12} more</li>
              ) : null}
            </ul>
          ) : null}
          {laneACount > 0 ? (
            <Button
              size="sm"
              onClick={() => submitLaneA.mutate()}
              disabled={submitLaneA.isPending}
            >
              {submitLaneA.isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                  Submitting…
                </>
              ) : (
                `Submit all ready (${laneACount})`
              )}
            </Button>
          ) : null}
        </CardContent>
      </Card>
    ) : null;

  if (needsHelp === 0 && laneACount === 0 && autoSubmitting === 0) {
    if (justFinishedAll) {
      return (
        <div className="space-y-4">
          {progressStrip}
          <Card className="rounded-2xl border-emerald-500/25 bg-emerald-500/[0.04]">
            <CardContent className="pt-6 pb-6 text-center space-y-2">
              <p className="text-base font-semibold">All manual gates cleared.</p>
              <p className="text-sm text-muted-foreground">AI continues automatically.</p>
            </CardContent>
          </Card>
        </div>
      );
    }
    if (campaignActive || (sum?.waitingHuman ?? 0) > 0) {
      return (
        <div className="space-y-4">
          {progressStrip}
          <Card className="rounded-2xl border-border/40">
            <CardContent className="pt-5 pb-5">
              <p className="text-sm font-medium">AI is handling all submissions.</p>
              <p className="text-sm text-muted-foreground mt-1">No human gates right now.</p>
            </CardContent>
          </Card>
        </div>
      );
    }
    return progressStrip;
  }

  if (needsHelp === 0) {
    return (
      <div className="space-y-4">
        {progressStrip}
        {laneASection}
      </div>
    );
  }

  const doneList =
    detail?.completedByAi?.length && detail.completedByAi.length > 0
      ? detail.completedByAi
      : DEFAULT_DONE;
  const reason =
    detail?.explanation ||
    detail?.instruction ||
    current?.explanation ||
    current?.instruction ||
    current?.reason;
  const waitExplain = current
    ? explainWaitingHuman(current.gate, reason)
    : { title: 'Waiting Human', detail: '' };
  const headline = current
    ? waitExplain.title !== 'Waiting Human'
      ? waitExplain.title
      : gateHeadline(current, detail)
    : '';
  const screenshotUrl = detail?.screenshot?.url ?? null;

  return (
    <div className="space-y-4">
      {progressStrip}

      {successFlash ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{successFlash}</span>
        </div>
      ) : null}

      {laneASection}

      {completeAllRunning ? (
        <div className="rounded-2xl border border-border/40 bg-muted/30 px-4 py-3 text-sm flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
          <span>
            Completing Lane B… {completeAllStep ?? ''} Finish each gated site — the next opens
            automatically.
          </span>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-muted-foreground mr-auto w-full sm:w-auto">
          Lane B — {needsHelp} need you (CAPTCHA / Login / Manual)
        </p>
        <Button size="sm" onClick={() => void runCompleteAllLaneB()} disabled={completeAllRunning}>
          {completeAllRunning ? (
            <>
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              Completing…
            </>
          ) : (
            'Complete All in Lane B'
          )}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={bulk.isPending || completeAllRunning || laneBIds.length === 0}
          onClick={() => bulk.mutate('skip')}
        >
          <SkipForward className="h-3.5 w-3.5 mr-1" />
          Skip All
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={bulk.isPending || completeAllRunning || laneBIds.length === 0}
          onClick={() => {
            if (
              !window.confirm(
                'Delete forever? These domains will be added to the Global Ignore List for all future projects.'
              )
            ) {
              return;
            }
            bulk.mutate('delete_forever');
          }}
        >
          <Trash2 className="h-3.5 w-3.5 mr-1" />
          Delete All
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={bulk.isPending || completeAllRunning || (p?.failed ?? 0) === 0}
          onClick={() => bulk.mutate('retry')}
          title="Retry failed intervention jobs in Lane B"
        >
          <RotateCcw className="h-3.5 w-3.5 mr-1" />
          Retry Failed
        </Button>
      </div>

      {current ? (
        <Card className="rounded-2xl border-amber-500/30 bg-amber-500/[0.04]">
          <CardContent className="pt-6 space-y-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-amber-800/80 dark:text-amber-200/80 mb-1">
                Lane B · Human gate
              </p>
              <h2 className="text-lg font-semibold tracking-tight">{headline}</h2>
              <p className="text-sm text-muted-foreground mt-3">
                <span className="text-foreground/70">Website</span>
              </p>
              <p className="text-base font-medium">{current.website}</p>
              <p className="text-sm text-muted-foreground mt-3">
                <span className="text-foreground/70">Gate</span>
              </p>
              <p className="text-sm mt-0.5 font-medium">
                {current.truthClaim || waitExplain.title || headline}
              </p>
              <p className="text-sm text-muted-foreground mt-3">
                <span className="text-foreground/70">Evidence</span>
              </p>
              <p className="text-sm mt-0.5">{waitExplain.detail || reason}</p>
              {detail?.pausedUrl || current.pausedUrl ? (
                <>
                  <p className="text-sm text-muted-foreground mt-3">
                    <span className="text-foreground/70">Current URL</span>
                  </p>
                  <p className="text-sm mt-0.5 break-all">
                    {detail?.pausedUrl || current.pausedUrl}
                  </p>
                </>
              ) : null}
              {screenshotUrl ? (
                <div className="mt-3 rounded-lg overflow-hidden border border-border/40 max-w-md">
                  <img
                    src={screenshotUrl}
                    alt={`Evidence for ${current.website}`}
                    className="w-full h-auto"
                  />
                </div>
              ) : null}
              {(detail?.currentStepLabel || detail?.stepLabel) && (
                <>
                  <p className="text-sm text-muted-foreground mt-3">
                    <span className="text-foreground/70">Current Step</span>
                  </p>
                  <p className="text-sm mt-0.5">
                    {detail.currentStepLabel || detail.stepLabel}
                  </p>
                </>
              )}
            </div>

            <div className="space-y-1.5">
              <p className="text-sm font-medium">AI has already completed</p>
              <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-0.5">
                {doneList.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                onClick={() =>
                  openInterventionWindow(projectId, current.jobId)
                }
                disabled={completeAllRunning}
              >
                Complete Now
              </Button>
              <Button
                variant="outline"
                disabled={skipOne.isPending || completeAllRunning}
                onClick={() => skipOne.mutate(current.jobId)}
              >
                Skip
              </Button>
              <Button
                variant="outline"
                disabled={deleteOne.isPending || completeAllRunning}
                onClick={() => {
                  if (
                    !window.confirm(
                      'Delete forever? This domain will be added to the Global Ignore List.'
                    )
                  ) {
                    return;
                  }
                  deleteOne.mutate(current.jobId);
                }}
              >
                Delete Forever
              </Button>
              {items.length > 1 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIndex((i) => (i + 1) % items.length)}
                >
                  Next ({index + 1}/{items.length})
                </Button>
              ) : null}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDetails((v) => !v)}
              >
                {showDetails ? (
                  <>
                    <ChevronUp className="h-3.5 w-3.5 mr-1" /> Hide details
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3.5 w-3.5 mr-1" /> Details
                  </>
                )}
              </Button>
            </div>

            {showDetails ? (
              <pre className="text-xs bg-muted/40 rounded-lg p-3 overflow-x-auto">
                {JSON.stringify(
                  {
                    gate: current.gate,
                    truthClaim: current.truthClaim,
                    evidenceId: current.evidenceId,
                    matchedSignals: current.matchedSignals,
                    stage: current.stage,
                  },
                  null,
                  2
                )}
              </pre>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

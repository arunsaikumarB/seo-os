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
} from '@/components/browser/needs-your-action-queue';
import { useBeeExecutionProgress } from '@/hooks/use-bee-execution-progress';
import {
  openInterventionWindow,
  runCompleteAllSequence,
} from '@/lib/intervention-window';
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

/**
 * Phase 4.6 — Human Intervention as a task list (one card at a time).
 * Uses existing intervention APIs only — no engine/API/DB changes.
 */
export function HumanInterventionQueue({ projectId, campaignActive }: Props) {
  const { request } = useApi();
  const qc = useQueryClient();
  const progress = useBeeExecutionProgress(projectId, 2_000);
  const interventions = useInterventions(projectId, 2_000);
  const items = interventions.data?.data.items ?? [];
  const [index, setIndex] = useState(0);
  const [showDetails, setShowDetails] = useState(false);
  const [completeAllRunning, setCompleteAllRunning] = useState(false);
  const [completeAllStep, setCompleteAllStep] = useState<string | null>(null);
  const [justFinishedAll, setJustFinishedAll] = useState(false);
  const [successFlash, setSuccessFlash] = useState<string | null>(null);

  const needsHelp = items.length;
  const current = items[Math.min(index, Math.max(0, items.length - 1))] ?? null;

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
    qc.invalidateQueries({ queryKey: ['bee-execution-progress', projectId] });
    qc.invalidateQueries({ queryKey: ['backlink-pending', projectId] });
  };

  const allIds = useMemo(() => items.map((i) => i.jobId), [items]);

  const bulk = useMutation({
    mutationFn: (action: 'skip' | 'delete_forever' | 'retry') =>
      request<{ data: { ok: number; failed: number } }>(
        `/v1/projects/${projectId}/browser/interventions/bulk`,
        {
          method: 'POST',
          body: JSON.stringify({ jobIds: allIds, action }),
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

  const runCompleteAll = async () => {
    if (completeAllRunning || allIds.length === 0) return;
    setCompleteAllRunning(true);
    setJustFinishedAll(false);
    try {
      await runCompleteAllSequence(projectId, allIds, ({ index: i, total, phase }) => {
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
      toast.success('All manual tasks completed. AI continues automatically.');
      invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Complete All stopped');
    } finally {
      setCompleteAllRunning(false);
      setCompleteAllStep(null);
    }
  };

  const p = progress.data;
  const submitted = p?.submitted ?? p?.completedJobs ?? 0;
  const running = p?.running ?? 0;
  const remaining = p?.remainingJobs ?? 0;

  // Empty: no intervention section (calm message only when campaign is active)
  if (needsHelp === 0) {
    if (justFinishedAll) {
      return (
        <Card className="rounded-2xl border-emerald-500/25 bg-emerald-500/[0.04]">
          <CardContent className="pt-6 pb-6 text-center space-y-2">
            <p className="text-2xl" aria-hidden>
              🎉
            </p>
            <p className="text-base font-semibold">All manual tasks completed.</p>
            <p className="text-sm text-muted-foreground">AI continues automatically.</p>
          </CardContent>
        </Card>
      );
    }
    if (campaignActive) {
      return (
        <Card className="rounded-2xl border-border/40">
          <CardContent className="pt-5 pb-5">
            <p className="text-sm font-medium">AI is handling all submissions.</p>
            <p className="text-sm text-muted-foreground mt-1">No action required.</p>
          </CardContent>
        </Card>
      );
    }
    return null;
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
  const headline = current ? gateHeadline(current, detail) : '';

  return (
    <div className="space-y-4">
      {/* AI Progress */}
      <Card className="rounded-2xl border-border/40">
        <CardContent className="pt-5 pb-4">
          <p className="text-sm font-medium mb-3 flex items-center gap-2">
            <span aria-hidden>🤖</span> AI Progress
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(
              [
                ['Submitted', submitted],
                ['Running', running],
                ['Remaining', remaining],
                ['Needs Your Help', needsHelp],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p
                  className={cn(
                    'text-xl font-semibold tabular-nums mt-0.5',
                    label === 'Needs Your Help' && 'text-amber-800 dark:text-amber-200'
                  )}
                >
                  {value}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {successFlash ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{successFlash}</span>
        </div>
      ) : null}

      {completeAllRunning ? (
        <div className="rounded-2xl border border-border/40 bg-muted/30 px-4 py-3 text-sm flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
          <span>
            Completing tasks… {completeAllStep ?? ''} Finish each paused site — the next opens
            automatically.
          </span>
        </div>
      ) : null}

      {/* Bulk — only Complete All / Skip All / Delete All / Retry Failed */}
      <div className="flex flex-wrap items-center gap-2">
        {needsHelp > 1 ? (
          <p className="text-sm text-muted-foreground mr-auto w-full sm:w-auto">
            {needsHelp} websites need your help.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground mr-auto w-full sm:w-auto">
            1 website needs your help.
          </p>
        )}
        <Button size="sm" onClick={() => void runCompleteAll()} disabled={completeAllRunning}>
          {completeAllRunning ? (
            <>
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              Completing…
            </>
          ) : (
            'Complete All'
          )}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={bulk.isPending || completeAllRunning}
          onClick={() => bulk.mutate('skip')}
        >
          <SkipForward className="h-3.5 w-3.5 mr-1" />
          Skip All
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={bulk.isPending || completeAllRunning}
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
          title="Retry failed intervention jobs in this queue"
        >
          <RotateCcw className="h-3.5 w-3.5 mr-1" />
          Retry Failed
        </Button>
      </div>

      {/* One intervention card */}
      {current ? (
        <Card className="rounded-2xl border-amber-500/30 bg-amber-500/[0.04]">
          <CardContent className="pt-6 space-y-4">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">{headline}</h2>
              <p className="text-sm text-muted-foreground mt-3">
                <span className="text-foreground/70">Website</span>
              </p>
              <p className="text-base font-medium">{current.website}</p>
              <p className="text-sm text-muted-foreground mt-3">
                <span className="text-foreground/70">Reason</span>
              </p>
              <p className="text-sm mt-0.5">{reason}</p>
            </div>

            <div className="space-y-1.5">
              <p className="text-sm font-medium">AI has already completed</p>
              <ul className="space-y-1">
                {doneList.map((line) => (
                  <li key={line} className="text-sm text-muted-foreground flex items-start gap-2">
                    <span className="text-emerald-600 shrink-0">✓</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
              <p className="text-sm pt-2">
                You only need to{' '}
                {current.gate === 'human_approval'
                  ? 'approve this submission'
                  : current.gate === 'login'
                    ? 'sign in on the paused page'
                    : current.gate === 'captcha' || current.gate === 'cloudflare'
                      ? 'complete the security check'
                      : 'finish this step on the paused page'}
                .
              </p>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                onClick={() => openInterventionWindow(projectId, current.jobId)}
                disabled={completeAllRunning}
              >
                Complete Now
              </Button>
              <Button
                variant="outline"
                size="default"
                disabled={skipOne.isPending || completeAllRunning}
                onClick={() => skipOne.mutate(current.jobId)}
              >
                Skip
              </Button>
              <Button
                variant="outline"
                size="default"
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
                  size="default"
                  disabled={completeAllRunning}
                  onClick={() => setIndex((i) => (i + 1) % items.length)}
                >
                  Next task
                </Button>
              ) : null}
            </div>

            <button
              type="button"
              className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-foreground"
              onClick={() => setShowDetails((v) => !v)}
            >
              {showDetails ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
              View Details
            </button>

            {showDetails ? (
              <div className="rounded-xl border border-border/50 bg-background/60 px-3 py-3 space-y-2 text-sm">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Timeline
                </p>
                <ol className="space-y-1.5 text-sm">
                  {[
                    'Imported',
                    'Reviewed',
                    'Approved',
                    'Generated',
                    'Browser Opened',
                    'Form Found',
                    'Upload Complete',
                    'Waiting Approval',
                  ].map((step, i, arr) => {
                    const isCurrent = i === arr.length - 1;
                    return (
                      <li
                        key={step}
                        className={cn(
                          'flex items-center gap-2',
                          isCurrent ? 'font-medium text-amber-900 dark:text-amber-100' : 'text-muted-foreground'
                        )}
                      >
                        <span className={isCurrent ? 'text-amber-600' : 'text-emerald-600'}>
                          {isCurrent ? '●' : '✓'}
                        </span>
                        {step}
                        {isCurrent ? (
                          <span className="text-[10px] uppercase tracking-wide text-amber-700 dark:text-amber-300">
                            Current
                          </span>
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
                <p className="text-xs text-muted-foreground pt-2">
                  Step: {detail?.currentStepLabel || detail?.stepLabel || current.detectedStep || '—'}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Evidence, screenshots, workers, and DOM live in Advanced Tools.
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useApi } from '@/hooks/use-api';
import { useInterventions } from '@/components/browser/needs-your-action-queue';
import { AiLoadingState } from '@/components/workflow/ai-activity-card';
import {
  normalizeSiteUrl,
  notifyInterventionResumed,
  openRealWebsiteTab,
} from '@/lib/intervention-window';

type InterventionDetail = {
  jobId: string;
  website: string;
  status: string;
  displayStatus: string;
  gate: string;
  reason: string;
  title: string;
  instruction: string;
  explanation?: string;
  successToast: string;
  stepLabel: string;
  currentStepLabel?: string;
  needsAction: boolean;
  completedByAi: string[];
  userOnly: string;
  pausedUrl?: string | null;
  openUrl?: string | null;
  liveUrl?: string | null;
  pageTitle?: string | null;
  screenshot?: { url?: string | null; label?: string } | null;
  domEvidence?: string | null;
  pauseEvidence?: string[];
};

/**
 * Minimal helper — opens the exact paused URL; monitors completion via existing APIs.
 * Phase 4.6: guided copy, success handoff, no technical tables.
 */
export function InterventionWindowPage() {
  const { projectId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const jobId = params.get('jobId');
  const completeAll = params.get('completeAll') === '1';
  const { request } = useApi();
  const qc = useQueryClient();
  const interventions = useInterventions(projectId, 2_000);
  const siteOpenedRef = useRef(false);
  const [done, setDone] = useState(false);
  const [closeFailed, setCloseFailed] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    if (jobId) return;
    const first = interventions.data?.data.items?.[0];
    if (first) setParams({ jobId: first.jobId }, { replace: true });
  }, [jobId, interventions.data?.data.items, setParams]);

  const intervention = useQuery({
    queryKey: ['bee-intervention', projectId, jobId],
    queryFn: () =>
      request<{ data: InterventionDetail }>(
        `/v1/projects/${projectId}/browser/jobs/${jobId}/intervention`
      ),
    enabled: !!projectId && !!jobId,
    refetchInterval: done ? false : 2_000,
  });

  const d = intervention.data?.data;

  // Exact paused URL only — never fall back to bare homepage/domain
  const siteUrl =
    normalizeSiteUrl(d?.pausedUrl ?? '') ||
    normalizeSiteUrl(d?.openUrl ?? '') ||
    normalizeSiteUrl(d?.liveUrl ?? '') ||
    null;

  useEffect(() => {
    if (!jobId || !siteUrl || !d?.needsAction || siteOpenedRef.current) return;
    siteOpenedRef.current = true;
    openRealWebsiteTab(siteUrl, jobId);
  }, [jobId, siteUrl, d?.needsAction]);

  const finishSuccess = (message: string) => {
    if (done) return;
    setDone(true);
    const friendly =
      d?.gate === 'human_approval'
        ? '✓ Submission Approved — Resuming automation…'
        : message || '✓ Completed — AI resumed.';
    toast.success(friendly);
    notifyInterventionResumed({
      projectId,
      jobId: jobId!,
      website: d?.website,
      message: friendly,
    });
    qc.invalidateQueries({ queryKey: ['bee-intervention', projectId, jobId] });
    qc.invalidateQueries({ queryKey: ['bee-interventions', projectId] });
    qc.invalidateQueries({ queryKey: ['bee-jobs', projectId] });
    qc.invalidateQueries({ queryKey: ['bee-stats', projectId] });
    window.setTimeout(() => {
      try {
        window.close();
        window.setTimeout(() => {
          if (!window.closed) setCloseFailed(true);
        }, 400);
      } catch {
        setCloseFailed(true);
      }
    }, 1_600);
  };

  const checkClear = useMutation({
    mutationFn: () =>
      request<{ data: { cleared: boolean; resumed: boolean; message: string } }>(
        `/v1/projects/${projectId}/browser/jobs/${jobId}/intervention/check`,
        { method: 'POST' }
      ),
    onSuccess: (res) => {
      if (res.data.cleared) {
        finishSuccess(res.data.message || d?.successToast || 'AI resumed successfully');
      }
    },
    onError: () => {
      /* silent during auto-poll */
    },
  });

  const approve = useMutation({
    mutationFn: () =>
      request(`/v1/projects/${projectId}/browser/approve`, {
        method: 'POST',
        body: JSON.stringify({ jobId }),
      }),
    onSuccess: () => {
      checkClear.mutate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const checkMutate = checkClear.mutate;
  const checkPending = checkClear.isPending;

  useEffect(() => {
    if (!projectId || !jobId || !d?.needsAction || done) return;
    if (d.gate === 'human_approval') return;
    const t = window.setInterval(() => {
      if (!checkPending) checkMutate();
    }, 3_000);
    return () => window.clearInterval(t);
  }, [projectId, jobId, d?.needsAction, d?.gate, checkMutate, checkPending, done]);

  useEffect(() => {
    if (!jobId || !interventions.data || done) return;
    const stillWaiting = (interventions.data.data.items ?? []).some((i) => i.jobId === jobId);
    if (!stillWaiting && d && !d.needsAction) {
      finishSuccess(d.successToast || 'AI resumed successfully');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interventions.data, jobId, d?.needsAction, done]);

  if (!jobId) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <AiLoadingState message="Waiting for the next website that needs you…" />
      </div>
    );
  }

  if (intervention.isLoading || !d) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <AiLoadingState message="Opening the paused page in your browser…" />
      </div>
    );
  }

  if (done || !d.needsAction) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="max-w-sm w-full rounded-2xl border border-emerald-500/30 bg-emerald-500/5 px-5 py-6 text-center space-y-3">
          <CheckCircle2 className="h-9 w-9 text-emerald-600 mx-auto" />
          <p className="text-base font-semibold">
            {d.gate === 'human_approval' ? '✓ Submission Approved' : '✓ Completed'}
          </p>
          <p className="text-sm text-muted-foreground">
            {completeAll
              ? 'AI resumed. Opening next website…'
              : 'Resuming automation…'}
          </p>
          {closeFailed ? (
            <p className="text-sm text-muted-foreground">You may close this tab.</p>
          ) : (
            <p className="text-sm text-muted-foreground">Closing this helper…</p>
          )}
        </div>
      </div>
    );
  }

  const explanation = d.explanation || d.instruction;
  const doneList =
    d.completedByAi?.length > 0
      ? d.completedByAi
      : ['Website navigation', 'Form detection', 'Content generation', 'Image upload'];

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/40">
      <div className="w-full max-w-md rounded-2xl border border-border/60 bg-card shadow-lg px-5 py-6 space-y-4">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            SEO OS
          </p>
          <h1 className="text-lg font-semibold tracking-tight">
            {d.title?.replace(/^AI needs your help —\s*/i, '') || d.reason}
          </h1>
          <p className="text-sm text-muted-foreground">{explanation}</p>
        </div>

        <div className="space-y-2 text-sm">
          <div>
            <p className="text-muted-foreground text-xs">Website</p>
            <p className="font-medium">{d.website}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Reason</p>
            <p className="font-medium text-amber-800 dark:text-amber-200">{d.reason}</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-sm font-medium">AI has already completed</p>
          <ul className="space-y-1">
            {doneList.map((line) => (
              <li key={line} className="text-sm text-muted-foreground flex gap-2">
                <span className="text-emerald-600">✓</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
          <p className="text-sm pt-1">
            You only need to{' '}
            {d.gate === 'human_approval'
              ? 'approve this submission'
              : 'finish this step on the paused page'}
            .
          </p>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          Use the browser tab that opened on the exact paused page. AI continues automatically when
          you are done.
        </p>

        <div className="flex flex-col gap-2">
          {siteUrl ? (
            <Button variant="outline" onClick={() => openRealWebsiteTab(siteUrl, jobId)}>
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              Open paused page again
            </Button>
          ) : (
            <p className="text-xs text-amber-800 dark:text-amber-200 text-center">
              Exact paused URL is not available yet. Wait a moment…
            </p>
          )}

          {d.gate === 'human_approval' ? (
            <Button onClick={() => approve.mutate()} disabled={approve.isPending}>
              {approve.isPending ? 'Approving…' : 'Complete Now — Approve'}
            </Button>
          ) : (
            <div className="inline-flex items-center justify-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Watching for completion…
            </div>
          )}
        </div>

        <button
          type="button"
          className="text-[11px] text-muted-foreground underline"
          onClick={() => setShowAdvanced((v) => !v)}
        >
          {showAdvanced ? 'Hide technical details' : 'Advanced (support)'}
        </button>
        {showAdvanced ? (
          <div className="space-y-2 rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
            <p className="break-all">Paused URL: {d.pausedUrl || siteUrl || '—'}</p>
            <p>Step: {d.currentStepLabel || d.stepLabel}</p>
            {d.screenshot?.url ? (
              <img
                src={d.screenshot.url}
                alt="Paused page"
                className="w-full max-h-36 object-cover rounded-md border"
              />
            ) : null}
            {d.domEvidence ? (
              <pre className="max-h-24 overflow-auto rounded bg-muted/80 p-2 text-[10px]">
                {d.domEvidence}
              </pre>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

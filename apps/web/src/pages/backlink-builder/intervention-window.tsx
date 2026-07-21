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
  successToast: string;
  stepLabel: string;
  needsAction: boolean;
  completedByAi: string[];
  userOnly: string;
  liveUrl?: string | null;
  pageTitle?: string | null;
};

/**
 * Minimal OAuth-style helper — never embeds Playwright / Live Browser.
 * Opens the real website in a normal browser tab; SEO OS only shows this banner
 * and monitors completion via the existing intervention/check API.
 */
export function InterventionWindowPage() {
  const { projectId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const jobId = params.get('jobId');
  const { request } = useApi();
  const qc = useQueryClient();
  const interventions = useInterventions(projectId, 2_000);
  const siteOpenedRef = useRef(false);
  const [done, setDone] = useState(false);
  const [closeFailed, setCloseFailed] = useState(false);

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

  const siteUrl =
    normalizeSiteUrl(d?.liveUrl ?? '') ||
    normalizeSiteUrl(d?.website ?? '') ||
    null;

  // Open the real website once — user's normal browser, not an embedded view
  useEffect(() => {
    if (!jobId || !siteUrl || !d?.needsAction || siteOpenedRef.current) return;
    siteOpenedRef.current = true;
    openRealWebsiteTab(siteUrl, jobId);
  }, [jobId, siteUrl, d?.needsAction]);

  const finishSuccess = (message: string) => {
    if (done) return;
    setDone(true);
    toast.success(message);
    notifyInterventionResumed({
      projectId,
      jobId: jobId!,
      website: d?.website,
      message,
    });
    qc.invalidateQueries({ queryKey: ['bee-intervention', projectId, jobId] });
    qc.invalidateQueries({ queryKey: ['bee-interventions', projectId] });
    qc.invalidateQueries({ queryKey: ['bee-jobs', projectId] });
    qc.invalidateQueries({ queryKey: ['bee-stats', projectId] });
    window.setTimeout(() => {
      try {
        window.close();
        // If still open after close attempt
        window.setTimeout(() => {
          if (!window.closed) setCloseFailed(true);
        }, 400);
      } catch {
        setCloseFailed(true);
      }
    }, 1_400);
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

  // Monitor session continuously (auth / navigation / approval via existing check API)
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
        <AiLoadingState message="Opening the website in your browser…" />
      </div>
    );
  }

  if (done || !d.needsAction) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="max-w-sm w-full rounded-2xl border border-emerald-500/30 bg-emerald-500/5 px-5 py-6 text-center space-y-3">
          <CheckCircle2 className="h-9 w-9 text-emerald-600 mx-auto" />
          <p className="text-base font-semibold">
            {d.successToast || 'AI resumed successfully'}
          </p>
          {closeFailed ? (
            <p className="text-sm text-muted-foreground">
              AI resumed successfully. You may close this tab.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Closing this helper…</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/40">
      <div className="w-full max-w-sm rounded-2xl border border-border/60 bg-card shadow-lg px-5 py-6 space-y-4">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            SEO OS
          </p>
          <h1 className="text-lg font-semibold tracking-tight">AI paused this website.</h1>
          <p className="text-sm text-muted-foreground">
            Complete the login or approval. We&apos;ll continue automatically.
          </p>
        </div>

        <div className="rounded-xl bg-muted/50 px-3 py-2.5 text-sm space-y-1">
          <p>
            <span className="text-muted-foreground">Website · </span>
            <span className="font-medium">{d.website}</span>
          </p>
          <p>
            <span className="text-muted-foreground">Reason · </span>
            <span className="font-medium text-amber-800 dark:text-amber-200">{d.reason}</span>
          </p>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          Use the real browser tab that just opened — interact normally. SEO OS does not embed
          Playwright or capture your mouse and keyboard here.
        </p>

        <div className="flex flex-col gap-2">
          {siteUrl ? (
            <Button
              variant="outline"
              onClick={() => openRealWebsiteTab(siteUrl, jobId)}
            >
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              Open website again
            </Button>
          ) : null}

          {d.gate === 'human_approval' ? (
            <Button onClick={() => approve.mutate()} disabled={approve.isPending}>
              {approve.isPending ? 'Approving…' : 'I approved — continue AI'}
            </Button>
          ) : (
            <div className="inline-flex items-center justify-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Watching for completion…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

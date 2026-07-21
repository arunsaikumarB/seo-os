import { useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useApi } from '@/hooks/use-api';
import { LiveBrowserView } from '@/components/browser/live-browser-view';
import { useInterventions } from '@/components/browser/needs-your-action-queue';
import { AiLoadingState } from '@/components/workflow/ai-activity-card';

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
};

/**
 * Lightweight intervention window — no sidebar, nav, or workflow chrome.
 * Opens automatically when AI needs login / CAPTCHA / OTP / approval.
 */
export function InterventionWindowPage() {
  const { projectId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const jobId = params.get('jobId');
  const { request } = useApi();
  const qc = useQueryClient();
  const interventions = useInterventions(projectId, 2_000);

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
    refetchInterval: 2_000,
  });

  const checkClear = useMutation({
    mutationFn: () =>
      request<{ data: { cleared: boolean; resumed: boolean; message: string } }>(
        `/v1/projects/${projectId}/browser/jobs/${jobId}/intervention/check`,
        { method: 'POST' }
      ),
    onSuccess: (res) => {
      if (res.data.cleared) {
        toast.success(res.data.message || '✓ Step complete — AI is continuing');
        qc.invalidateQueries({ queryKey: ['bee-intervention', projectId, jobId] });
        qc.invalidateQueries({ queryKey: ['bee-interventions', projectId] });
        qc.invalidateQueries({ queryKey: ['bee-jobs', projectId] });
        qc.invalidateQueries({ queryKey: ['bee-stats', projectId] });
        window.setTimeout(() => {
          try {
            window.close();
          } catch {
            /* ignore */
          }
        }, 1_200);
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
      toast.success('Approved — AI is continuing');
      checkClear.mutate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const checkMutate = checkClear.mutate;
  const checkPending = checkClear.isPending;
  const d = intervention.data?.data;

  useEffect(() => {
    if (!projectId || !jobId || !d?.needsAction) return;
    if (d.gate === 'human_approval') return;
    const t = window.setInterval(() => {
      if (!checkPending) checkMutate();
    }, 3_500);
    return () => window.clearInterval(t);
  }, [projectId, jobId, d?.needsAction, d?.gate, checkMutate, checkPending]);

  // Auto-close when intervention list no longer includes this job
  useEffect(() => {
    if (!jobId || !interventions.data) return;
    const stillWaiting = (interventions.data.data.items ?? []).some((i) => i.jobId === jobId);
    if (!stillWaiting && d && !d.needsAction) {
      toast.success(d.successToast || 'AI is continuing');
      window.setTimeout(() => {
        try {
          window.close();
        } catch {
          /* ignore */
        }
      }, 900);
    }
  }, [interventions.data, jobId, d]);

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
        <AiLoadingState message="AI is preparing the live browser session…" />
      </div>
    );
  }

  if (!d.needsAction) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="max-w-md text-center space-y-3">
          <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto" />
          <p className="text-lg font-semibold">{d.successToast || 'AI is continuing'}</p>
          <p className="text-sm text-muted-foreground">This window will close automatically.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border/60 px-4 py-3 sm:px-6">
        <div className="mx-auto max-w-5xl space-y-1">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Secure step · AI paused only this website
          </p>
          <h1 className="text-lg font-semibold tracking-tight truncate">{d.website}</h1>
          <p className="text-sm text-amber-800 dark:text-amber-200 font-medium">{d.reason}</p>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        <div className="mx-auto max-w-5xl space-y-4">
          <div className="rounded-xl border border-border/50 bg-muted/30 px-4 py-3 text-sm">
            <p className="font-medium mb-1">Instructions</p>
            <p className="text-muted-foreground">{d.instruction}</p>
            <p className="text-xs text-muted-foreground mt-2">
              You only finish: <span className="text-foreground font-medium">{d.userOnly}</span>
              {d.completedByAi?.length ? (
                <> · AI already finished navigation, forms, and uploads.</>
              ) : null}
            </p>
          </div>

          <LiveBrowserView projectId={projectId} jobId={jobId} website={d.website} />

          <div className="flex flex-wrap items-center gap-2 pb-8">
            {d.gate === 'human_approval' ? (
              <Button onClick={() => approve.mutate()} disabled={approve.isPending}>
                {approve.isPending ? 'Approving…' : 'Approve & continue'}
              </Button>
            ) : (
              <Button variant="secondary" disabled>
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                Watching for completion…
              </Button>
            )}
            <p className="text-xs text-muted-foreground">
              When done, AI resumes and this window closes.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

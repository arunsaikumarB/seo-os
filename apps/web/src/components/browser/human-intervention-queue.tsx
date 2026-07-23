import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Download, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useApi } from '@/hooks/use-api';
import { useAuth } from '@/providers/auth-provider';
import { getApiUrl } from '@/lib/api';
import { useAppStore } from '@/stores/app-store';
import { useInterventions } from '@/components/browser/needs-your-action-queue';
import { useBeeExecutionProgress } from '@/hooks/use-bee-execution-progress';
import { useExecutionSummary } from '@/hooks/use-execution-summary';
import { cn } from '@/lib/utils';

type Props = {
  projectId: string;
  campaignActive?: boolean;
};

/**
 * Phase 6.3 — Quiet auto progress + Manual list (no Complete Now / Complete All nagging).
 * Manual links are offline Excel; auto lane never prompts.
 */
export function HumanInterventionQueue({ projectId, campaignActive }: Props) {
  const { request } = useApi();
  const { getAccessToken } = useAuth();
  const orgId = useAppStore((s) => s.currentOrgId);
  const qc = useQueryClient();
  const progress = useBeeExecutionProgress(projectId, 2_000);
  const summary = useExecutionSummary(projectId, 1_500);
  const interventions = useInterventions(projectId, 3_000);
  const [showManual, setShowManual] = useState(false);

  const payload = interventions.data?.data;
  // After Phase 6.3 divert, Lane B should stay empty; Manual list comes from campaign items API
  const manualFromInterventions = payload?.laneB?.items ?? [];

  const manualBoard = useQuery({
    queryKey: ['manual-submissions', projectId],
    queryFn: () =>
      request<{
        data: {
          counts: {
            automatable: number;
            manual: number;
            active?: number;
            confidence?: string;
          };
          items: Array<{
            id: string;
            website: string;
            reason: string;
            url: string | null;
          }>;
        };
      }>(`/v1/projects/${projectId}/backlink-builder/manual-submissions`),
    enabled: !!projectId,
    refetchInterval: 5_000,
  });

  const manualItems = manualBoard.data?.data.items ?? [];
  const manualCount =
    manualBoard.data?.data.counts.manual ??
    manualItems.length ??
    manualFromInterventions.length;
  const autoCount = manualBoard.data?.data.counts.automatable;

  const p = progress.data;
  const sum = summary.data;
  const submitted = sum?.completed ?? p?.submitted ?? p?.completedJobs ?? 0;
  const running = sum?.running ?? p?.running ?? 0;
  const remaining = sum?.remaining ?? p?.remainingJobs ?? 0;

  const policyQ = useQuery({
    queryKey: ['bee-policy', projectId],
    queryFn: () =>
      request<{ data: { auto_publish_automatable?: boolean } }>(
        `/v1/projects/${projectId}/browser/policies`
      ),
    enabled: !!projectId,
  });
  const autoPublish = Boolean(policyQ.data?.data?.auto_publish_automatable);

  const setAutoPublish = useMutation({
    mutationFn: (on: boolean) =>
      request(`/v1/projects/${projectId}/browser/policies`, {
        method: 'PUT',
        body: JSON.stringify({ auto_publish_automatable: on }),
      }),
    onSuccess: (_data, on) => {
      qc.invalidateQueries({ queryKey: ['bee-policy', projectId] });
      qc.invalidateQueries({ queryKey: ['execution-summary', projectId] });
      qc.invalidateQueries({ queryKey: ['bee-statistics', projectId] });
      qc.invalidateQueries({ queryKey: ['bee-progress', projectId] });
      toast.success(
        on
          ? 'Auto-publish on — draining automatable queue'
          : 'Auto-publish off — ready items wait for batch confirm'
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const downloadManual = async (format: 'xlsx' | 'csv' | 'pdf') => {
    const token = await getAccessToken();
    const base = getApiUrl();
    const res = await fetch(
      `${base}/v1/projects/${projectId}/reports/manual-links.xlsx?format=${format}`,
      {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(orgId ? { 'X-Org-Id': orgId } : {}),
        },
      }
    );
    if (!res.ok) {
      toast.error('Download failed');
      return;
    }
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `manual-submissions.${format === 'xlsx' ? 'xlsx' : format}`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const showStrip =
    Boolean(campaignActive) ||
    submitted > 0 ||
    running > 0 ||
    remaining > 0 ||
    manualCount > 0;

  const laneAReady = useMemo(
    () => payload?.laneA?.items ?? [],
    [payload?.laneA?.items]
  );

  const submitReady = useMutation({
    mutationFn: () =>
      request<{ data: { ok: number } }>(
        `/v1/projects/${projectId}/browser/interventions/approve-lane-a`,
        { method: 'POST', body: JSON.stringify({}) }
      ),
    onSuccess: (res) => {
      toast.success(`Published ${res.data.ok} automatable site(s)`);
      qc.invalidateQueries({ queryKey: ['bee-interventions', projectId] });
      qc.invalidateQueries({ queryKey: ['execution-summary', projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!showStrip && !autoPublish && laneAReady.length === 0) return null;

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl border-border/40">
        <CardContent className="pt-5 pb-4 space-y-3">
          <p className="text-sm font-medium">Automatable progress</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(
              [
                ['Completed', submitted],
                ['Running', running],
                ['Remaining', remaining],
                ['Manual (offline)', manualCount],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p
                  className={cn(
                    'text-xl font-semibold tabular-nums mt-0.5',
                    label.startsWith('Manual') && value > 0 && 'text-muted-foreground'
                  )}
                >
                  {value}
                </p>
              </div>
            ))}
          </div>
          {autoCount != null ? (
            <p className="text-xs text-muted-foreground">
              Automatable {autoCount} · Manual {manualCount}
              {manualBoard.data?.data.counts.active != null
                ? ` · Active ${manualBoard.data.data.counts.active}`
                : ''}
              {autoPublish
                ? ' · Auto-publish ON (zero clicks)'
                : ' · Auto-publish OFF'}
            </p>
          ) : null}
          {sum && sum.total > 0 ? (
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, sum.progressPercent))}%` }}
              />
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2 items-center pt-1">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                className="rounded border"
                checked={autoPublish}
                disabled={setAutoPublish.isPending}
                onChange={(e) => {
                  if (e.target.checked) {
                    if (
                      !window.confirm(
                        'Auto-publish automatable links? The app will submit to live third-party sites with no per-site confirmation. Gated sites (CAPTCHA/login) still go to your Manual Excel.'
                      )
                    ) {
                      return;
                    }
                  }
                  setAutoPublish.mutate(e.target.checked);
                }}
              />
              Auto-publish automatable links (no per-site confirmation)
            </label>
          </div>

          {!autoPublish && laneAReady.length > 0 ? (
            <Button
              size="sm"
              onClick={() => submitReady.mutate()}
              disabled={submitReady.isPending}
            >
              {submitReady.isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                  Publishing…
                </>
              ) : (
                `Submit all ready (${laneAReady.length})`
              )}
            </Button>
          ) : null}
        </CardContent>
      </Card>

      {manualCount > 0 ? (
        <Card className="rounded-2xl border-border/40 border-dashed">
          <CardContent className="pt-5 pb-5 space-y-3">
            <div className="flex flex-wrap items-center gap-2 justify-between">
              <div>
                <p className="text-sm font-medium">
                  {manualCount} manual link{manualCount === 1 ? '' : 's'} — handle offline
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  CAPTCHA / Login / Cloudflare / Unsupported. Not in the auto queue.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => void downloadManual('xlsx')}>
                  <Download className="h-3.5 w-3.5 mr-1" />
                  Excel
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void downloadManual('csv')}>
                  CSV
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowManual((v) => !v)}>
                  {showManual ? 'Hide list' : 'View list'}
                </Button>
              </div>
            </div>
            {showManual ? (
              <ul className="text-sm space-y-1 max-h-48 overflow-y-auto">
                {manualItems.slice(0, 40).map((i) => (
                  <li key={i.id} className="flex justify-between gap-2">
                    <span className="truncate">{i.website}</span>
                    <span className="text-muted-foreground shrink-0">{i.reason}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

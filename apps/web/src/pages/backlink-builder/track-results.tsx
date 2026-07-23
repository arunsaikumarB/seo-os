import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Download, FileBarChart, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageTransition } from '@/components/demo/page-transition';
import { AiLoadingState } from '@/components/workflow/ai-activity-card';
import { useExecutionSummary } from '@/hooks/use-execution-summary';
import { useApi } from '@/hooks/use-api';

/**
 * Step 7 — Track Results.
 * Phase 6.1 — tiles from shared Execution Summary (CSM Campaign Items via /browser/statistics).
 * Phase 7 — Assisted Manual bucket counts share the same lane selectors as Import / Submit.
 */
export function TrackResultsPage() {
  const { projectId = '' } = useParams();
  const { request } = useApi();
  const state = useExecutionSummary(projectId, 2_000);
  const s = state.data;
  const showTiles = Boolean(s) && !state.isLoading && !state.isPlaceholderData;

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
  const ac = assisted.data?.data.counts;

  const metrics = [
    { label: 'Completed', value: s?.completed ?? 0 },
    { label: 'Running', value: s?.running ?? 0 },
    { label: 'Waiting Human', value: s?.waitingHuman ?? 0 },
    { label: 'Remaining', value: s?.remaining ?? 0 },
    { label: 'Failed', value: s?.failed ?? 0 },
    { label: 'Skipped', value: s?.skipped ?? 0 },
    { label: 'Deleted', value: s?.deleted ?? 0 },
    { label: 'Queued', value: s?.queued ?? 0 },
  ] as const;

  return (
    <PageTransition className="mx-auto max-w-5xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <CheckCircle2 className="h-6 w-6" /> Track Results
        </h1>
        <p className="text-muted-foreground text-sm max-w-2xl">
          Live campaign status from the Campaign State Manager — same Execution Summary as Campaign
          Health, Reports, and Submit Backlinks.
        </p>
      </div>

      {ac ? (
        <Card className="border-border/40 shadow-sm rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Lane mix (Import · Submit · Assisted)</CardTitle>
            <CardDescription>
              Automatable {ac.automatable} · Assisted {ac.assisted} (Ready {ac.ready} · Check{' '}
              {ac.checkFields} · Needs person {ac.needsPerson}) · Manual offline {ac.manual}
              {ac.conservationOk ? ' · conservation OK' : ' · conservation check'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button size="sm" variant="outline" asChild>
              <Link to={`/projects/${projectId}/backlink-builder/assisted-manual`}>
                Open Assisted Manual
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {showTiles ? (
        <p className="text-sm text-muted-foreground">
          Campaign total{' '}
          <span className="font-semibold tabular-nums text-foreground">{s!.total}</span>
          {' · '}
          Progress{' '}
          <span className="font-semibold tabular-nums text-foreground">{s!.progressPercent}%</span>
          {s!.executionComplete ? ' · Complete' : ''}
        </p>
      ) : null}

      {state.isError ? (
        <p className="text-sm text-destructive">
          Could not load execution summary. Open Campaign Health to verify Campaign Items.
        </p>
      ) : state.isLoading || !showTiles ? (
        <AiLoadingState message="AI is checking execution status…" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {metrics.map((m) => (
            <Card key={m.label} className="border-border/40 shadow-sm rounded-2xl">
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">{m.label}</p>
                <p className="text-2xl font-semibold tabular-nums mt-1">{m.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="h-2 rounded-full bg-muted overflow-hidden max-w-xl">
        <div
          className="h-full bg-primary transition-all duration-500"
          style={{ width: `${Math.min(100, Math.max(0, showTiles ? s!.progressPercent : 0))}%` }}
        />
      </div>

      <Card className="border-border/40 shadow-sm rounded-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Download className="h-4 w-4" /> Download
          </CardTitle>
          <CardDescription>Export results for stakeholders</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild>
            <Link to={`/projects/${projectId}/reports/library`}>
              <FileBarChart className="h-4 w-4 mr-2" />
              Excel · CSV · PDF
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to={`/projects/${projectId}/backlink-builder/pending`}>
              Open verification (Submitted only)
            </Link>
          </Button>
        </CardContent>
      </Card>
    </PageTransition>
  );
}

import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Download, FileBarChart, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageTransition } from '@/components/demo/page-transition';
import { useApi } from '@/hooks/use-api';
import { AiLoadingState } from '@/components/workflow/ai-activity-card';

type TrackResults = {
  Submitted: number;
  Running: number;
  'Waiting Human': number;
  Failed: number;
  Skipped: number;
  Deleted: number;
  Verified: number;
  Approved: number;
  Rejected: number;
};

type ExecutionState = {
  trackResults: TrackResults;
  counts: {
    campaignTotal: number;
    campaignResolved: number;
    progressPercent: number;
    executionComplete: boolean;
  };
};

/**
 * Step 7 — Track Results.
 * Reads exclusively from the Execution State Manager.
 */
export function TrackResultsPage() {
  const { projectId = '' } = useParams();
  const { request } = useApi();

  const state = useQuery({
    queryKey: ['execution-state', projectId],
    queryFn: () =>
      request<{ data: ExecutionState }>(
        `/v1/projects/${projectId}/browser/execution-state`
      ),
    enabled: !!projectId,
    refetchInterval: 3_000,
    retry: false,
  });

  const tr = state.data?.data.trackResults;
  const counts = state.data?.data.counts;

  const metrics = [
    { label: 'Submitted', value: tr?.Submitted ?? 0 },
    { label: 'Running', value: tr?.Running ?? 0 },
    { label: 'Waiting Human', value: tr?.['Waiting Human'] ?? 0 },
    { label: 'Failed', value: tr?.Failed ?? 0 },
    { label: 'Skipped', value: tr?.Skipped ?? 0 },
    { label: 'Deleted', value: tr?.Deleted ?? 0 },
    { label: 'Verified', value: tr?.Verified ?? 0 },
    { label: 'Approved', value: tr?.Approved ?? 0 },
    { label: 'Rejected', value: tr?.Rejected ?? 0 },
  ] as const;

  return (
    <PageTransition className="mx-auto max-w-5xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <CheckCircle2 className="h-6 w-6" /> Track Results
        </h1>
        <p className="text-muted-foreground text-sm max-w-2xl">
          Live campaign status from the Execution State Manager — not verification alone.
        </p>
      </div>

      {counts ? (
        <p className="text-sm text-muted-foreground">
          Campaign total{' '}
          <span className="font-semibold tabular-nums text-foreground">
            {counts.campaignTotal}
          </span>
          {' · '}
          {counts.campaignResolved} resolved · {counts.progressPercent}% complete
        </p>
      ) : null}

      {state.isLoading ? (
        <AiLoadingState message="AI is checking execution status…" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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

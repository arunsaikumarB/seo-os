import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Download, FileBarChart, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PageTransition } from '@/components/demo/page-transition';
import { useApi } from '@/hooks/use-api';
import { NextActionPanel } from '@/components/workflow/next-action-panel';

/**
 * Step 7 — Track Results.
 * UX-only composition over existing summary / pending / reports APIs.
 */
export function TrackResultsPage() {
  const { projectId = '' } = useParams();
  const { request } = useApi();

  const summary = useQuery({
    queryKey: ['track-results-summary', projectId],
    queryFn: () =>
      request<{ data: Record<string, unknown> }>(
        `/v1/projects/${projectId}/backlink-builder/summary`
      ).catch(() => ({ data: {} })),
    enabled: !!projectId,
    retry: false,
  });

  const pending = useQuery({
    queryKey: ['track-results-pending', projectId],
    queryFn: () =>
      request<{ data: unknown[] }>(`/v1/projects/${projectId}/backlink-builder/pending`).catch(
        () => ({ data: [] })
      ),
    enabled: !!projectId,
    retry: false,
  });

  const s = (summary.data?.data ?? {}) as Record<string, unknown>;
  const num = (key: string, fallback = 0) => {
    const v = s[key];
    return typeof v === 'number' ? v : fallback;
  };

  const metrics = [
    { label: 'Submitted', value: num('submitted') },
    { label: 'Pending', value: pending.data?.data?.length ?? num('pending') },
    { label: 'Approved', value: num('approved') },
    { label: 'Rejected', value: num('lost', num('failed')) },
    { label: 'Verified', value: num('verified', num('won')) },
    {
      label: 'Traffic',
      value: (s.estimatedTraffic as string | number | undefined) ?? '—',
    },
    {
      label: 'Estimated DA gain',
      value: (s.estimatedDaGain as string | number | undefined) ?? '—',
    },
  ] as const;

  return (
    <PageTransition className="mx-auto max-w-5xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <CheckCircle2 className="h-6 w-6" /> Track Results
        </h1>
        <p className="text-muted-foreground text-sm max-w-2xl">
          Everything that was submitted, what is waiting, and what landed — plus downloads for your
          team.
        </p>
      </div>

      <NextActionPanel projectId={projectId} />

      {summary.isLoading ? (
        <Skeleton className="h-40 w-full" />
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
            <Link to={`/projects/${projectId}/backlink-builder/pending`}>Open verification list</Link>
          </Button>
        </CardContent>
      </Card>
    </PageTransition>
  );
}

import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useApi } from '@/hooks/use-api';
import { BacklinkBuilderNav } from '@/components/backlink-builder/backlink-builder-widget';
import { PageTransition } from '@/components/demo/page-transition';
import { ProgressBarLabel } from '@/components/demo/animated-progress';
import type { AutomationSummary } from '@/components/backlink-builder/types';
import { Zap, Upload, CheckCircle, ArrowRight, AlertTriangle } from 'lucide-react';

const PIPELINE_STEPS = [
  'import',
  'validate',
  'analyze',
  'classify',
  'score',
  'generate',
  'queue',
  'assist',
  'track',
  'verify',
  'store',
];

type RunLog = {
  id: string;
  level: string;
  stage: string;
  message: string;
  detail?: Record<string, unknown>;
  created_at: string;
};

type QualifyRow = {
  websiteName?: string;
  domain: string;
  classificationLabel: string;
  score: number;
  qualified: boolean;
  reason: string;
};

function qualificationRows(run: Record<string, unknown> | undefined): QualifyRow[] {
  const stats = run?.stats as { qualificationReport?: QualifyRow[] } | undefined;
  return Array.isArray(stats?.qualificationReport) ? stats.qualificationReport : [];
}

export function BacklinkAutomationPage() {
  const { projectId = '' } = useParams();
  const { request } = useApi();

  const summary = useQuery({
    queryKey: ['automation-summary', projectId],
    queryFn: () =>
      request<{ data: AutomationSummary }>(
        `/v1/projects/${projectId}/backlink-builder/automation/summary`
      ),
    enabled: !!projectId,
    refetchInterval: (q) => {
      const run = q.state.data?.data?.recentRuns?.[0];
      return run && ['running', 'queued', 'retrying'].includes(String(run.status)) ? 2500 : 8000;
    },
  });

  const data = summary.data?.data;
  const activeRun = data?.recentRuns?.[0] as Record<string, unknown> | undefined;
  const completedSteps: string[] = Array.isArray(activeRun?.steps_completed)
    ? (activeRun?.steps_completed as string[])
    : [];
  const progress = Number(activeRun?.progress ?? 0);
  const runActive = ['running', 'queued', 'retrying', 'waiting'].includes(
    String(activeRun?.status ?? '')
  );
  const qualifyRows = qualificationRows(activeRun);

  const logs = useQuery({
    queryKey: ['automation-run-logs', projectId, activeRun?.id],
    queryFn: () =>
      request<{ data: RunLog[] }>(
        `/v1/projects/${projectId}/backlink-builder/automation/runs/${activeRun!.id}/logs`
      ),
    enabled: !!projectId && !!activeRun?.id,
    refetchInterval: runActive ? 2000 : false,
  });

  const logLines = logs.data?.data ?? [];
  const latestError = [...logLines].reverse().find((l) => l.level === 'error');

  return (
    <PageTransition className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <BacklinkBuilderNav />
        <Button size="sm" asChild>
          <Link to={`/projects/${projectId}/backlink-builder/import`}>
            <Upload className="h-3.5 w-3.5 mr-1" /> New Import
          </Link>
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Zap className="h-6 w-6 text-violet-500" /> Automation Pipeline
        </h1>
        <p className="text-muted-foreground mt-1">
          Live worker execution — progress and logs reflect persisted database writes only
        </p>
      </div>

      {summary.isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <>
          <Card>
            <CardHeader className="pb-2">
              <div className="flex justify-between items-center">
                <CardTitle className="text-base">Pipeline Progress</CardTitle>
                <Badge className={runActive ? 'animate-pulse' : ''}>
                  {String(activeRun?.status ?? 'idle').replace(/_/g, ' ')}
                </Badge>
              </div>
              <CardDescription>
                {activeRun?.current_step
                  ? `Current step: ${String(activeRun.current_step).replace(/_/g, ' ')}`
                  : 'Import websites to start the automation pipeline'}
                {activeRun?.error_message ? ` · ${String(activeRun.error_message)}` : ''}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ProgressBarLabel label="Overall progress" value={progress} />
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                {PIPELINE_STEPS.map((step, i) => {
                  const done = completedSteps.includes(step);
                  const current = activeRun?.current_step === step;
                  return (
                    <div
                      key={step}
                      className={`rounded border p-2 text-center text-xs ${
                        done
                          ? 'border-emerald-500/40 bg-emerald-500/5'
                          : current
                            ? 'border-violet-500/50 bg-violet-500/5'
                            : ''
                      }`}
                    >
                      <span className="text-[10px] text-muted-foreground">{i + 1}</span>
                      <p className="font-medium capitalize mt-0.5">{step.replace(/_/g, ' ')}</p>
                      {done && <CheckCircle className="h-3 w-3 mx-auto mt-1 text-emerald-500" />}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Live execution log</CardTitle>
                <CardDescription>
                  Streamed from the worker — Classify → Qualify → Opportunity
                </CardDescription>
              </CardHeader>
              <CardContent>
                {latestError && (
                  <div className="mb-3 flex gap-2 rounded-md border border-red-500/30 bg-red-500/5 p-2 text-xs">
                    <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                    <div>
                      <p className="font-medium">Stage: {latestError.stage}</p>
                      <p className="text-muted-foreground">{latestError.message}</p>
                    </div>
                  </div>
                )}
                {qualifyRows.length > 0 && (
                  <div className="mb-3 max-h-48 overflow-y-auto rounded border bg-muted/30 p-2 text-xs whitespace-pre-wrap font-mono">
                    {qualifyRows
                      .slice(0, 20)
                      .map((r) =>
                        [
                          r.websiteName || r.domain,
                          'Classification:',
                          r.classificationLabel,
                          `Score: ${r.score}`,
                          `Qualified: ${r.qualified ? 'YES' : 'NO'}`,
                          ...(r.qualified ? [] : ['Reason:', r.reason]),
                        ].join('\n')
                      )
                      .join('\n\n')}
                  </div>
                )}
                <div className="max-h-72 overflow-y-auto space-y-1 font-mono text-xs">
                  {logLines.length === 0 && (
                    <p className="text-muted-foreground">
                      {!activeRun?.id
                        ? 'No active or recent run. Start an import to see live logs.'
                        : runActive
                          ? 'Waiting for worker logs…'
                          : 'No persisted worker logs for this run. Re-import after v1.2.6 to stream Qualify lines.'}
                    </p>
                  )}
                  {logLines.map((line) => (
                    <div
                      key={line.id}
                      className={
                        line.level === 'error'
                          ? 'text-red-600 dark:text-red-400'
                          : line.level === 'warn'
                            ? 'text-amber-700 dark:text-amber-300'
                            : 'text-muted-foreground'
                      }
                    >
                      <span className="opacity-60">
                        {new Date(line.created_at).toLocaleTimeString()}
                      </span>{' '}
                      <span className="uppercase tracking-wide">[{line.stage}]</span> {line.message}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Automation Metrics</CardTitle>
                <CardDescription>Live database counts</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 text-sm">
                {(
                  [
                    ['Imported', data?.importedWebsites],
                    ['Analyzed', data?.analyzedWebsites],
                    ['Qualified', data?.qualifiedOpportunities],
                    ['Drafts', data?.contentGenerated],
                    ['Pending Approval', data?.pendingApproval],
                    ['Submissions', data?.submissions],
                    ['Relationships', data?.relationships],
                    ['Campaigns', data?.campaigns],
                    ['Submitted', data?.submitted],
                    ['Verified', data?.verified],
                  ] as const
                ).map(([label, val]) => (
                  <div key={String(label)} className="flex justify-between rounded border p-2">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-semibold tabular-nums">{val ?? 0}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link to={`/projects/${projectId}/backlink-builder/explorer`}>Open Explorer</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to={`/projects/${projectId}/campaigns/queue`}>
                Opportunity Queue <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to={`/projects/${projectId}/backlink-builder/queue`}>Submission Queue</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to={`/projects/${projectId}/mission-control`}>Mission Control</Link>
            </Button>
          </div>
        </>
      )}
    </PageTransition>
  );
}

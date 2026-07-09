import { useParams, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useApi } from '@/hooks/use-api';
import { BacklinkBuilderNav } from '@/components/backlink-builder/backlink-builder-widget';
import { PageTransition } from '@/components/demo/page-transition';
import { ProgressBarLabel } from '@/components/demo/animated-progress';
import { AIThinkingPanel } from '@/components/demo/ai-thinking-panel';
import type { AutomationSummary } from '@/components/backlink-builder/types';
import { Zap, Upload, CheckCircle, ArrowRight } from 'lucide-react';

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

export function BacklinkAutomationPage() {
  const { projectId = '' } = useParams();
  const { request } = useApi();
  const [thinkStep, setThinkStep] = useState(0);
  const thinkingSteps = [
    'Validating imported URLs...',
    'Analyzing domain authority & niche...',
    'Classifying backlink opportunities...',
    'Generating outreach content...',
    'Queuing for approval...',
    'Completed.',
  ];

  useEffect(() => {
    const timer = setInterval(
      () => setThinkStep((s) => (s >= thinkingSteps.length - 1 ? 0 : s + 1)),
      2200
    );
    return () => clearInterval(timer);
  }, [thinkingSteps.length]);

  const summary = useQuery({
    queryKey: ['automation-summary', projectId],
    queryFn: () =>
      request<{ data: AutomationSummary }>(
        `/v1/projects/${projectId}/backlink-builder/automation/summary`
      ),
    enabled: !!projectId,
    refetchInterval: 10_000,
  });

  const data = summary.data?.data;
  const activeRun = data?.recentRuns?.[0];
  const completedSteps = data?.recentRuns?.[0]?.steps_completed ?? [];
  const progress = activeRun?.progress ?? (data?.analyzedWebsites ? 85 : 0);

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
          End-to-end workflow from import through verification
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
                <Badge className={activeRun?.status === 'running' ? 'animate-pulse' : ''}>
                  {activeRun?.status ?? 'idle'}
                </Badge>
              </div>
              <CardDescription>
                {activeRun?.current_step
                  ? `Current step: ${String(activeRun.current_step).replace(/_/g, ' ')}`
                  : 'Import websites to start the automation pipeline'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ProgressBarLabel label="Overall progress" value={progress} />
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                {PIPELINE_STEPS.map((step, i) => {
                  const done =
                    completedSteps.includes(step) || (!activeRun && data?.analyzedWebsites);
                  const active = activeRun?.current_step === step;
                  return (
                    <div
                      key={step}
                      className={`rounded-md border p-2 text-center text-xs ${
                        done
                          ? 'border-emerald-500/30 bg-emerald-500/5'
                          : active
                            ? 'border-violet-500/30 bg-violet-500/5 ring-1 ring-violet-500/20'
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
            <AIThinkingPanel
              steps={thinkingSteps}
              currentStep={thinkStep}
              active={thinkStep < thinkingSteps.length - 1}
            />

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Automation Metrics</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 text-sm">
                {[
                  ['Imported', data?.importedWebsites],
                  ['Analyzed', data?.analyzedWebsites],
                  ['Content Generated', data?.contentGenerated],
                  ['Pending Approval', data?.pendingApproval],
                  ['Submitted', data?.submitted],
                  ['Published', data?.published],
                  ['Verified', data?.verified],
                  ['Rejected', data?.rejected],
                ].map(([label, val]) => (
                  <div key={String(label)} className="flex justify-between rounded border p-2">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-semibold tabular-nums">{val ?? 0}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="flex gap-2">
            <Button asChild>
              <Link to={`/projects/${projectId}/backlink-builder/tracking`}>
                View Tracking <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to={`/projects/${projectId}/backlink-builder/explorer`}>Open Explorer</Link>
            </Button>
          </div>
        </>
      )}
    </PageTransition>
  );
}

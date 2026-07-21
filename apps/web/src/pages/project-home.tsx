import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { useApi } from '@/hooks/use-api';
import { useAppStore } from '@/stores/app-store';
import { useAuth } from '@/providers/auth-provider';
import { useWorkflow } from '@/hooks/use-workflow';
import { useBeeExecutionProgress } from '@/hooks/use-bee-execution-progress';
import { useInterventions } from '@/components/browser/needs-your-action-queue';
import { WorkflowRoadmap } from '@/components/workflow/workflow-roadmap';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatEta } from '@/lib/bee-execution-ui';

export function ProjectHomePage() {
  const { projectId = '' } = useParams();
  const { currentOrgId } = useAppStore();
  const { user } = useAuth();
  const { fetchProjects, request } = useApi();
  const { currentStep, nextStep, getStepHref, allComplete } = useWorkflow(projectId);
  const beeProgress = useBeeExecutionProgress(projectId);
  const interventions = useInterventions(projectId, 3_000);
  const actionItems = interventions.data?.data.items ?? [];
  const jobsOpen =
    (beeProgress.data?.totalJobs ?? 0) > 0 && !beeProgress.data?.executionComplete;
  const showComplete = allComplete && !jobsOpen;

  const firstName =
    (user?.user_metadata as { full_name?: string } | undefined)?.full_name?.split(' ')[0] ||
    user?.email?.split('@')[0] ||
    'there';

  const { data } = useQuery({
    queryKey: ['projects', currentOrgId],
    queryFn: () => fetchProjects(currentOrgId!),
    enabled: !!currentOrgId,
  });

  const summary = useQuery({
    queryKey: ['backlink-summary-dashboard', projectId],
    queryFn: () =>
      request<{
        data: Record<string, unknown>;
      }>(`/v1/projects/${projectId}/backlink-builder/summary`).catch(() => ({ data: {} })),
    enabled: !!projectId,
    retry: false,
  });

  const classification = useQuery({
    queryKey: ['classification-analytics-home', projectId],
    queryFn: () =>
      request<{
        data: {
          classified?: number;
          snapshot?: {
            directories?: number;
            guestPosts?: number;
            images?: number;
            videos?: number;
            forums?: number;
            articles?: number;
            qa?: number;
            unknown?: number;
          };
        };
      }>(`/v1/projects/${projectId}/backlink-builder/automation/classification/analytics`).catch(() => ({
        data: {},
      })),
    enabled: !!projectId,
    retry: false,
  });

  const classificationData = (classification.data?.data ?? {}) as {
    classified?: number;
    snapshot?: {
      directories?: number;
      guestPosts?: number;
      images?: number;
      videos?: number;
      forums?: number;
      articles?: number;
      qa?: number;
      unknown?: number;
    };
  };
  const project = data?.data.find((p) => p.id === projectId);
  const s = (summary.data?.data ?? {}) as Record<string, unknown>;
  const snap = classificationData.snapshot;
  const classified = classificationData.classified ?? 0;

  const num = (...vals: unknown[]) => {
    for (const v of vals) {
      if (typeof v === 'number' && !Number.isNaN(v)) return v;
    }
    return 0;
  };

  const typeLines = [
    { label: 'Directory Opportunities', value: snap?.directories },
    { label: 'Guest Posts', value: snap?.guestPosts },
    { label: 'Image Submission', value: snap?.images },
    { label: 'Video Submission', value: snap?.videos },
    { label: 'Forums', value: snap?.forums },
    { label: 'Articles', value: snap?.articles },
    { label: 'Q&A', value: snap?.qa },
  ].filter((r) => (r.value ?? 0) > 0);

  const approved = num(s.approved);
  const nextCta = actionItems[0]
    ? {
        href: `/projects/${projectId}/backlink-builder/browser-assistant?jobId=${actionItems[0].jobId}`,
        label: 'Continue Submission',
        line: `${actionItems[0].reason} on ${actionItems[0].website}.`,
      }
    : jobsOpen
      ? {
          href: `/projects/${projectId}/backlink-builder/execution`,
          label: 'View progress',
          line: 'AI is submitting backlinks for you.',
        }
      : showComplete
        ? {
            href: `/projects/${projectId}/reports/library`,
            label: 'Open Reports',
            line: 'Your campaign workflow is complete.',
          }
        : {
            href: getStepHref(nextStep.id === currentStep.id ? currentStep : nextStep),
            label: 'Continue',
            line:
              classified > 0 && currentStep.id === 'ai-review'
                ? `Approve ${classified} opportunities.`
                : approved > 0 && currentStep.number <= 4
                  ? `Approve remaining opportunities, then generate content.`
                  : nextStep.purpose,
          };

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6"
      >
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{project?.name ?? 'Your project'}</p>
          <h1 className="text-3xl font-semibold tracking-tight">Hello {firstName}</h1>
          <div className="rounded-2xl border border-border/40 bg-card px-5 py-5 shadow-sm space-y-4 text-[15px] leading-relaxed">
            {summary.isLoading || classification.isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : classified > 0 ? (
              <>
                <p>I analyzed {classified} websites.</p>
                <ul className="space-y-1 text-muted-foreground">
                  {typeLines.length > 0
                    ? typeLines.map((t) => (
                        <li key={t.label}>
                          <span className="font-medium text-foreground tabular-nums">
                            {t.value}
                          </span>{' '}
                          {t.label}
                        </li>
                      ))
                    : (
                        <li>Opportunities are ready for your review.</li>
                      )}
                </ul>
              </>
            ) : jobsOpen ? (
              <p>
                AI is submitting backlinks
                {beeProgress.data?.etaSeconds
                  ? ` · ETA ${formatEta(beeProgress.data.etaSeconds)}`
                  : ''}
                .
              </p>
            ) : actionItems.length > 0 ? (
              <p>
                I need a quick hand on {actionItems[0].website} — {actionItems[0].reason}. Then I
                continue automatically.
              </p>
            ) : (
              <p>
                I&apos;m ready to build backlinks for {project?.name ?? 'your site'}. Follow the
                workflow — I handle the rest.
              </p>
            )}

            <div className="pt-2 border-t border-border/40 space-y-2">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Your next step</p>
              <p className="font-medium">{nextCta.line}</p>
              <Button asChild size="lg" className="mt-1">
                <Link to={nextCta.href}>
                  {nextCta.label}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </motion.div>

      <WorkflowRoadmap projectId={projectId} />

      <Card className="border-border/40 shadow-sm rounded-2xl">
        <CardContent className="pt-5 grid gap-3 sm:grid-cols-4 text-sm">
          {(
            [
              ['Submitted', num(s.submitted, s.todayBacklinks)],
              ['Pending', num(s.pending)],
              ['Verified', num(s.verified, s.won)],
              [
                'Success',
                beeProgress.data?.successRate != null
                  ? `${beeProgress.data.successRate}%`
                  : '—',
              ],
            ] as const
          ).map(([label, value]) => (
            <div key={label}>
              <p className="text-xs text-muted-foreground">Today · {label}</p>
              <p className="text-xl font-semibold tabular-nums mt-0.5">{value}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

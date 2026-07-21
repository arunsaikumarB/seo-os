import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bell, Loader2 } from 'lucide-react';
import { useApi } from '@/hooks/use-api';
import { useAppStore } from '@/stores/app-store';
import { useWorkflow } from '@/hooks/use-workflow';
import { useBeeExecutionProgress } from '@/hooks/use-bee-execution-progress';
import { useInterventions } from '@/components/browser/needs-your-action-queue';
import { formatEta } from '@/lib/bee-execution-ui';
import { cn } from '@/lib/utils';

type Props = {
  projectId: string;
  className?: string;
};

/** Always-visible AI status — intervention CTAs live only in InterventionBanner */
export function GlobalStatusBar({ projectId, className }: Props) {
  const { request, fetchProjects } = useApi();
  const currentOrgId = useAppStore((s) => s.currentOrgId);
  const { completedCount, totalSteps, currentStep } = useWorkflow(projectId);
  const bee = useBeeExecutionProgress(projectId, 2_000);
  const interventions = useInterventions(projectId, 3_000);

  const project = useQuery({
    queryKey: ['projects', currentOrgId],
    queryFn: () => fetchProjects(currentOrgId!),
    enabled: !!currentOrgId,
  });
  const name = project.data?.data.find((p) => p.id === projectId)?.name ?? 'Project';

  const notifications = useQuery({
    queryKey: ['notifications-count', currentOrgId],
    queryFn: () =>
      request<{ data: { unread?: number } | unknown[] }>(`/v1/notifications?limit=1`).catch(
        () => ({ data: [] as unknown[] })
      ),
    enabled: !!currentOrgId,
    refetchInterval: 60_000,
    retry: false,
  });

  const p = bee.data;
  const actionItems = interventions.data?.data.items ?? [];
  const needsAction = actionItems.length > 0;
  const hasJobs = (p?.totalJobs ?? 0) > 0;
  const unread = Array.isArray(notifications.data?.data)
    ? 0
    : Number((notifications.data?.data as { unread?: number })?.unread ?? 0);

  const firstAction = actionItems[0];
  const aiTask = !p
    ? currentStep.title
    : needsAction && firstAction
      ? 'waiting for you'
      : p.running > 0
        ? 'Submitting backlinks'
        : p.queued > 0
          ? 'Preparing submissions'
          : p.waitingVerification > 0
            ? 'Verifying links'
            : p.executionComplete
              ? 'Ready'
              : currentStep.title;

  const pct = hasJobs
    ? Math.round(p?.progressPercent ?? 0)
    : Math.round((completedCount / Math.max(totalSteps, 1)) * 100);
  const progressLabel = hasJobs
    ? `${p?.completedJobs ?? 0}/${p?.totalJobs ?? 0}`
    : `${completedCount}/${totalSteps}`;
  const showSpin = Boolean(p && (p.running > 0 || needsAction));

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-border/50 bg-muted/30 px-4 py-2 text-xs md:px-6',
        className
      )}
    >
      <Link
        to={`/projects/${projectId}/home`}
        className="font-medium text-foreground hover:underline truncate max-w-[160px]"
      >
        {name}
      </Link>
      <span className="text-muted-foreground tabular-nums">
        {progressLabel}
        {hasJobs ? ` (${pct}%)` : ''}
        {hasJobs && p && !p.executionComplete && p.etaSeconds > 0
          ? ` · ETA ${formatEta(p.etaSeconds)}`
          : ''}
      </span>
      <span className="inline-flex items-center gap-1.5 text-muted-foreground min-w-0">
        {showSpin ? <Loader2 className="h-3 w-3 animate-spin text-primary shrink-0" /> : null}
        <span className="truncate">
          AI is{' '}
          {aiTask.toLowerCase().startsWith('waiting') || aiTask === 'Ready'
            ? aiTask.toLowerCase()
            : `doing: ${aiTask}`}
        </span>
      </span>
      <Link
        to={`/org/settings/notifications`}
        className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground ml-auto"
      >
        <Bell className="h-3.5 w-3.5" />
        {unread > 0 ? unread : 'Alerts'}
      </Link>
    </div>
  );
}

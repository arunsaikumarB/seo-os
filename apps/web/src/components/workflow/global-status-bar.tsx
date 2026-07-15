import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bell, Loader2 } from 'lucide-react';
import { useApi } from '@/hooks/use-api';
import { useAppStore } from '@/stores/app-store';
import { useWorkflow } from '@/hooks/use-workflow';
import { cn } from '@/lib/utils';

type Props = {
  projectId: string;
  className?: string;
};

export function GlobalStatusBar({ projectId, className }: Props) {
  const { request, fetchProjects } = useApi();
  const currentOrgId = useAppStore((s) => s.currentOrgId);
  const { completedCount, totalSteps, currentStep } = useWorkflow(projectId);

  const project = useQuery({
    queryKey: ['projects', currentOrgId],
    queryFn: () => fetchProjects(currentOrgId!),
    enabled: !!currentOrgId,
  });
  const name = project.data?.data.find((p) => p.id === projectId)?.name ?? 'Project';

  const stats = useQuery({
    queryKey: ['bee-stats-status', projectId],
    queryFn: () =>
      request<{
        data: { queued?: number; running?: number; watching?: number };
      }>(`/v1/projects/${projectId}/browser/statistics`).catch(() => ({ data: {} })),
    enabled: !!projectId,
    refetchInterval: 20_000,
    retry: false,
  });

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

  const bee = (stats.data?.data ?? {}) as {
    queued?: number;
    running?: number;
    watching?: number;
  };
  const queued = Number(bee.queued ?? 0);
  const running = Number(bee.running ?? 0);
  const watching = Number(bee.watching ?? 0);
  const unread = Array.isArray(notifications.data?.data)
    ? 0
    : Number((notifications.data?.data as { unread?: number })?.unread ?? 0);

  const aiTask =
    running > 0
      ? 'Browser submitting…'
      : watching > 0
        ? 'Waiting for your approval…'
        : queued > 0
          ? 'Jobs queued…'
          : currentStep.title;

  const pct = Math.round((completedCount / Math.max(totalSteps, 1)) * 100);

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
      <span className="text-muted-foreground tabular-nums">Workflow {pct}%</span>
      <span className="inline-flex items-center gap-1.5 text-muted-foreground min-w-0">
        {(running > 0 || watching > 0) && (
          <Loader2 className="h-3 w-3 animate-spin text-primary shrink-0" />
        )}
        <span className="truncate">AI: {aiTask}</span>
      </span>
      <span className="text-muted-foreground tabular-nums">Queued {queued}</span>
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

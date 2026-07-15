import { useQuery } from '@tanstack/react-query';
import { useApi } from '@/hooks/use-api';

export type BeeExecutionProgress = {
  totalJobs: number;
  completedJobs: number;
  remainingJobs: number;
  progressPercent: number;
  executionComplete: boolean;
  running: number;
  queued: number;
  failed: number;
  submitted: number;
  waitingApproval: number;
  waitingVerification: number;
  waitingLogin: number;
  waitingMfa: number;
  workerUsage: string;
  maxParallelSessions: number;
  activeWorkerCount: number;
  etaSeconds: number;
  estimatedApprovalTime: string;
  successRate: number | null;
};

const EMPTY: BeeExecutionProgress = {
  totalJobs: 0,
  completedJobs: 0,
  remainingJobs: 0,
  progressPercent: 0,
  executionComplete: false,
  running: 0,
  queued: 0,
  failed: 0,
  submitted: 0,
  waitingApproval: 0,
  waitingVerification: 0,
  waitingLogin: 0,
  waitingMfa: 0,
  workerUsage: '0/0',
  maxParallelSessions: 0,
  activeWorkerCount: 0,
  etaSeconds: 0,
  estimatedApprovalTime: '7–14 days',
  successRate: null,
};

/** Live BEE progress from `/browser/statistics` — source of truth for Workflow Complete / %. */
export function useBeeExecutionProgress(projectId: string, refetchInterval = 2_000) {
  const { request } = useApi();
  return useQuery({
    queryKey: ['bee-execution-progress', projectId],
    queryFn: async (): Promise<BeeExecutionProgress> => {
      const res = await request<{ data: Partial<BeeExecutionProgress> }>(
        `/v1/projects/${projectId}/browser/statistics`
      );
      const d = res.data ?? {};
      const max = Number(d.maxParallelSessions ?? 0);
      const active = Number(d.activeWorkerCount ?? 0);
      return {
        ...EMPTY,
        ...d,
        totalJobs: Number(d.totalJobs ?? 0),
        completedJobs: Number(d.completedJobs ?? 0),
        remainingJobs: Number(d.remainingJobs ?? 0),
        progressPercent: Number(d.progressPercent ?? 0),
        executionComplete: Boolean(d.executionComplete),
        running: Number(d.running ?? 0),
        queued: Number(d.queued ?? 0),
        failed: Number(d.failed ?? 0),
        submitted: Number(d.submitted ?? 0),
        waitingApproval: Number(d.waitingApproval ?? 0),
        waitingVerification: Number(d.waitingVerification ?? 0),
        waitingLogin: Number(d.waitingLogin ?? 0),
        waitingMfa: Number(d.waitingMfa ?? 0),
        maxParallelSessions: max,
        activeWorkerCount: active,
        workerUsage: d.workerUsage ?? `${active}/${max}`,
        etaSeconds: Number(d.etaSeconds ?? 0),
        estimatedApprovalTime: String(d.estimatedApprovalTime ?? '7–14 days'),
        successRate: d.successRate ?? null,
      };
    },
    enabled: !!projectId,
    refetchInterval,
    retry: false,
  });
}

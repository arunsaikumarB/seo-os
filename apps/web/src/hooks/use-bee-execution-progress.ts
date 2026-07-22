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
  failedToStart?: number;
  submitted: number;
  skipped: number;
  deleted: number;
  waitingApproval: number;
  waitingVerification: number;
  waitingLogin: number;
  waitingMfa: number;
  needsYourAction: number;
  needsYou: number;
  workerUsage: string;
  maxParallelSessions: number;
  activeWorkerCount: number;
  etaSeconds: number;
  estimatedApprovalTime: string;
  successRate: number | null;
  trackResults?: Record<string, number>;
  /** ESM campaign lifecycle */
  campaignState?: string;
  campaignIsRunning?: boolean;
  aiStatusLine?: string;
  current?: { website?: string; step?: string; browser?: string };
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
  failedToStart: 0,
  submitted: 0,
  skipped: 0,
  deleted: 0,
  waitingApproval: 0,
  waitingVerification: 0,
  waitingLogin: 0,
  waitingMfa: 0,
  needsYourAction: 0,
  needsYou: 0,
  workerUsage: '0/0',
  maxParallelSessions: 0,
  activeWorkerCount: 0,
  etaSeconds: 0,
  estimatedApprovalTime: '7–14 days',
  successRate: null,
  campaignState: 'Idle',
  campaignIsRunning: false,
  aiStatusLine: 'Ready to submit',
};

/** Live progress from Execution State Manager (`/browser/statistics`). */
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
      const needsYou = Number(
        d.needsYou ?? d.needsYourAction ?? d.waitingApproval ?? 0
      );
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
        failedToStart: Number(d.failedToStart ?? 0),
        submitted: Number(d.submitted ?? 0),
        skipped: Number(d.skipped ?? 0),
        deleted: Number(d.deleted ?? 0),
        waitingApproval: Number(d.waitingApproval ?? 0),
        waitingVerification: Number(d.waitingVerification ?? 0),
        waitingLogin: Number(d.waitingLogin ?? 0),
        waitingMfa: Number(d.waitingMfa ?? 0),
        needsYourAction: needsYou,
        needsYou,
        maxParallelSessions: max,
        activeWorkerCount: active,
        workerUsage: d.workerUsage ?? `${active}/${max}`,
        etaSeconds: Number(d.etaSeconds ?? 0),
        estimatedApprovalTime: String(d.estimatedApprovalTime ?? '7–14 days'),
        successRate: d.successRate ?? null,
        trackResults: d.trackResults,
        campaignState: String(d.campaignState ?? 'Idle'),
        campaignIsRunning: Boolean(d.campaignIsRunning),
        aiStatusLine: String(d.aiStatusLine ?? 'Ready to submit'),
        current: d.current
          ? {
              website: d.current.website,
              step: d.current.step,
              browser: d.current.browser,
            }
          : undefined,
      };
    },
    enabled: !!projectId,
    refetchInterval,
    retry: false,
  });
}

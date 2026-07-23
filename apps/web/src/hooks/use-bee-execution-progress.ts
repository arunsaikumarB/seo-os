/**
 * @deprecated Prefer `useExecutionSummary` — kept as a thin adapter so older
 * call sites share the same React Query cache as the execution page.
 */
import {
  useExecutionSummary,
  type ExecutionSummary,
} from '@/hooks/use-execution-summary';

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
  campaignState?: string;
  campaignIsRunning?: boolean;
  aiStatusLine?: string;
  current?: { website?: string; step?: string; browser?: string };
};

function fromSummary(s: ExecutionSummary | undefined): BeeExecutionProgress | undefined {
  if (!s) return undefined;
  return {
    totalJobs: s.total,
    completedJobs: s.completed,
    remainingJobs: s.remaining,
    progressPercent: s.progressPercent,
    executionComplete: s.executionComplete,
    running: s.running,
    queued: s.queued,
    failed: s.failed,
    failedToStart: 0,
    submitted: s.completed,
    skipped: s.skipped,
    deleted: s.deleted,
    waitingApproval: s.waitingHuman,
    waitingVerification: 0,
    waitingLogin: 0,
    waitingMfa: 0,
    needsYourAction: s.waitingHuman,
    needsYou: s.waitingHuman,
    workerUsage: `${s.running}/—`,
    maxParallelSessions: 0,
    activeWorkerCount: s.running,
    etaSeconds: s.etaSeconds,
    estimatedApprovalTime: s.estimatedVerificationTime || '7–14 days',
    successRate: null,
    campaignState: s.campaignState,
    campaignIsRunning: s.running > 0 || s.campaignState === 'Running',
    aiStatusLine: s.aiStatusLine,
    current:
      s.currentWebsite || s.currentStep
        ? { website: s.currentWebsite ?? undefined, step: s.currentStep ?? undefined }
        : undefined,
  };
}

/** Live progress — same selector / cache as `useExecutionSummary` (execution page). */
export function useBeeExecutionProgress(projectId: string, refetchInterval = 2_000) {
  const q = useExecutionSummary(projectId, refetchInterval);
  return {
    ...q,
    data: fromSummary(q.data),
  };
}

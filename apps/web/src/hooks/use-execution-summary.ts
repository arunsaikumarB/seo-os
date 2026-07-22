/**
 * Phase 4.7 — ONE Execution Summary Model for all surfaces.
 * Reads `/browser/statistics` (ESM-backed). No page recalculates progress.
 */
import { useQuery } from '@tanstack/react-query';
import { useApi } from '@/hooks/use-api';

export type ExecutionSummary = {
  queued: number;
  running: number;
  completed: number;
  waitingHuman: number;
  skipped: number;
  failed: number;
  deleted: number;
  remaining: number;
  total: number;
  progressPercent: number;
  etaSeconds: number;
  executionComplete: boolean;
  campaignState: string;
  aiStatusLine: string;
  estimatedVerificationTime: string;
  currentWebsite: string | null;
  currentStep: string | null;
  currentElapsedMs: number;
  activityFeed: Array<{ website: string; stage: string; at: string }>;
};

type StatsPayload = {
  executionSummary?: Partial<ExecutionSummary>;
  queued?: number;
  running?: number;
  completed?: number;
  submitted?: number;
  completedJobs?: number;
  waitingHuman?: number;
  needsYou?: number;
  needsYourAction?: number;
  skipped?: number;
  failed?: number;
  deleted?: number;
  remainingJobs?: number;
  totalJobs?: number;
  progressPercent?: number;
  etaSeconds?: number;
  executionComplete?: boolean;
  campaignState?: string;
  aiStatusLine?: string;
  estimatedVerificationTime?: string;
  estimatedApprovalTime?: string;
  current?: { website?: string; step?: string; elapsedMs?: number };
  activityFeed?: Array<{ website: string; stage: string; at: string }>;
};

function normalize(d: StatsPayload): ExecutionSummary {
  const es = d.executionSummary ?? {};
  const completed = Number(
    es.completed ?? d.completed ?? d.submitted ?? d.completedJobs ?? 0
  );
  const waitingHuman = Number(
    es.waitingHuman ?? d.waitingHuman ?? d.needsYou ?? d.needsYourAction ?? 0
  );
  const running = Number(es.running ?? d.running ?? 0);
  const remaining = Number(es.remaining ?? d.remainingJobs ?? 0);
  const total = Number(es.total ?? d.totalJobs ?? 0);
  return {
    queued: Number(es.queued ?? d.queued ?? 0),
    running,
    completed,
    waitingHuman,
    skipped: Number(es.skipped ?? d.skipped ?? 0),
    failed: Number(es.failed ?? d.failed ?? 0),
    deleted: Number(es.deleted ?? d.deleted ?? 0),
    remaining,
    total,
    progressPercent: Number(es.progressPercent ?? d.progressPercent ?? 0),
    etaSeconds: Number(es.etaSeconds ?? d.etaSeconds ?? 0),
    executionComplete: Boolean(es.executionComplete ?? d.executionComplete),
    campaignState: String(es.campaignState ?? d.campaignState ?? 'Idle'),
    aiStatusLine: String(es.aiStatusLine ?? d.aiStatusLine ?? 'Ready to submit'),
    estimatedVerificationTime: String(
      es.estimatedVerificationTime ??
        d.estimatedVerificationTime ??
        d.estimatedApprovalTime ??
        '24 hours'
    ),
    currentWebsite: d.current?.website ?? null,
    currentStep: d.current?.step ?? null,
    currentElapsedMs: Number(d.current?.elapsedMs ?? 0),
    activityFeed: Array.isArray(d.activityFeed) ? d.activityFeed : [],
  };
}

/** Sole hook for execution counts / progress / live current — all pages use this. */
export function useExecutionSummary(projectId: string, refetchInterval = 1_500) {
  const { request } = useApi();
  return useQuery({
    queryKey: ['execution-summary', projectId],
    queryFn: async (): Promise<ExecutionSummary> => {
      const res = await request<{ data: StatsPayload }>(
        `/v1/projects/${projectId}/browser/statistics`
      );
      return normalize(res.data ?? {});
    },
    enabled: !!projectId,
    refetchInterval,
    retry: 1,
    // Never placeholder zeros — that made Track Results look "loaded" with empty counters
    // while Campaign Health / Reports already had live CSM-backed numbers.
    placeholderData: undefined,
  });
}

export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

export function explainWaitingHuman(gate?: string | null, reason?: string | null): {
  title: string;
  detail: string;
} {
  const g = String(gate ?? '');
  if (g === 'login') return { title: 'Login Required', detail: reason || 'Login form detected.' };
  if (g === 'signup')
    return { title: 'Registration Required', detail: reason || 'Registration form detected.' };
  if (g === 'captcha' || g === 'cloudflare')
    return { title: 'CAPTCHA / Security Check', detail: reason || 'Challenge detected.' };
  if (g === 'human_approval')
    return { title: 'Manual Approval', detail: reason || 'Editor approval required.' };
  if (g === 'mfa' || g === 'otp')
    return { title: 'Verification Code', detail: reason || 'OTP / MFA required.' };
  if (g === 'unclassified')
    return { title: 'Needs diagnosis', detail: reason || 'Obstacle could not be classified.' };
  return { title: 'Waiting Human', detail: reason || 'A human step is required.' };
}

export function explainFailure(
  errorCode?: string | null,
  errorMessage?: string | null
): { title: string; detail: string; retry: boolean; needsHuman: boolean } {
  const code = String(errorCode ?? '').toUpperCase();
  const msg = String(errorMessage ?? '');
  if (/CLOUDFLARE|CAPTCHA|CHALLENGE/i.test(code + msg)) {
    return {
      title: 'Cloudflare',
      detail: 'Blocked by challenge.',
      retry: false,
      needsHuman: true,
    };
  }
  if (/FORM|NO_FORM|MISSING/i.test(code) || /form not found|no submission form/i.test(msg)) {
    return {
      title: 'Form Missing',
      detail: msg || 'Submission form not found.',
      retry: true,
      needsHuman: false,
    };
  }
  if (/TIMEOUT|TIMED_OUT|NETWORK/i.test(code + msg)) {
    return {
      title: 'Timeout',
      detail: msg || 'Network timeout after 60 seconds.',
      retry: true,
      needsHuman: false,
    };
  }
  if (/OFFLINE|DNS|SITE/i.test(code)) {
    return {
      title: 'Site Offline',
      detail: msg || 'Website did not respond.',
      retry: true,
      needsHuman: false,
    };
  }
  return {
    title: 'Failed',
    detail: msg || 'Execution failed.',
    retry: true,
    needsHuman: false,
  };
}

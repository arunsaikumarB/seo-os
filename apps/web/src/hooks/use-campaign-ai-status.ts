/**
 * Shared campaign AI / generation status for progressive disclosure.
 * Bee path reads ONE Execution Summary (Phase 4.7) — never recalculates.
 */
import { useQuery } from '@tanstack/react-query';
import { useApi } from '@/hooks/use-api';
import { useExecutionSummary } from '@/hooks/use-execution-summary';

export type ContentGenBoard = {
  progress: {
    approved: number;
    queued: number;
    generating: number;
    completed: number;
    failed: number;
    needsReview: number;
    waiting: number;
    percent: number;
    active: boolean;
  };
  estimates: {
    websites: number;
    durationLabel: string;
    tokensLabel: string;
    imagesLabel: string;
    costLabel: string;
    isDefaultEstimate: boolean;
    concurrency: number;
  };
  eta: string | null;
  current: Array<{ id: string; website: string; stage: string }>;
  reviewQueue: Array<{
    id: string;
    website: string;
    generationStatus: string | null;
    qualityScore: number | null;
    lastError: string | null;
    packageStatus: string | null;
    imageStatus: string | null;
    metadataStatus: string | null;
    videoMetadataStatus: string | null;
    schemaStatus: string | null;
    retryCount: number;
  }>;
  generationAudit?: {
    packages: { generated: number; missingFailed: number };
    images: { generated: number; missingFailed: number };
    metadata: { generated: number; missingFailed: number };
    videoMetadata: { generated: number; missingFailed: number };
    schema: { generated: number; missingFailed: number };
  };
  consumerAlive?: boolean;
  consumerHeartbeatAgeMs?: number | null;
  generationInterrupted?: boolean;
  dashboardCard: {
    title: string;
    approved: number;
    completed: number;
    generating: number;
    waiting: number;
    failed: number;
    needsReview: number;
    eta: string | null;
  };
};

export type GeneratePageState = 'idle' | 'running' | 'complete' | 'empty';

export function useCampaignAiStatus(projectId: string) {
  const { request } = useApi();
  const summaryQ = useExecutionSummary(projectId, 2_000);
  const s = summaryQ.data;

  const boardQ = useQuery({
    queryKey: ['content-generation', projectId],
    queryFn: () =>
      request<{ data: ContentGenBoard }>(
        `/v1/projects/${projectId}/backlink-builder/automation/content-generation`
      ),
    enabled: !!projectId,
    refetchInterval: (q) => {
      const d = q.state.data?.data;
      if (d?.progress?.active || d?.generationInterrupted) return 2_000;
      return 10_000;
    },
  });

  const board = boardQ.data?.data;
  const progress = board?.progress;
  const generationInterrupted = Boolean(board?.generationInterrupted);
  const consumerAlive = board?.consumerAlive !== false;
  // Honest activity: Queued alone is not "Generating" unless consumer heartbeat is live.
  const genLive = Boolean(progress?.active) && consumerAlive && !generationInterrupted;
  const genActive = genLive || generationInterrupted;

  const campaignState = s?.campaignState ?? 'Idle';
  // Same activity rules as execution page (live jobs / waiting human — not Ready CSM as "queued")
  const beeRunning = Boolean(
    (s?.running ?? 0) > 0 ||
      (s?.waitingHuman ?? 0) > 0 ||
      campaignState === 'Running' ||
      campaignState === 'Paused' ||
      campaignState === 'Waiting Human' ||
      (campaignState === 'Starting' && (s?.queued ?? 0) > 0)
  );

  const aiActive = genActive || beeRunning;

  let currentLabel = '';
  let currentWebsite: string | null = null;
  let currentStep: string | null = null;
  let currentActivity = '';
  let completed = 0;
  let remaining = 0;
  let percent = 0;
  let eta: string | null = null;

  if (generationInterrupted && progress) {
    currentLabel = 'Generation interrupted — resuming…';
    currentActivity = 'Resuming';
    completed = progress.completed;
    remaining = progress.queued + progress.generating;
    percent = Math.round(progress.percent);
    eta = null;
  } else if (genLive && progress) {
    currentLabel = 'Generating Packages';
    currentActivity = 'Generating';
    const cur = board?.current?.[0];
    if (cur) {
      currentLabel = `${cur.website} — ${cur.stage}`;
      currentWebsite = cur.website;
      currentStep = cur.stage;
    }
    completed = progress.completed;
    remaining = progress.queued + progress.generating;
    percent = Math.round(progress.percent);
    eta = board?.eta ?? null;
  } else if (beeRunning && s) {
    currentActivity =
      campaignState === 'Waiting Human'
        ? 'Waiting for you'
        : campaignState === 'Paused'
          ? 'Paused'
          : s.currentStep || 'Submitting';
    currentWebsite = s.currentWebsite;
    currentStep = s.currentStep;
    currentLabel =
      s.currentWebsite && s.currentStep
        ? `${s.currentWebsite} — ${s.currentStep}`
        : s.aiStatusLine || 'Submitting Backlinks';
    completed = s.completed;
    remaining = s.remaining;
    percent = Math.round(s.progressPercent);
    eta =
      s.etaSeconds > 0
        ? s.etaSeconds < 60
          ? `${s.etaSeconds} sec`
          : `${Math.ceil(s.etaSeconds / 60)}m`
        : null;
  }

  const needsReview = progress?.needsReview ?? 0;
  const failed = progress?.failed ?? 0;
  const exceptionCount = needsReview + failed;

  const generateState: GeneratePageState = (() => {
    if (!progress) return 'empty';
    if (generationInterrupted || progress.active) return 'running';
    if (progress.completed > 0 || progress.needsReview > 0 || progress.failed > 0) {
      return 'complete';
    }
    if (progress.approved > 0) return 'idle';
    return 'empty';
  })();

  return {
    board,
    boardLoading: boardQ.isLoading,
    progress,
    genActive,
    generationInterrupted,
    consumerAlive: board?.consumerAlive,
    beeRunning,
    aiActive,
    currentLabel,
    currentWebsite,
    currentStep,
    currentActivity,
    completed,
    remaining,
    percent,
    eta,
    needsReview,
    failed,
    exceptionCount,
    generateState,
    estimates: board?.estimates,
    reviewQueue: board?.reviewQueue ?? [],
    generationAudit: board?.generationAudit,
    invalidateKeys: ['content-generation', projectId] as const,
    executionSummary: s,
  };
}

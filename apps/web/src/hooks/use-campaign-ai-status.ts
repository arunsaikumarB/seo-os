/**
 * Shared campaign AI / generation status for progressive disclosure.
 * Reads existing content-generation board (CSM-backed) — no new APIs.
 */
import { useQuery } from '@tanstack/react-query';
import { useApi } from '@/hooks/use-api';
import { useBeeExecutionProgress } from '@/hooks/use-bee-execution-progress';

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
  const bee = useBeeExecutionProgress(projectId, 3_000);

  const boardQ = useQuery({
    queryKey: ['content-generation', projectId],
    queryFn: () =>
      request<{ data: ContentGenBoard }>(
        `/v1/projects/${projectId}/backlink-builder/automation/content-generation`
      ),
    enabled: !!projectId,
    refetchInterval: (q) => (q.state.data?.data?.progress?.active ? 2_000 : 10_000),
  });

  const board = boardQ.data?.data;
  const progress = board?.progress;
  const genActive = Boolean(progress?.active);

  const campaignState = bee.data?.campaignState ?? 'Idle';
  const beeRunning = Boolean(
    bee.data?.campaignIsRunning ||
      campaignState === 'Starting' ||
      campaignState === 'Paused' ||
      campaignState === 'Waiting Human'
  );

  const aiActive = genActive || beeRunning;

  let currentLabel = '';
  let completed = 0;
  let remaining = 0;
  let percent = 0;
  let eta: string | null = null;

  if (genActive && progress) {
    currentLabel = 'Generating Packages';
    const cur = board?.current?.[0];
    if (cur) currentLabel = `${cur.website} — ${cur.stage}`;
    completed = progress.completed;
    remaining = progress.queued + progress.generating;
    percent = Math.round(progress.percent);
    eta = board?.eta ?? null;
  } else if (beeRunning && bee.data) {
    currentLabel =
      campaignState === 'Waiting Human'
        ? 'Waiting for you'
        : campaignState === 'Paused'
          ? 'Paused'
          : 'Submitting Backlinks';
    completed = bee.data.completedJobs ?? 0;
    remaining = Math.max(0, (bee.data.totalJobs ?? 0) - completed);
    percent = Math.round(bee.data.progressPercent ?? 0);
    eta =
      bee.data.etaSeconds > 0
        ? bee.data.etaSeconds < 60
          ? `${bee.data.etaSeconds} sec`
          : `${Math.ceil(bee.data.etaSeconds / 60)}m`
        : null;
  }

  const needsReview = progress?.needsReview ?? 0;
  const failed = progress?.failed ?? 0;
  const exceptionCount = needsReview + failed;

  const generateState: GeneratePageState = (() => {
    if (!progress) return 'empty';
    if (progress.active) return 'running';
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
    beeRunning,
    aiActive,
    currentLabel,
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
  };
}

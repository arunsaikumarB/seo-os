/** Shared Browser Execution status / pipeline helpers — labels mirror backend job state. */

export const EXECUTION_PIPELINE_STAGES = [
  'Opening Website',
  'Detecting Type',
  'Finding Form',
  'Filling Form',
  'Uploading Assets',
  'Submitting',
  'Checking Backlinks',
  'Completed',
] as const;

export type ExecutionPipelineStage = (typeof EXECUTION_PIPELINE_STAGES)[number];

const TERMINAL = new Set([
  'submitted',
  'completed',
  'verified',
  'waiting_verification',
  'failed',
  'cancelled',
  'skipped',
  'unsupported',
  'deleted',
  'ignored',
  'approved',
  'rejected',
]);

export function isTerminalJobStatus(status: string): boolean {
  return TERMINAL.has(status);
}

/** Concise badge labels — aligned with Execution State Manager public statuses. */
export function executionStatusLabel(
  status: string,
  opts?: {
    pauseReason?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
    disposition?: string | null;
  }
): string {
  const s = status;
  const d = String(opts?.disposition ?? '');
  if (s === 'deleted' || d === 'deleted_forever') return 'Deleted';
  if (s === 'ignored') return 'Ignored';
  if (s === 'skipped' || s === 'unsupported') return 'Skipped';
  if (s === 'waiting_infrastructure' || opts?.errorCode === 'BROWSER_RUNTIME_MISSING') {
    return 'Queued';
  }
  if (s === 'failed') return 'Failed';
  if (s === 'cancelled') return 'Skipped';
  if (s === 'retry_scheduled') return 'Queued';
  if (s === 'queued') return 'Queued';
  if (
    s.startsWith('watching_') ||
    s.startsWith('blocked_') ||
    s === 'paused' ||
    s === 'needs_approval' ||
    s === 'ready_for_review' ||
    s === 'awaiting_user' ||
    s === 'ready_to_continue'
  ) {
    return 'Waiting Human';
  }
  if (s === 'approved') return 'Approved';
  if (s === 'rejected') return 'Rejected';
  if (s === 'waiting_verification') return 'Submitted';
  if (s === 'submitted' || s === 'completed' || s === 'verified') {
    return s === 'verified' ? 'Verified' : 'Submitted';
  }
  if (
    [
      'preparing',
      'launching_browser',
      'authenticating',
      'navigating',
      'analyzing_form',
      'filling_fields',
      'uploading_assets',
      'validating',
      'submitting',
    ].includes(s)
  ) {
    return 'Running';
  }
  return s.replace(/_/g, ' ');
}

/** Map job status (+ optional step action) to pipeline stage index. */
export function pipelineStageIndex(
  status: string,
  opts?: { pauseReason?: string | null; stepAction?: string | null }
): number {
  const s = status;
  const action = String(opts?.stepAction ?? '');
  if (s === 'failed' || s === 'cancelled') return -1;
  if (s === 'completed' || s === 'verified' || s === 'submitted') return 7;
  if (s === 'waiting_verification') return 6;
  if (s === 'submitting' || action === 'submit') return 5;
  if (
    s === 'uploading_assets' ||
    action.startsWith('upload')
  ) {
    return 4;
  }
  if (s === 'filling_fields' || s === 'validating' || action === 'fill' || action === 'select') {
    return 3;
  }
  if (s === 'analyzing_form' || action === 'analyze_form') return 2;
  if (s === 'navigating' || s === 'launching_browser' || action === 'open' || action === 'navigate') {
    if (action === 'analyze_form') return 2;
    return 0;
  }
  if (s === 'preparing' || s === 'queued' || s === 'retry_scheduled') return 0;
  if (executionStatusLabel(s, { pauseReason: opts?.pauseReason }) === 'Waiting for User') {
    return 5; // gates typically appear around submit / auth
  }
  // Detecting type sits between open and form find
  if (s === 'ready_to_continue') return 2;
  return 1;
}

export function pipelineStagesForJob(status: string, opts?: {
  pauseReason?: string | null;
  stepAction?: string | null;
}): Array<{ label: ExecutionPipelineStage; state: 'done' | 'current' | 'pending' | 'failed' }> {
  const idx = pipelineStageIndex(status, opts);
  if (status === 'failed') {
    return EXECUTION_PIPELINE_STAGES.map((label, i) => ({
      label,
      state: i === 0 ? 'failed' : 'pending',
    }));
  }
  if (status === 'cancelled') {
    return EXECUTION_PIPELINE_STAGES.map((label) => ({
      label,
      state: 'pending' as const,
    }));
  }
  return EXECUTION_PIPELINE_STAGES.map((label, i) => ({
    label,
    state: idx < 0 ? 'pending' : i < idx ? 'done' : i === idx ? 'current' : 'pending',
  }));
}

export function formatEta(seconds: number | null | undefined): string {
  if (seconds == null || seconds <= 0) return '—';
  if (seconds < 60) return `~${Math.round(seconds)}s`;
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `~${mins} min`;
  return `~${Math.round(mins / 60)}h ${mins % 60}m`;
}

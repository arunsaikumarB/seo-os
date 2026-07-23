/**
 * Phase 4 — BEE reliability tunables (single config location).
 * Override via process.env; defaults match the Phase 4 spec.
 */
export const BEE_RELIABILITY = {
  /** Heartbeat interval (ms) */
  HEARTBEAT_MS: Number(process.env.BEE_HEARTBEAT_MS ?? 5_000),
  /** Lease TTL = heartbeat × grace (default 5s × 6 = 30s) */
  LEASE_GRACE_MULTIPLIER: Number(process.env.BEE_LEASE_GRACE ?? 6),
  get LEASE_TTL_MS() {
    return this.HEARTBEAT_MS * this.LEASE_GRACE_MULTIPLIER;
  },
  /** Max concurrent browser sessions / workers (default 1 — small Railway OOMs at 2) */
  MAX_BROWSER_SESSIONS: Number(process.env.BEE_MAX_SESSIONS ?? 1) || 1,
  /** Recycle Chromium after N jobs to prevent memory creep */
  BROWSER_RECYCLE_AFTER_JOBS: Number(process.env.BEE_BROWSER_RECYCLE_JOBS ?? 25),
  /** Recycle Chromium after M minutes */
  BROWSER_RECYCLE_AFTER_MS: Number(process.env.BEE_BROWSER_RECYCLE_MS ?? 30 * 60_000),
  /** Site retries (default 2) — never unbounded */
  SITE_RETRY_LIMIT: Number(process.env.BEE_SITE_RETRY_LIMIT ?? 2),
  /** Whole-job wall-clock ceiling (ms) — never Running longer than this (default 10 min) */
  JOB_CEILING_MS: Number(process.env.BEE_JOB_CEILING_MS ?? 10 * 60_000),
  /** Lease sweep interval */
  LEASE_SWEEP_MS: Number(process.env.BEE_LEASE_SWEEP_MS ?? 8_000),
  /** Crash/hung watchdog: unchanged status+stage/progress across this many ticks → force-fail */
  CRASH_LOOP_TICKS: Number(process.env.BEE_CRASH_LOOP_TICKS ?? 2) || 2,
  /** Per-stage budget (ms) — hung escape; default 120s for work stages */
  STAGE_TIMEOUTS: {
    open: Number(process.env.BEE_TIMEOUT_OPEN_MS ?? 90_000),
    navigate: Number(process.env.BEE_TIMEOUT_NAVIGATE_MS ?? process.env.BEE_TIMEOUT_OPEN_MS ?? 90_000),
    launch: Number(process.env.BEE_TIMEOUT_LAUNCH_MS ?? 60_000),
    detect: Number(process.env.BEE_TIMEOUT_DETECT_MS ?? 120_000),
    find_form: Number(process.env.BEE_TIMEOUT_FORM_MS ?? 120_000),
    fill: Number(process.env.BEE_TIMEOUT_FILL_MS ?? 120_000),
    upload: Number(process.env.BEE_TIMEOUT_UPLOAD_MS ?? 120_000),
    submit: Number(process.env.BEE_TIMEOUT_SUBMIT_MS ?? 120_000),
    verify: Number(process.env.BEE_TIMEOUT_VERIFY_MS ?? 120_000),
  },
  /** Exponential backoff base for site retries (seconds): 10 → 40 → 160 */
  RETRY_BACKOFF_BASE_SEC: Number(process.env.BEE_RETRY_BACKOFF_BASE_SEC ?? 10),
} as const;

export function beeWorkerId(): string {
  return `bee-${process.pid}-${Math.random().toString(36).slice(2, 10)}`;
}

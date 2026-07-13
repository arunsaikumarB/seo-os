/** Ambient optional dependency — present only when installed in production */
declare module '@sentry/node' {
  export function init(options: Record<string, unknown>): void;
  export function captureException(exception: unknown, hint?: unknown): string;
}

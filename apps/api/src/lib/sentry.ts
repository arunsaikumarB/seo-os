/**
 * Optional Sentry integration — no-op unless SENTRY_DSN is configured.
 * Avoids hard dependency on Sentry at boot; loads SDK only when DSN is set.
 */
import { logger } from './logger.js';

let initialized = false;
let sentry: { captureException: (e: unknown, ctx?: object) => void } | null = null;

export async function initSentry(opts: {
  dsn?: string;
  environment?: string;
  release?: string;
}): Promise<void> {
  if (!opts.dsn || initialized) return;
  initialized = true;
  try {
    // Optional peer — install @sentry/node in production to enable
    const mod = await import('@sentry/node').catch(() => null);
    if (!mod) {
      logger.warn('SENTRY_DSN set but @sentry/node is not installed — error tracking disabled');
      return;
    }
    mod.init({
      dsn: opts.dsn,
      environment: opts.environment ?? process.env.NODE_ENV ?? 'production',
      release: opts.release ?? 'seo-os-api@1.2.5-bee-resume',
      tracesSampleRate: 0.05,
    });
    sentry = {
      captureException: (e, ctx) => {
        mod.captureException(e, ctx as never);
      },
    };
    logger.info('Sentry error tracking enabled');
  } catch (err) {
    logger.warn({ err }, 'Failed to initialize Sentry');
  }
}

export function captureException(err: unknown, context?: Record<string, unknown>): void {
  if (!sentry) return;
  try {
    sentry.captureException(err, { extra: context });
  } catch {
    // never throw from telemetry
  }
}

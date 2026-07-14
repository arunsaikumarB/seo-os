import 'dotenv/config';
import { createApp } from './app.js';
import { getEnv } from './config/env.js';
import { logger } from './lib/logger.js';
import { initSentry } from './lib/sentry.js';
import { startJobInfrastructure } from './jobs/index.js';
import { stopBoss } from './jobs/boss.js';

let server: ReturnType<ReturnType<typeof createApp>['listen']> | null = null;
let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Graceful shutdown started');
  const forceTimer = setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 25_000);
  forceTimer.unref();

  try {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server!.close((err) => (err ? reject(err) : resolve()));
      });
    }
    await stopBoss();
    logger.info('Graceful shutdown complete');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Shutdown failed');
    process.exit(1);
  }
}

async function main() {
  const env = getEnv();
  await initSentry({
    dsn: env.SENTRY_DSN || undefined,
    environment: env.SENTRY_ENVIRONMENT || env.NODE_ENV,
    release: 'seo-os-api@1.2.7-queue-init',
  });

  const app = createApp();

  if (env.ENABLE_WORKERS) {
    await startJobInfrastructure();
    logger.info('Background job workers enabled');
  } else {
    logger.info('Background job workers disabled (ENABLE_WORKERS=false)');
  }

  server = app.listen(env.PORT, '0.0.0.0', () => {
    logger.info({ port: env.PORT, host: '0.0.0.0', env: env.NODE_ENV }, 'SEO OS API started');
  });

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ err }, 'Failed to start API');
  process.exit(1);
});

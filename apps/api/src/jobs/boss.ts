import PgBoss from 'pg-boss';
import { getEnv } from '../config/env.js';
import { logger } from '../lib/logger.js';

let bossInstance: PgBoss | null = null;

export async function getBoss(): Promise<PgBoss | null> {
  const env = getEnv();
  if (!env.ENABLE_WORKERS) return null;

  if (!bossInstance) {
    bossInstance = new PgBoss({
      connectionString: env.DATABASE_URL,
      schema: 'pgboss',
    });
    await bossInstance.start();
    logger.info('pg-boss started');
  }
  return bossInstance;
}

export async function stopBoss(): Promise<void> {
  if (bossInstance) {
    await bossInstance.stop();
    bossInstance = null;
  }
}

/** Queue names — frozen in Infrastructure Freeze */
export const QUEUES = {
  CRITICAL: 'critical',
  AGENTS: 'agents',
  INGEST: 'ingest',
  CRAWL: 'crawl',
  PLAYWRIGHT: 'playwright',
  LOW: 'low',
} as const;

export type JobHandler = (jobs: PgBoss.Job<Record<string, unknown>>[]) => Promise<void>;

export async function registerJobHandler(queue: string, handler: JobHandler): Promise<void> {
  const boss = await getBoss();
  if (!boss) return;
  await boss.work(queue, handler);
  logger.info({ queue }, 'Job handler registered');
}

export async function enqueueJob<T extends Record<string, unknown>>(
  queue: string,
  name: string,
  data: T,
  options?: { singletonKey?: string; startAfter?: number; retryLimit?: number; retryDelay?: number }
): Promise<string | null> {
  const boss = await getBoss();
  if (!boss) {
    logger.debug({ queue, name }, 'Job enqueue skipped — workers disabled');
    return null;
  }
  return boss.send(queue, { ...data, __jobName: name }, {
    singletonKey: options?.singletonKey,
    startAfter: options?.startAfter,
    retryLimit: options?.retryLimit ?? 3,
    retryDelay: options?.retryDelay ?? 30,
    retryBackoff: true,
  });
}

import PgBoss from 'pg-boss';
import { getEnv } from '../config/env.js';
import { logger } from '../lib/logger.js';

let bossInstance: PgBoss | null = null;
const attachedWorkers = new Set<string>();
const lastProcessedAt = new Map<string, string>();
let latestWip: PgBoss.Worker[] = [];
let queuesInitialized = false;

/** Queue names — frozen in Infrastructure Freeze */
export const QUEUES = {
  CRITICAL: 'critical',
  AGENTS: 'agents',
  INGEST: 'ingest',
  CRAWL: 'crawl',
  PLAYWRIGHT: 'playwright',
  LOW: 'low',
} as const;

export const REQUIRED_QUEUE_NAMES = Object.values(QUEUES);

export async function getBoss(): Promise<PgBoss | null> {
  const env = getEnv();
  if (!env.ENABLE_WORKERS) return null;

  if (!bossInstance) {
    bossInstance = new PgBoss({
      connectionString: env.DATABASE_URL,
      schema: 'pgboss',
    });
    bossInstance.on('error', (err) => {
      logger.error({ err }, 'pg-boss error');
    });
    bossInstance.on('wip', (workers) => {
      latestWip = workers;
    });
    await bossInstance.start();
    logger.info('pg-boss started');
  }
  return bossInstance;
}

/**
 * pg-boss v10 requires explicit createQueue() before send()/work().
 * Call before registering workers. Throws if any required queue cannot be verified.
 */
export async function ensureRequiredQueues(boss?: PgBoss | null): Promise<string[]> {
  const instance = boss ?? (await getBoss());
  if (!instance) {
    throw new Error('Cannot initialize queues — workers are disabled or pg-boss failed to start');
  }

  const created: string[] = [];
  for (const name of REQUIRED_QUEUE_NAMES) {
    try {
      await instance.createQueue(name);
      created.push(name);
      logger.info({ queue: name }, 'pg-boss queue ensured');
    } catch (err) {
      // createQueue is idempotent in practice; re-check existence if create threw
      logger.warn({ err, queue: name }, 'createQueue threw — verifying queue exists');
    }
  }

  const verified: string[] = [];
  for (const name of REQUIRED_QUEUE_NAMES) {
    const q = await instance.getQueue(name);
    if (!q) {
      throw new Error(`Required pg-boss queue missing after createQueue: ${name}`);
    }
    verified.push(name);
  }

  // Prove send works on crawl (critical path for automation)
  const probeId = await instance.send(
    QUEUES.CRAWL,
    { type: 'queue_init_probe', ts: Date.now() },
    { singletonKey: `queue-init-probe-${Date.now()}`, retryLimit: 0, expireInSeconds: 30 }
  );
  if (!probeId) {
    throw new Error('pg-boss send(crawl) returned null after queue initialization');
  }
  try {
    await instance.deleteJob(QUEUES.CRAWL, probeId);
  } catch (err) {
    logger.warn({ err, probeId }, 'queue init probe cleanup skipped');
  }

  queuesInitialized = true;
  logger.info({ queues: verified }, 'All required pg-boss queues verified');
  return verified;
}

export function areQueuesInitialized(): boolean {
  return queuesInitialized;
}

export async function stopBoss(): Promise<void> {
  if (bossInstance) {
    await bossInstance.stop({ graceful: true, timeout: 10_000 }).catch(() =>
      bossInstance?.stop({ graceful: false, timeout: 1000 })
    );
    bossInstance = null;
  }
  attachedWorkers.clear();
  queuesInitialized = false;
  latestWip = [];
}

export type JobHandler = (jobs: PgBoss.Job<Record<string, unknown>>[]) => Promise<void>;

export async function registerJobHandler(queue: string, handler: JobHandler): Promise<void> {
  const boss = await getBoss();
  if (!boss) return;
  if (!queuesInitialized) {
    throw new Error(`Cannot register worker for ${queue} — queues not initialized`);
  }

  await boss.work(queue, async (jobs) => {
    lastProcessedAt.set(queue, new Date().toISOString());
    await handler(jobs as PgBoss.Job<Record<string, unknown>>[]);
  });
  attachedWorkers.add(queue);
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
  if (!queuesInitialized) {
    logger.error({ queue, name }, 'Job enqueue refused — queues not initialized');
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

export type QueueOpsRow = {
  name: string;
  exists: boolean;
  workerAttached: boolean;
  workerActive: boolean;
  pendingJobs: number;
  activeJobs: number;
  failedJobs: number;
  lastProcessedAt: string | null;
  lastFetchedOn: string | null;
  lastJobEndedOn: string | null;
  lastError: string | null;
};

export async function getQueueOpsSnapshot(): Promise<{
  workersEnabled: boolean;
  queuesInitialized: boolean;
  queues: QueueOpsRow[];
}> {
  const env = getEnv();
  if (!env.ENABLE_WORKERS) {
    return {
      workersEnabled: false,
      queuesInitialized: false,
      queues: REQUIRED_QUEUE_NAMES.map((name) => ({
        name,
        exists: false,
        workerAttached: false,
        workerActive: false,
        pendingJobs: 0,
        activeJobs: 0,
        failedJobs: 0,
        lastProcessedAt: null,
        lastFetchedOn: null,
        lastJobEndedOn: null,
        lastError: null,
      })),
    };
  }

  const boss = await getBoss();
  if (!boss) {
    return {
      workersEnabled: true,
      queuesInitialized: false,
      queues: REQUIRED_QUEUE_NAMES.map((name) => ({
        name,
        exists: false,
        workerAttached: false,
        workerActive: false,
        pendingJobs: 0,
        activeJobs: 0,
        failedJobs: 0,
        lastProcessedAt: null,
        lastFetchedOn: null,
        lastJobEndedOn: null,
        lastError: null,
      })),
    };
  }

  const rows: QueueOpsRow[] = [];
  for (const name of REQUIRED_QUEUE_NAMES) {
    const q = await boss.getQueue(name).catch(() => null);
    const pending = q
      ? await boss.getQueueSize(name).catch(() => -1)
      : 0;
    const active = q
      ? await boss.getQueueSize(name, { before: 'completed' }).catch(() => -1)
      : 0;
    // getQueueSize before:'completed' includes created+retry+active; prefer SQL for precise splits
    let pendingJobs = typeof pending === 'number' ? pending : 0;
    let activeJobs = 0;
    let failedJobs = 0;
    try {
      const db = boss.getDb();
      const counts = await db.executeSql(
        `SELECT state::text AS state, count(*)::int AS n
         FROM pgboss.job
         WHERE name = $1
         GROUP BY state`,
        [name]
      );
      pendingJobs = 0;
      activeJobs = 0;
      failedJobs = 0;
      for (const row of counts.rows as Array<{ state: string; n: number }>) {
        if (row.state === 'created' || row.state === 'retry') pendingJobs += row.n;
        if (row.state === 'active') activeJobs += row.n;
        if (row.state === 'failed') failedJobs += row.n;
      }
    } catch {
      /* fall back to getQueueSize */
      activeJobs = typeof active === 'number' && active >= 0 ? Math.max(0, active - pendingJobs) : 0;
    }

    const wip = latestWip.find((w) => w.name === name && w.state === 'active');
    rows.push({
      name,
      exists: Boolean(q),
      workerAttached: attachedWorkers.has(name),
      workerActive: Boolean(wip),
      pendingJobs,
      activeJobs,
      failedJobs,
      lastProcessedAt: lastProcessedAt.get(name) ?? null,
      lastFetchedOn: wip?.lastFetchedOn ? new Date(wip.lastFetchedOn).toISOString() : null,
      lastJobEndedOn: wip?.lastJobEndedOn ? new Date(wip.lastJobEndedOn).toISOString() : null,
      lastError: wip?.lastError ? JSON.stringify(wip.lastError).slice(0, 500) : null,
    });
  }

  return {
    workersEnabled: true,
    queuesInitialized,
    queues: rows,
  };
}

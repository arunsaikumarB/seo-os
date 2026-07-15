/**
 * Enterprise Browser Runtime Manager — verify, auto-install, heal, persist status.
 * Ensures BEE never starts without a healthy Chromium runtime.
 */

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { logger } from '../../lib/logger.js';
import { getQueueOpsSnapshot, QUEUES } from '../../jobs/boss.js';
import { isPlaywrightAvailable, getSessionRuntime, disposeSessionRuntime } from './browser-runtime.service.js';

const STATUS_ID = 'global';
const requireFromHere = createRequire(import.meta.url);

export type BrowserRuntimeStatusRow = {
  id: string;
  playwright_installed: boolean;
  chromium_exists: boolean;
  executable_exists: boolean;
  launch_ok: boolean;
  browser_version: string | null;
  executable_path: string | null;
  playwright_version: string | null;
  cache_size_bytes: number | null;
  installed_browsers: string[];
  install_status: string;
  health: string;
  last_error: string | null;
  last_verification_at: string | null;
  install_progress: Record<string, unknown>;
  meta: Record<string, unknown>;
};

export type StartupHealthCheck = {
  key: string;
  label: string;
  ok: boolean;
  detail: string;
};

let installInFlight: Promise<boolean> | null = null;
let lastStatus: BrowserRuntimeStatusRow | null = null;

function playwrightVersion(): string | null {
  try {
    const pkg = requireFromHere('playwright/package.json') as { version?: string };
    return pkg.version ?? null;
  } catch {
    try {
      const pkg = requireFromHere('playwright-core/package.json') as { version?: string };
      return pkg.version ?? null;
    } catch {
      return null;
    }
  }
}

async function dirSizeBytes(root: string): Promise<number> {
  let total = 0;
  async function walk(dir: string) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else {
        try {
          const st = await fs.stat(p);
          total += st.size;
        } catch {
          /* skip */
        }
      }
    }
  }
  await walk(root);
  return total;
}

async function persistStatus(patch: Partial<BrowserRuntimeStatusRow> & Record<string, unknown>) {
  const row = {
    id: STATUS_ID,
    ...patch,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await getSupabaseAdmin()
    .from('browser_runtime_status')
    .upsert(row, { onConflict: 'id' })
    .select('*')
    .single();
  if (error) {
    logger.warn({ error }, 'browser_runtime_status upsert failed');
    lastStatus = {
      id: STATUS_ID,
      playwright_installed: Boolean(patch.playwright_installed),
      chromium_exists: Boolean(patch.chromium_exists),
      executable_exists: Boolean(patch.executable_exists),
      launch_ok: Boolean(patch.launch_ok),
      browser_version: (patch.browser_version as string) ?? null,
      executable_path: (patch.executable_path as string) ?? null,
      playwright_version: (patch.playwright_version as string) ?? null,
      cache_size_bytes: (patch.cache_size_bytes as number) ?? null,
      installed_browsers: (patch.installed_browsers as string[]) ?? [],
      install_status: String(patch.install_status ?? 'unknown'),
      health: String(patch.health ?? 'unknown'),
      last_error: (patch.last_error as string) ?? null,
      last_verification_at: (patch.last_verification_at as string) ?? null,
      install_progress: (patch.install_progress as Record<string, unknown>) ?? {},
      meta: (patch.meta as Record<string, unknown>) ?? {},
    };
    return lastStatus;
  }
  lastStatus = {
    ...(data as BrowserRuntimeStatusRow),
    installed_browsers: Array.isArray(data.installed_browsers)
      ? (data.installed_browsers as string[])
      : [],
    install_progress: (data.install_progress as Record<string, unknown>) ?? {},
    meta: (data.meta as Record<string, unknown>) ?? {},
  };
  return lastStatus;
}

export async function getBrowserRuntimeStatus(): Promise<BrowserRuntimeStatusRow> {
  if (lastStatus?.last_verification_at) return lastStatus;
  const { data } = await getSupabaseAdmin()
    .from('browser_runtime_status')
    .select('*')
    .eq('id', STATUS_ID)
    .maybeSingle();
  if (data) {
    lastStatus = {
      ...(data as BrowserRuntimeStatusRow),
      installed_browsers: Array.isArray(data.installed_browsers)
        ? (data.installed_browsers as string[])
        : [],
      install_progress: (data.install_progress as Record<string, unknown>) ?? {},
      meta: (data.meta as Record<string, unknown>) ?? {},
    };
    return lastStatus;
  }
  return verifyBrowserRuntime({ autoInstall: false });
}

/** Deep verification: package, executable path, launch probe. */
export async function verifyBrowserRuntime(
  opts: { autoInstall?: boolean; probeLaunch?: boolean } = {}
): Promise<BrowserRuntimeStatusRow> {
  const autoInstall = opts.autoInstall !== false;
  const probeLaunch = opts.probeLaunch !== false;
  const pwVersion = playwrightVersion();
  const packageOk = await isPlaywrightAvailable().catch(() => false);

  let executablePath: string | null = null;
  let browserVersion: string | null = null;
  let chromiumExists = false;
  let executableExists = false;
  let launchOk = false;
  let lastError: string | null = null;
  const installed: string[] = [];
  let cacheSize: number | null = null;

  try {
    const pw = await import('playwright');
    const chromePath = pw.chromium.executablePath();
    executablePath = chromePath;
    try {
      await fs.access(chromePath);
      executableExists = true;
      chromiumExists = true;
      installed.push('chromium');
    } catch {
      chromiumExists = false;
      executableExists = false;
      lastError = 'Browser Runtime Missing — Chromium executable not found';
    }

    const cacheRoot =
      process.env.PLAYWRIGHT_BROWSERS_PATH ||
      path.join(process.env.LOCALAPPDATA || process.env.HOME || '', 'ms-playwright');
    if (cacheRoot) {
      cacheSize = await dirSizeBytes(cacheRoot).catch(() => null);
    }

    if (executableExists && probeLaunch) {
      try {
        const browser = await pw.chromium.launch({ headless: true, timeout: 45_000 });
        browserVersion = browser.version();
        await browser.close();
        launchOk = true;
        lastError = null;
      } catch (err) {
        launchOk = false;
        lastError = friendlyRuntimeError(err);
        logger.warn({ err: lastError }, 'Browser launch probe failed');
      }
    } else if (executableExists) {
      launchOk = true;
    }
  } catch (err) {
    lastError = friendlyRuntimeError(err);
    if (!packageOk) lastError = 'Browser Runtime Missing — Playwright package not available';
  }

  let health: string = 'missing';
  if (packageOk && chromiumExists && executableExists && launchOk) health = 'healthy';
  else if (packageOk && (chromiumExists || executableExists) && !launchOk) health = 'degraded';
  else health = 'missing';

  let status = await persistStatus({
    playwright_installed: packageOk,
    chromium_exists: chromiumExists,
    executable_exists: executableExists,
    launch_ok: launchOk,
    browser_version: browserVersion,
    executable_path: executablePath,
    playwright_version: pwVersion,
    cache_size_bytes: cacheSize,
    installed_browsers: installed,
    install_status: health === 'healthy' ? 'installed' : 'unknown',
    health,
    last_error: lastError,
    last_verification_at: new Date().toISOString(),
    meta: { verifiedBy: 'verifyBrowserRuntime' },
  });

  if (health !== 'healthy' && autoInstall) {
    logger.warn({ lastError }, 'Browser runtime unhealthy — attempting auto-install of Chromium');
    const ok = await installChromium((progress) => {
      void persistStatus({
        install_status: 'installing',
        health: 'installing',
        install_progress: progress,
      });
    });
    if (ok) {
      status = await verifyBrowserRuntime({ autoInstall: false, probeLaunch: true });
      if (status.health === 'healthy') {
        await resumeWaitingInfrastructureJobs().catch((err) =>
          logger.warn({ err }, 'Resume waiting_infrastructure jobs failed')
        );
      }
    } else {
      status = await persistStatus({
        install_status: 'failed',
        health: 'missing',
        last_error: 'Automatic Chromium install failed — administrator action required',
        last_verification_at: new Date().toISOString(),
      });
    }
  }

  return status;
}

export function friendlyRuntimeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  const lower = msg.toLowerCase();
  if (
    /executable doesn't exist|browserType\.launch|playwright.*install|chromium.*missing|could not find browser/i.test(
      lower
    )
  ) {
    return 'Browser Runtime Missing — Administrator Action Required. Suggested Fix: Install Chromium.';
  }
  if (/playwright unavailable|package not installed/i.test(lower)) {
    return 'Browser Runtime Missing — Playwright is not installed in this environment.';
  }
  if (/timeout|timed out/i.test(lower)) {
    return 'Browser Runtime Degraded — Chromium launch timed out.';
  }
  return `Browser Runtime Error — ${msg.slice(0, 240)}`;
}

export async function installChromium(
  onProgress?: (p: Record<string, unknown>) => void
): Promise<boolean> {
  if (installInFlight) return installInFlight;

  installInFlight = (async () => {
    await persistStatus({
      install_status: 'installing',
      health: 'installing',
      install_progress: { phase: 'starting', percent: 0 },
      last_error: null,
    });
    onProgress?.({ phase: 'starting', percent: 0 });

    return await new Promise<boolean>((resolve) => {
      const child = spawn(
        process.platform === 'win32' ? 'npx.cmd' : 'npx',
        ['playwright', 'install', 'chromium'],
        {
          cwd: process.cwd(),
          env: process.env,
          shell: process.platform === 'win32',
        }
      );

      let log = '';
      child.stdout?.on('data', (buf: Buffer) => {
        const line = buf.toString();
        log += line;
        const percentMatch = /(\d+)\s*%/.exec(line);
        const percent = percentMatch ? Number(percentMatch[1]) : undefined;
        onProgress?.({ phase: 'downloading', percent, line: line.trim().slice(0, 200) });
        void persistStatus({
          install_status: 'installing',
          health: 'installing',
          install_progress: {
            phase: 'downloading',
            percent: percent ?? null,
            line: line.trim().slice(0, 200),
          },
        });
      });
      child.stderr?.on('data', (buf: Buffer) => {
        log += buf.toString();
      });
      child.on('error', (err) => {
        logger.error({ err }, 'playwright install spawn failed');
        void persistStatus({
          install_status: 'failed',
          health: 'missing',
          last_error: friendlyRuntimeError(err),
          install_progress: { phase: 'failed' },
        });
        resolve(false);
      });
      child.on('close', (code) => {
        const ok = code === 0;
        logger.info({ code, logTail: log.slice(-500) }, 'playwright install chromium finished');
        void persistStatus({
          install_status: ok ? 'installed' : 'failed',
          health: ok ? 'degraded' : 'missing',
          last_error: ok ? null : 'Chromium install exited with errors',
          install_progress: { phase: ok ? 'done' : 'failed', exitCode: code },
        });
        resolve(ok);
      });
    });
  })().finally(() => {
    installInFlight = null;
  });

  return installInFlight;
}

export async function ensureBrowserRuntimeReady(): Promise<{
  ready: boolean;
  status: BrowserRuntimeStatusRow;
  message?: string;
}> {
  let status = await getBrowserRuntimeStatus();
  const stale =
    !status.last_verification_at ||
    Date.now() - new Date(status.last_verification_at).getTime() > 5 * 60_000;
  if (stale || status.health !== 'healthy') {
    status = await verifyBrowserRuntime({ autoInstall: true, probeLaunch: true });
  }
  if (status.health === 'healthy' && status.launch_ok) {
    return { ready: true, status };
  }
  return {
    ready: false,
    status,
    message:
      status.last_error ||
      'Browser Runtime Missing — Install Required. Start is disabled until Chromium is healthy.',
  };
}

export async function runBrowserDiagnostics(): Promise<{
  result: 'PASS' | 'FAIL';
  steps: Array<{ name: string; ok: boolean; detail: string; ms: number }>;
  reason?: string;
}> {
  const steps: Array<{ name: string; ok: boolean; detail: string; ms: number }> = [];
  const probeId = `diag-${Date.now()}`;
  const runtime = getSessionRuntime(probeId);
  const t0 = Date.now();

  try {
    const tLaunch = Date.now();
    await runtime.launch({ mode: 'headless', timeoutMs: 60_000 });
    steps.push({
      name: 'Launch Chromium',
      ok: true,
      detail: 'Chromium launched',
      ms: Date.now() - tLaunch,
    });

    const tNav = Date.now();
    const cap = await runtime.navigate('https://www.google.com', 30_000);
    steps.push({
      name: 'Open Google',
      ok: true,
      detail: `Loaded ${cap.url ?? 'https://www.google.com'}`,
      ms: Date.now() - tNav,
    });
    steps.push({
      name: 'Navigate',
      ok: Boolean(cap.url),
      detail: cap.title ? `Title: ${cap.title}` : 'Navigation succeeded',
      ms: 0,
    });

    const tClose = Date.now();
    await disposeSessionRuntime(probeId);
    steps.push({
      name: 'Close Browser',
      ok: true,
      detail: 'Browser closed cleanly',
      ms: Date.now() - tClose,
    });

    await verifyBrowserRuntime({ autoInstall: false, probeLaunch: false });
    return { result: 'PASS', steps };
  } catch (err) {
    const reason = friendlyRuntimeError(err);
    steps.push({
      name: 'Diagnostics',
      ok: false,
      detail: reason,
      ms: Date.now() - t0,
    });
    await disposeSessionRuntime(probeId).catch(() => undefined);
    await persistStatus({
      health: 'missing',
      launch_ok: false,
      last_error: reason,
      last_verification_at: new Date().toISOString(),
    });
    return { result: 'FAIL', steps, reason };
  }
}

export async function runStartupHealthChecks(): Promise<{
  ok: boolean;
  checks: StartupHealthCheck[];
  runtime: BrowserRuntimeStatusRow;
}> {
  const checks: StartupHealthCheck[] = [];

  const runtime = await verifyBrowserRuntime({ autoInstall: true, probeLaunch: true });
  checks.push({
    key: 'browser_runtime',
    label: 'Browser Runtime Check',
    ok: runtime.health === 'healthy',
    detail:
      runtime.health === 'healthy'
        ? `Healthy · Chromium ${runtime.browser_version ?? 'ok'}`
        : runtime.last_error || 'Browser Runtime Missing',
  });

  try {
    const snap = await getQueueOpsSnapshot();
    const pw = snap.queues.find((q) => q.name === QUEUES.PLAYWRIGHT);
    checks.push({
      key: 'queue',
      label: 'Queue Check',
      ok: Boolean(snap.queuesInitialized && pw?.exists),
      detail: pw ? `PLAYWRIGHT pending ${pw.pendingJobs}` : 'Queue not initialized',
    });
    checks.push({
      key: 'worker',
      label: 'Worker Check',
      ok: Boolean(snap.workersEnabled && snap.queuesInitialized),
      detail: snap.workersEnabled ? 'Workers enabled' : 'Workers disabled',
    });
    checks.push({
      key: 'redis',
      label: 'Redis Check',
      ok: Boolean(snap.queuesInitialized),
      detail: snap.queuesInitialized ? 'pg-boss ready' : 'pg-boss offline',
    });
  } catch (err) {
    checks.push({
      key: 'queue',
      label: 'Queue Check',
      ok: false,
      detail: err instanceof Error ? err.message : 'offline',
    });
    checks.push({ key: 'worker', label: 'Worker Check', ok: false, detail: 'offline' });
    checks.push({ key: 'redis', label: 'Redis Check', ok: false, detail: 'offline' });
  }

  try {
    const { error } = await getSupabaseAdmin().from('workspaces').select('id').limit(1);
    checks.push({
      key: 'database',
      label: 'Database Check',
      ok: !error,
      detail: error?.message ?? 'Connected',
    });
  } catch {
    checks.push({ key: 'database', label: 'Database Check', ok: false, detail: 'Unreachable' });
  }

  try {
    const { data } = await getSupabaseAdmin().storage.listBuckets();
    const has = (data ?? []).some((b) => b.name === 'browser-execution');
    checks.push({
      key: 'storage',
      label: 'Storage Check',
      ok: true,
      detail: has ? 'browser-execution bucket ready' : 'bucket optional / missing',
    });
  } catch {
    checks.push({ key: 'storage', label: 'Storage Check', ok: false, detail: 'Unreachable' });
  }

  checks.push({
    key: 'provider',
    label: 'Provider Check',
    ok: true,
    detail: 'Deferred to workspace provider health',
  });

  const requiredEnv = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
  const missingEnv = requiredEnv.filter((k) => !process.env[k]);
  checks.push({
    key: 'environment',
    label: 'Environment Check',
    ok: missingEnv.length === 0,
    detail: missingEnv.length ? `Missing ${missingEnv.join(', ')}` : 'Required env present',
  });

  const ok = checks.every((c) => c.ok || c.key === 'provider' || c.key === 'storage');
  logger.info(
    { ok, runtimeHealth: runtime.health, checks },
    'Startup health checks completed'
  );
  return { ok, checks, runtime };
}

export async function parkJobWaitingInfrastructure(
  workspaceId: string,
  jobId: string,
  message?: string
) {
  const msg =
    message ||
    'Browser Runtime Missing — Install Required. Job waiting for infrastructure.';
  const { mergeJobMetrics } = await import('./bee.service.js');
  await mergeJobMetrics(workspaceId, jobId, {
    failure: {
      failureCode: 'BROWSER_RUNTIME_MISSING',
      failureMessage: msg,
      failureTimestamp: new Date().toISOString(),
      suggestedFix: 'Install Chromium / wait for auto-install, then jobs resume automatically.',
    },
    waitingInfrastructure: true,
  });
  await getSupabaseAdmin()
    .from('execution_jobs')
    .update({
      status: 'waiting_infrastructure',
      error_code: 'BROWSER_RUNTIME_MISSING',
      error_message: 'Browser Runtime Missing',
      pause_reason: 'browser_runtime',
      finished_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId)
    .eq('workspace_id', workspaceId);

  await getSupabaseAdmin().from('execution_logs').insert({
    id: randomUUID(),
    workspace_id: workspaceId,
    job_id: jobId,
    level: 'warn',
    message: msg,
    data: { waiting_infrastructure: true },
  });
}

export async function resumeWaitingInfrastructureJobs(): Promise<number> {
  const { data: jobs } = await getSupabaseAdmin()
    .from('execution_jobs')
    .select('id, workspace_id')
    .eq('status', 'waiting_infrastructure')
    .is('deleted_at', null)
    .limit(50);

  if (!jobs?.length) return 0;

  const { startJob } = await import('./bee.service.js');
  let started = 0;
  for (const j of jobs) {
    try {
      await getSupabaseAdmin()
        .from('execution_jobs')
        .update({
          status: 'queued',
          error_code: null,
          error_message: null,
          pause_reason: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', j.id);
      await startJob(String(j.workspace_id), String(j.id));
      started++;
    } catch (err) {
      logger.warn({ err, jobId: j.id }, 'Could not resume waiting_infrastructure job');
    }
  }
  logger.info({ started, total: jobs.length }, 'Resumed jobs after browser runtime restore');
  return started;
}

/** Repair = reinstall chromium + re-verify */
export async function repairBrowserRuntime() {
  await installChromium();
  return verifyBrowserRuntime({ autoInstall: false, probeLaunch: true });
}

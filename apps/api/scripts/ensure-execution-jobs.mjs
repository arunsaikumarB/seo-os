/**
 * One-shot: ensure Ready → execution jobs for a workspace (service role).
 * Usage:
 *   $env:ENV_FILE="$env:TEMP\seo-os-api.env"
 *   node apps/api/scripts/ensure-execution-jobs.mjs
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv(p) {
  try {
    const raw = readFileSync(p, 'utf8');
    const env = {};
    for (const line of raw.split(/\r?\n/)) {
      const i = line.indexOf('=');
      if (i < 1) continue;
      env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
    return env;
  } catch {
    return {};
  }
}

const fileEnv = loadEnv(process.env.ENV_FILE || resolve(__dirname, '../.env'));
Object.assign(process.env, fileEnv);

const WORKSPACE_ID =
  process.env.VALIDATION_WORKSPACE_ID || 'db9f83a2-f1db-4a9a-9afb-348402fd4d84';
const startImmediately = process.env.START_IMMEDIATELY !== '0';

async function main() {
  // Build must exist; import compiled service
  const modPath = resolve(
    __dirname,
    '../dist/modules/browser-execution/execution-pipeline.service.js'
  );
  const { ensureExecutionJobsForReady, getExecutionDiagnostics } = await import(
    pathToFileURL(modPath).href
  );

  console.log('=== ensureExecutionJobsForReady ===', { WORKSPACE_ID, startImmediately });
  const before = await getExecutionDiagnostics(WORKSPACE_ID);
  console.log('before', {
    ready: before.readyItems,
    jobs: before.executionJobsCreated,
    missing: before.missingExecutionJobs,
    broken: before.pipelineBroken,
    rootCause: before.rootCause,
  });

  const result = await ensureExecutionJobsForReady({
    workspaceId: WORKSPACE_ID,
    startImmediately,
  });

  console.log('ensureSummary', result.ensureSummary);
  console.log('after', {
    ready: result.diagnostics.readyItems,
    jobs: result.diagnostics.executionJobsCreated,
    missing: result.diagnostics.missingExecutionJobs,
    broken: result.diagnostics.pipelineBroken,
    queued: result.diagnostics.jobsQueued,
    running: result.diagnostics.jobsRunning,
    skipped: result.diagnostics.jobsSkipped,
    failed: result.diagnostics.jobsFailed,
    rootCause: result.diagnostics.rootCause,
  });
  console.log(
    'items',
    result.diagnostics.items.map((i) => ({
      website: i.website,
      job: i.executionJobExists,
      status: i.executionJobStatus,
      start: i.startApiCalled,
      startRes: i.startApiResponse,
      why: i.whyNoJob || i.verifiedBlocker || i.creationError,
    }))
  );

  if (result.diagnostics.pipelineBroken || result.diagnostics.missingExecutionJobs > 0) {
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error('ENSURE_FAILED', e);
  process.exit(1);
});

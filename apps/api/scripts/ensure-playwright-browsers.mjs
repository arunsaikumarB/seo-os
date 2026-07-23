/**
 * Railway / container boot: ensure Chromium exists for the Playwright version
 * in node_modules, and that PLAYWRIGHT_BROWSERS_PATH resolves to a launchable binary.
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { accessSync, constants, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '../../..');
const require = createRequire(path.join(appRoot, 'package.json'));

process.env.PLAYWRIGHT_CHROMIUM_USE_HEADLESS_SHELL ??= '0';
process.env.PLAYWRIGHT_BROWSERS_PATH ??= '/ms-playwright';

function playwrightCli() {
  const candidates = [
    path.join(appRoot, 'node_modules', 'playwright', 'cli.js'),
    path.join(appRoot, 'apps', 'api', 'node_modules', 'playwright', 'cli.js'),
  ];
  for (const bin of candidates) {
    if (existsSync(bin)) return bin;
  }
  return null;
}

function chromiumPresent() {
  try {
    const pw = require('playwright');
    const exe = pw.chromium.executablePath();
    accessSync(exe, constants.F_OK);
    return {
      ok: true,
      exe,
      browsersPath: process.env.PLAYWRIGHT_BROWSERS_PATH ?? null,
    };
  } catch (err) {
    return {
      ok: false,
      err: err instanceof Error ? err.message : String(err),
      browsersPath: process.env.PLAYWRIGHT_BROWSERS_PATH ?? null,
    };
  }
}

function probeLaunch(exe) {
  try {
    const pw = require('playwright');
    // sync-ish via spawn of a tiny script — avoid top-level await in CJS require path
    const script = `
      const pw = require('playwright');
      pw.chromium.launch({
        headless: true,
        executablePath: ${JSON.stringify(exe)},
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
        timeout: 60000
      }).then(b => b.close()).then(() => process.exit(0)).catch(e => {
        console.error(e && e.message ? e.message : e);
        process.exit(1);
      });
    `;
    const r = spawnSync(process.execPath, ['-e', script], {
      cwd: appRoot,
      env: process.env,
      encoding: 'utf8',
      timeout: 90_000,
    });
    if (r.status === 0) return { ok: true };
    return {
      ok: false,
      err: (r.stderr || r.stdout || `exit ${r.status}`).toString().slice(0, 500),
    };
  } catch (err) {
    return { ok: false, err: err instanceof Error ? err.message : String(err) };
  }
}

function install() {
  const cli = playwrightCli();
  const args = cli
    ? [cli, 'install', '--with-deps', 'chromium']
    : ['playwright', 'install', '--with-deps', 'chromium'];
  const cmd = cli ? process.execPath : process.platform === 'win32' ? 'npx.cmd' : 'npx';
  console.log(
    `[ensure-playwright] PLAYWRIGHT_BROWSERS_PATH=${process.env.PLAYWRIGHT_BROWSERS_PATH}`
  );
  console.log(`[ensure-playwright] installing Chromium via ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, {
    cwd: appRoot,
    env: process.env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  return r.status === 0;
}

const before = chromiumPresent();
if (!before.ok) {
  console.warn(`[ensure-playwright] Chromium missing: ${before.err ?? 'unknown'}`);
  if (!install()) {
    console.error('[ensure-playwright] install failed');
    process.exit(1);
  }
}

const after = chromiumPresent();
if (!after.ok) {
  console.error(`[ensure-playwright] still missing after install: ${after.err}`);
  process.exit(1);
}

console.log(
  `[ensure-playwright] Chromium binary OK: ${after.exe} (PLAYWRIGHT_BROWSERS_PATH=${after.browsersPath})`
);

const launch = probeLaunch(after.exe);
if (!launch.ok) {
  console.error(`[ensure-playwright] launch probe failed: ${launch.err}`);
  // One more install attempt (deps) then re-probe
  if (!install()) {
    process.exit(1);
  }
  const launch2 = probeLaunch(after.exe);
  if (!launch2.ok) {
    console.error(`[ensure-playwright] launch still failing: ${launch2.err}`);
    process.exit(1);
  }
}

console.log('[ensure-playwright] Chromium launch OK');
process.exit(0);

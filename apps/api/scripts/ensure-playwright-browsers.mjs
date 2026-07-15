/**
 * Railway / container boot: ensure Chromium (+ headless shell) exist for the
 * Playwright version in node_modules before the API starts.
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

function playwrightCli() {
  const bin = path.join(appRoot, 'node_modules', 'playwright', 'cli.js');
  if (existsSync(bin)) return bin;
  const local = path.join(appRoot, 'node_modules', '.bin', 'playwright');
  if (existsSync(local)) return local;
  return null;
}

function chromiumPresent() {
  try {
    const pw = require('playwright');
    const exe = pw.chromium.executablePath();
    accessSync(exe, constants.F_OK);
    return { ok: true, exe };
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
if (before.ok) {
  console.log(`[ensure-playwright] Chromium OK: ${before.exe}`);
  process.exit(0);
}

console.warn(`[ensure-playwright] Chromium missing: ${before.err ?? 'unknown'}`);
if (!install()) {
  console.error('[ensure-playwright] install failed');
  process.exit(1);
}

const after = chromiumPresent();
if (!after.ok) {
  console.error(`[ensure-playwright] still missing after install: ${after.err}`);
  process.exit(1);
}
console.log(`[ensure-playwright] Chromium ready: ${after.exe}`);

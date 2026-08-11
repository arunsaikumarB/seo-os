import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * DD3 / company: `.env` at repo root (next to package.json).
 * Local monorepo: `apps/api/.env` still supported (loads last, wins).
 *
 * IMPORTANT: this module runs on import (side effect) so env is ready
 * before logger/config parse process.env. Keep `import './load-env.js'`
 * as the first import in index.ts.
 */
function resolveApiRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const base = here.replace(/[/\\](dist|src)$/, '');
  return base === here ? resolve(here, '..') : base;
}

export function loadApiEnvFiles(): string[] {
  const apiRoot = resolveApiRoot();
  const repoRoot = resolve(apiRoot, '../..');
  const cwd = process.cwd();

  const candidates = [
    process.env.ENV_FILE,
    resolve(repoRoot, '.env'),
    resolve(cwd, '.env'),
    resolve(cwd, '../.env'),
    resolve(apiRoot, '.env'),
  ].filter((p): p is string => Boolean(p));

  const loaded: string[] = [];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    // Later files override earlier (apps/api/.env wins over root when both exist)
    loadDotenv({ path, override: true });
    loaded.push(path);
  }
  return loaded;
}

const loadedPaths = loadApiEnvFiles();
if (process.env.DEBUG_ENV_LOAD === 'true') {
  console.error('[api] dotenv loaded from:', loadedPaths.length ? loadedPaths.join(', ') : '(none)');
}

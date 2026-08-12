import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Loads the file named `.env` (not root.env).
 * Company/DD3: `.env` next to package.json (ba-backend root).
 * Local monorepo: `apps/api/.env` still supported.
 *
 * Shell/CI env vars that are already set are never overwritten by dotenv.
 * Keep `import './load-env.js'` as the first import in index.ts.
 */
function resolveApiRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const base = here.replace(/[/\\](dist|src)$/, '');
  return base === here ? resolve(here, '..') : base;
}

/** Walk up from start, collect dirs that contain a file named `.env`. */
function findEnvDirs(start: string, maxUp = 6): string[] {
  const out: string[] = [];
  let dir = resolve(start);
  for (let i = 0; i < maxUp; i++) {
    if (existsSync(resolve(dir, '.env'))) out.push(dir);
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return out;
}

export function loadApiEnvFiles(): string[] {
  // Snapshot non-empty process.env before dotenv (shell/CI wins)
  const preexisting: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string' && value.length > 0) preexisting[key] = value;
  }

  const apiRoot = resolveApiRoot();
  const cwd = process.cwd();
  const explicit = process.env.ENV_FILE?.trim();

  const dirs = [...findEnvDirs(cwd), ...findEnvDirs(apiRoot)];
  const uniqueDirs = [...new Set(dirs.map((d) => resolve(d)))];
  // Shorter path first (repo root), then apps/api — local apps/api wins unless shell locked
  uniqueDirs.sort((a, b) => a.length - b.length);

  const loaded: string[] = [];
  if (explicit && existsSync(explicit)) {
    loadDotenv({ path: explicit, override: true });
    loaded.push(explicit);
  }

  for (const dir of uniqueDirs) {
    const path = resolve(dir, '.env');
    if (!existsSync(path) || loaded.includes(path)) continue;
    loadDotenv({ path, override: true });
    loaded.push(path);
  }

  // Restore anything that was set before dotenv ran
  for (const [key, value] of Object.entries(preexisting)) {
    process.env[key] = value;
  }

  return loaded;
}

const loadedPaths = loadApiEnvFiles();
console.error(
  '[api] dotenv loaded from:',
  loadedPaths.length ? loadedPaths.join(', ') : '(none — create a file named .env next to package.json)'
);
if (process.env.CORS_ORIGIN) {
  console.error('[api] CORS_ORIGIN=', process.env.CORS_ORIGIN);
}
if (process.env.DATABASE_URL) {
  try {
    const u = new URL(process.env.DATABASE_URL);
    console.error('[api] DATABASE_URL host=', `${u.hostname}:${u.port || '5432'}${u.pathname}`);
  } catch {
    console.error('[api] DATABASE_URL=(set)');
  }
}

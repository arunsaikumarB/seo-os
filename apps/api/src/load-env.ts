import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Loads the file named `.env` (not root.env).
 * Company/DD3: `.env` next to package.json (repo root of ba-backend).
 * Local monorepo: also supports `apps/api/.env` (loads last, wins).
 *
 * IMPORTANT: side-effect on import — keep `import './load-env.js'` first in index.ts.
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
  const apiRoot = resolveApiRoot();
  const cwd = process.cwd();

  // Explicit path wins if set (optional escape hatch)
  const explicit = process.env.ENV_FILE?.trim();
  const dirs = [
    ...(explicit ? [] : []),
    // Prefer company `.env` next to ba-backend package.json, then apps/api/.env
    ...findEnvDirs(cwd),
    ...findEnvDirs(apiRoot),
  ];

  // De-dupe, load furthest (repo) first then closer (apps/api) so local overrides company
  const uniqueDirs = [...new Set(dirs.map((d) => resolve(d)))];
  // Sort by path length ascending so shorter/parent paths load first
  uniqueDirs.sort((a, b) => a.length - b.length);

  const loaded: string[] = [];
  if (explicit && existsSync(explicit)) {
    loadDotenv({ path: explicit, override: true });
    loaded.push(explicit);
  }

  for (const dir of uniqueDirs) {
    const path = resolve(dir, '.env');
    if (!existsSync(path)) continue;
    if (loaded.includes(path)) continue;
    loadDotenv({ path, override: true });
    loaded.push(path);
  }

  return loaded;
}

const loadedPaths = loadApiEnvFiles();
// Always print which `.env` file(s) were used (paths only — no secret values)
console.error(
  '[api] dotenv loaded from:',
  loadedPaths.length ? loadedPaths.join(', ') : '(none — create a file named .env next to package.json)'
);
if (process.env.CORS_ORIGIN) {
  console.error('[api] CORS_ORIGIN=', process.env.CORS_ORIGIN);
}

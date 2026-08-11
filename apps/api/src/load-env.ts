import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * DD3 / company layout: `.env` at repo (slice) root.
 * Local monorepo: `apps/api/.env` still wins when present.
 *
 * Load order: root first, then apps/api/.env (override).
 */
export function loadApiEnvFiles(): void {
  const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const repoRoot = resolve(apiRoot, '../..');

  const rootEnv = resolve(repoRoot, '.env');
  const appEnv = resolve(apiRoot, '.env');

  if (existsSync(rootEnv)) {
    loadDotenv({ path: rootEnv });
  }
  if (existsSync(appEnv)) {
    loadDotenv({ path: appEnv, override: true });
  }
}

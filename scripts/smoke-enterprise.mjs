// Enterprise production smoke — file contract
// Run: node scripts/smoke-enterprise.mjs

import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const required = [
  'apps/api/src/index.ts',
  'apps/api/src/routes/health.ts',
  'apps/api/src/lib/circuit-breaker.ts',
  'apps/api/src/lib/sentry.ts',
  'apps/web/src/components/error-boundary.tsx',
  'apps/web/src/pages/diagnostics.tsx',
  'docs/ENTERPRISE_PRODUCTION.md',
  'docs/OPERATIONS_MANUAL.md',
];

let failed = 0;
for (const rel of required) {
  const ok = existsSync(resolve(root, rel));
  console.log(ok ? 'ok ' : 'MISSING ', rel);
  if (!ok) failed += 1;
}

if (failed) {
  console.error(`Enterprise smoke failed: ${failed} missing file(s)`);
  process.exit(1);
}
console.log('Enterprise smoke contract passed');

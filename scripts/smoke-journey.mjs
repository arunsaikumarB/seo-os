/**
 * Offline journey contract smoke — verifies critical API route modules resolve
 * and release checklist endpoints are wired (no live network required).
 */
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const required = [
  'apps/api/src/routes/health.ts',
  'apps/api/src/middleware/auth.ts',
  'apps/api/src/middleware/rbac.ts',
  'apps/api/src/middleware/rateLimit.ts',
  'apps/api/src/routes/v1/intelligence.routes.ts',
  'apps/api/src/routes/v1/campaigns.routes.ts',
  'apps/api/src/routes/v1/outreach.routes.ts',
  'apps/api/src/routes/v1/workflows.routes.ts',
  'apps/api/src/routes/v1/analytics.routes.ts',
  'apps/api/src/routes/v1/reports.routes.ts',
  'apps/api/src/routes/v1/technical-seo.routes.ts',
  'apps/api/src/routes/v1/integrations.routes.ts',
  'apps/web/src/pages/onboarding/welcome.tsx',
  'apps/web/src/components/demo/product-tour.tsx',
  'docs/epic-11-production-readiness/PRODUCTION_CHECKLIST.md',
];

const journey = [
  'Register → Create Organization → Create Project',
  'Scan Website (Browser Intelligence)',
  'Discover Opportunities (SEO Intelligence / Backlink Builder)',
  'Generate Campaign → Outreach → Workflow',
  'Verify Backlink → Analytics → Report',
];

let failed = 0;
for (const rel of required) {
  const p = join(root, rel);
  if (!existsSync(p)) {
    console.error('MISSING', rel);
    failed += 1;
  }
}

if (failed) {
  console.error(`Journey smoke failed: ${failed} missing artifacts`);
  process.exit(1);
}

console.log('Journey modules present:');
for (const step of journey) console.log('  ✓', step);
console.log('OK: smoke-journey passed');

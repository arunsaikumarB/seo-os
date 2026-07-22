#!/usr/bin/env node
/**
 * Backfill Campaign State Manager lifecycle for a workspace.
 * Usage: node apps/api/scripts/backfill-campaign-state.mjs <workspaceId>
 *
 * Writes a migration report JSON next to this script.
 */
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceId = process.argv[2];
if (!workspaceId) {
  console.error('Usage: node backfill-campaign-state.mjs <workspaceId>');
  process.exit(1);
}

const apiBase = process.env.API_BASE_URL || process.env.VITE_API_URL || 'http://localhost:3001';
const token = process.env.SEO_OS_TOKEN || process.env.AUTH_TOKEN;

if (!token) {
  console.error('Set SEO_OS_TOKEN (Bearer JWT) to call POST .../campaign-state/backfill');
  process.exit(1);
}

const url = `${apiBase.replace(/\/$/, '')}/v1/projects/${workspaceId}/backlink-builder/campaign-state/backfill`;
const res = await fetch(url, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: '{}',
});

const body = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error('Backfill failed', res.status, body);
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(
  __dirname,
  `campaign-state-migration-report-${workspaceId.slice(0, 8)}.json`
);
writeFileSync(outPath, JSON.stringify(body.data ?? body, null, 2));
console.log('Backfill OK');
console.log('Items:', body.data?.itemCount);
console.log('Conflicts/notes:', body.data?.report?.length ?? 0);
console.log('Report:', outPath);
console.log('Counts:', JSON.stringify(body.data?.counts, null, 2));

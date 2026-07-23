/**
 * Export open assisted_fixture_reports into packages/backlink-builder/fixtures/assisted-manual/.
 * Usage (from repo root, with apps/api/.env loaded):
 *   node apps/api/scripts/export-assisted-fixture-reports.mjs
 * Optional: REPORT_ID=<uuid> to export one; --accept marks status=accepted after write.
 */
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv(p) {
  try {
    const raw = readFileSync(p, 'utf8');
    const env = {};
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m) continue;
      env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
    return env;
  } catch {
    return {};
  }
}

const fileEnv = {
  ...loadEnv(resolve(__dirname, '../.env')),
  ...loadEnv(resolve(__dirname, '../../../.env')),
};
const env = { ...fileEnv, ...process.env };

const url = env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const accept = process.argv.includes('--accept');
const reportId = env.REPORT_ID || null;
const fixtureRoot = resolve(
  __dirname,
  '../../../packages/backlink-builder/fixtures/assisted-manual'
);

const sb = createClient(url, key, { auth: { persistSession: false } });

let q = sb
  .from('assisted_fixture_reports')
  .select('id, domain, entry_url, html, fixture_draft, status, note')
  .eq('status', 'open')
  .order('created_at', { ascending: true });
if (reportId) q = q.eq('id', reportId);

const { data: rows, error } = await q;
if (error) {
  console.error(error.message);
  process.exit(1);
}
if (!rows?.length) {
  console.log('No open fixture reports.');
  process.exit(0);
}

const manifestPath = join(fixtureRoot, 'manifest.json');
const manifest = existsSync(manifestPath)
  ? JSON.parse(readFileSync(manifestPath, 'utf8'))
  : { version: 1, phase: 8, description: '', fixtures: [] };

for (const row of rows) {
  const draft = row.fixture_draft ?? {};
  const id =
    String(draft.id || row.domain || row.id)
      .replace(/[^a-z0-9-]/gi, '-')
      .toLowerCase()
      .slice(0, 64) || String(row.id).slice(0, 8);
  const dir = join(fixtureRoot, id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'page.html'), row.html ?? '', 'utf8');
  const expected = {
    id,
    domain: draft.domain ?? row.domain,
    entryUrl: draft.entryUrl ?? row.entry_url,
    gate: draft.gate ?? 'none',
    bucket: draft.bucket ?? 'check_fields',
    fields: Array.isArray(draft.fields) ? draft.fields : [],
    notes: draft.notes ?? row.note ?? 'Exported from assisted_fixture_reports',
  };
  writeFileSync(join(dir, 'expected.json'), `${JSON.stringify(expected, null, 2)}\n`, 'utf8');
  if (!manifest.fixtures.includes(id)) manifest.fixtures.push(id);
  console.log(`Wrote fixtures/assisted-manual/${id}/`);

  if (accept) {
    const { error: upErr } = await sb
      .from('assisted_fixture_reports')
      .update({ status: 'accepted', updated_at: new Date().toISOString() })
      .eq('id', row.id);
    if (upErr) console.warn(`Could not mark ${row.id} accepted:`, upErr.message);
    else console.log(`Marked ${row.id} accepted`);
  }
}

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log('Updated manifest.json');
console.log('Next: review expected.json roles, then run vitest in packages/backlink-builder');

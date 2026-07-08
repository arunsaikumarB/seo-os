/**
 * Staging smoke test — GET /health and /ready
 * Usage: STAGING_API_URL=https://staging-api.example.com node scripts/smoke-staging.mjs
 */
const baseUrl = process.env.STAGING_API_URL?.replace(/\/$/, '');

if (!baseUrl) {
  console.error('STAGING_API_URL is required');
  process.exit(1);
}

async function check(path, expectOk = true) {
  const url = `${baseUrl}${path}`;
  const res = await fetch(url);
  const body = await res.text();
  console.log(`${path} → ${res.status} ${body.slice(0, 120)}`);
  if (expectOk && !res.ok) {
    throw new Error(`${path} failed with ${res.status}`);
  }
  return res;
}

async function main() {
  console.log(`Staging smoke: ${baseUrl}\n`);
  await check('/health');
  await check('/ready', false); // ready may be 503 without DB — log only
  console.log('\n✓ Staging smoke complete (/health OK)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

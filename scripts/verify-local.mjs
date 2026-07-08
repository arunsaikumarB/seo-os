/**
 * Sprint 0 local verification — lint, format, typecheck, build, API health.
 */
import { execSync } from 'node:child_process';

function run(command) {
  execSync(command, { stdio: 'inherit' });
}

async function main() {
  console.log('\n=== Sprint 0 Local Verification ===\n');
  run('npm run lint');
  run('npm run format:check');
  run('npm run typecheck');
  run('npm run build');
  run('node scripts/smoke-local-health.mjs');
  console.log('\n=== All Sprint 0 local checks passed ===\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

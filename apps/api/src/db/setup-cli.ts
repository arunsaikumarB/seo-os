/**
 * CLI: create company tables via Database.ts (no pgvector).
 *   npm run db:setup
 *
 * Creates auth/org tables AND import → assisted-manual pipeline tables.
 */
import '../load-env.js';
import { Database } from './Database.js';

try {
  const result = await Database.ensureTables();
  console.log('[db:setup] ok');
  console.log('[db:setup] pipeline tables:', result.tables.join(', '));
  console.log(
    `[db:setup] migrations applied=${result.migrations.applied} skipped=${result.migrations.skipped}`
  );
  process.exit(0);
} catch (err) {
  console.error('[db:setup] FAILED:', err instanceof Error ? err.message : err);
  process.exit(1);
}

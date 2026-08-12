/**
 * CLI: create company tables via Database.ts (no pgvector).
 *   npm run db:setup
 */
import '../load-env.js';
import { Database } from './Database.js';

const result = await Database.ensureTables();
console.log('[db:setup] ok — tables:', result.tables.join(', '));
process.exit(0);

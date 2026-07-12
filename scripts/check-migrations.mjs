/**
 * Fail CI if migration filenames are not strictly increasing numeric prefixes.
 */
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations');
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

const nums = files.map((f) => {
  const m = f.match(/^(\d+)_/);
  if (!m) throw new Error(`Migration missing numeric prefix: ${f}`);
  return Number(m[1]);
});

for (let i = 1; i < nums.length; i++) {
  const curr = nums[i];
  const prev = nums[i - 1];
  if (curr <= prev) {
    console.error('Non-increasing migration sequence:', files[i - 1], '→', files[i]);
    process.exit(1);
  }
}

console.log(`OK: ${files.length} migrations, latest ${files[files.length - 1]}`);

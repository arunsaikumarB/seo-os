/**
 * CI/deploy guard: fail if Playwright is installed but Chromium is missing.
 */
import { createRequire } from 'node:module';
import { accessSync, constants } from 'node:fs';

const require = createRequire(import.meta.url);

let playwright;
try {
  playwright = require('playwright');
} catch {
  console.error('FAIL: Playwright package is not installed.');
  process.exit(1);
}

const exe = playwright.chromium.executablePath();
try {
  accessSync(exe, constants.X_OK);
} catch {
  try {
    accessSync(exe, constants.F_OK);
  } catch {
    console.error(
      `FAIL: Playwright is installed but Chromium is missing.\nExpected executable: ${exe}\nRun: npx playwright install chromium`
    );
    process.exit(1);
  }
}

console.log(`OK: Playwright Chromium present at ${exe}`);

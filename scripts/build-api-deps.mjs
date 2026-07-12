/**
 * Build workspace packages required by @seo-os/api before compiling the API.
 */
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const dependencyPackages = [
  '@seo-os/shared',
  '@seo-os/agent-contracts',
  '@seo-os/providers',
  '@seo-os/ai-runtime',
  '@seo-os/knowledge-engine',
  '@seo-os/seo-intelligence',
  '@seo-os/campaign-engine',
  '@seo-os/backlink-builder',
  '@seo-os/outreach-engine',
  '@seo-os/workflow-engine',
  '@seo-os/analytics-engine',
];

const filters = dependencyPackages.map((pkg) => `--filter=${pkg}`).join(' ');

execSync(`npx turbo run build ${filters}`, { stdio: 'inherit', cwd: root });

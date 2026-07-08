import type { ApiEnv } from '@seo-os/shared';
import { parseApiEnv } from '@seo-os/shared';

let cached: ApiEnv | null = null;

export function getEnv(): ApiEnv {
  if (!cached) {
    cached = parseApiEnv(process.env);
  }
  return cached;
}

/** Per-stage timeouts for BEE (milliseconds). Phase 4 defaults — never stall the queue. */

import { BEE_RELIABILITY } from './bee-config.js';

export const BEE_STAGE_TIMEOUTS = {
  launch: BEE_RELIABILITY.STAGE_TIMEOUTS.launch,
  open: BEE_RELIABILITY.STAGE_TIMEOUTS.open,
  navigate: BEE_RELIABILITY.STAGE_TIMEOUTS.navigate,
  find_form: BEE_RELIABILITY.STAGE_TIMEOUTS.find_form,
  fill: BEE_RELIABILITY.STAGE_TIMEOUTS.fill,
  upload: BEE_RELIABILITY.STAGE_TIMEOUTS.upload,
  submit: BEE_RELIABILITY.STAGE_TIMEOUTS.submit,
  verify: BEE_RELIABILITY.STAGE_TIMEOUTS.verify,
} as const;

export type BeeStageName = keyof typeof BEE_STAGE_TIMEOUTS;

export async function withStageTimeout<T>(
  stage: BeeStageName,
  fn: () => Promise<T>,
  opts?: { retries?: number }
): Promise<T> {
  const ms = BEE_STAGE_TIMEOUTS[stage] ?? BEE_RELIABILITY.STAGE_TIMEOUTS.open;
  const retries = opts?.retries ?? 1;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await Promise.race([
        fn(),
        new Promise<never>((_, reject) => {
          const t = setTimeout(() => {
            reject(
              Object.assign(new Error(`Stage timeout after ${ms}ms: ${stage}`), {
                code: 'NAVIGATION_TIMEOUT',
                failureCode: 'NAVIGATION_TIMEOUT',
                temporary: true,
                stage,
                attempt,
              })
            );
          }, ms);
          t.unref?.();
        }),
      ]);
    } catch (err) {
      lastErr = err;
      if (attempt >= retries) break;
    }
  }
  throw lastErr;
}

/**
 * Map Playwright / network errors into fail-fast codes.
 * CAPTCHA / Cloudflare / anti-bot → NOT retryable (Waiting Human only).
 */
export function classifyNavigationFailure(err: unknown): {
  code: string;
  retryable: boolean;
  message: string;
  waitingHuman?: boolean;
} {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  const lower = msg.toLowerCase();
  if (/cloudflare|attention required|cf-browser|just a moment|anti-?bot|challenge-platform/i.test(lower))
    return {
      code: 'CLOUDFLARE_ANTIBOT',
      retryable: false,
      waitingHuman: true,
      message: 'Cloudflare / anti-bot challenge — human required',
    };
  if (/captcha|recaptcha|hcaptcha/i.test(lower))
    return {
      code: 'CAPTCHA_DETECTED',
      retryable: false,
      waitingHuman: true,
      message: 'CAPTCHA detected — human required',
    };
  if (/err_name_not_resolved|getaddrinfo|dns/i.test(lower))
    return { code: 'DNS_FAILED', retryable: true, message: 'DNS failure' };
  if (/err_cert|ssl|certificate/i.test(lower))
    return { code: 'SSL_CERTIFICATE_ERROR', retryable: false, message: 'SSL certificate error' };
  if (/404|not found/i.test(lower))
    return { code: 'HTTP_404', retryable: false, message: 'Page not found (404)' };
  if (/500|502|503|bad gateway|internal server/i.test(lower))
    return { code: 'HTTP_5XX', retryable: true, message: 'Server error' };
  if (/robots?\.txt|access denied|forbidden|403/i.test(lower))
    return { code: 'HTTP_403_FORBIDDEN', retryable: false, message: 'Robot / access blocked' };
  if (/timeout|timed out|navigation.?timeout|net::err_timed_out/.test(lower))
    return { code: 'NAVIGATION_TIMEOUT', retryable: true, message: 'Navigation timed out' };
  if (/page crashed|target crashed|renderer.?crash|sigbus|oom|out of memory/i.test(lower))
    return {
      code: 'BROWSER_CLOSED',
      retryable: true,
      message: 'page crashed — likely OOM',
    };
  if (/net::err_/i.test(lower))
    return { code: 'NETWORK_FAILURE', retryable: true, message: 'Network error' };
  return { code: 'NAVIGATION_TIMEOUT', retryable: true, message: msg.slice(0, 200) };
}

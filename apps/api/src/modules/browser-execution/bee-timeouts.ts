/** Per-stage timeouts for BEE (milliseconds). Fail fast — never stall the queue. */

export const BEE_STAGE_TIMEOUTS = {
  launch: 20_000,
  open: 20_000,
  navigate: 20_000,
  find_form: 15_000,
  fill: 30_000,
  submit: 20_000,
} as const;

export type BeeStageName = keyof typeof BEE_STAGE_TIMEOUTS;

export async function withStageTimeout<T>(
  stage: BeeStageName,
  fn: () => Promise<T>,
  opts?: { retries?: number }
): Promise<T> {
  const ms = BEE_STAGE_TIMEOUTS[stage];
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

/** Map Playwright / network errors into fail-fast codes. */
export function classifyNavigationFailure(err: unknown): {
  code: string;
  retryable: boolean;
  message: string;
} {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  const lower = msg.toLowerCase();
  if (/err_name_not_resolved|getaddrinfo|dns/i.test(lower))
    return { code: 'DNS_FAILED', retryable: false, message: 'DNS failure' };
  if (/err_cert|ssl|certificate/i.test(lower))
    return { code: 'SSL_CERTIFICATE_ERROR', retryable: false, message: 'SSL certificate error' };
  if (/404|not found/i.test(lower))
    return { code: 'WEBSITE_UNREACHABLE', retryable: false, message: 'Page not found (404)' };
  if (/500|502|503|bad gateway|internal server/i.test(lower))
    return { code: 'WEBSITE_UNREACHABLE', retryable: true, message: 'Server error' };
  if (/cloudflare|attention required|cf-browser|just a moment/i.test(lower))
    return { code: 'WEBSITE_UNREACHABLE', retryable: true, message: 'Cloudflare / bot protection' };
  if (/robots?\.txt|access denied|forbidden|403/i.test(lower))
    return { code: 'WEBSITE_UNREACHABLE', retryable: false, message: 'Robot / access blocked' };
  if (/timeout|timed out/i.test(lower))
    return { code: 'NAVIGATION_TIMEOUT', retryable: true, message: 'Navigation timed out' };
  if (/net::err_/i.test(lower))
    return { code: 'WEBSITE_UNREACHABLE', retryable: true, message: 'Network error' };
  return { code: 'NAVIGATION_TIMEOUT', retryable: true, message: msg.slice(0, 200) };
}

/**
 * BEE failure taxonomy — real failure reasons, retry policy, suggested fixes.
 * Extends Browser Execution Engine without replacing it.
 */

export const EXECUTION_FAILURE_CODES = [
  'NAVIGATION_TIMEOUT',
  'WEBSITE_UNREACHABLE',
  'DNS_FAILED',
  'SSL_CERTIFICATE_ERROR',
  'HTTP_403_FORBIDDEN',
  'HTTP_429_RATE_LIMITED',
  'CAPTCHA_DETECTED',
  'LOGIN_REQUIRED',
  'EMAIL_VERIFICATION_REQUIRED',
  'PHONE_VERIFICATION_REQUIRED',
  'ACCOUNT_SUSPENDED',
  'REQUIRED_FIELD_MISSING',
  'SELECTOR_NOT_FOUND',
  'FORM_CHANGED',
  'SUBMIT_BUTTON_MISSING',
  'SUBMIT_FAILED',
  'PLAYWRIGHT_LAUNCH_FAILED',
  'BROWSER_RUNTIME_MISSING',
  'BROWSER_CLOSED',
  'WORKER_OFFLINE',
  'QUEUE_TIMEOUT',
  'INTERNAL_ERROR',
  'PROVIDER_OFFLINE',
  'CONNECTION_RESET',
  'HTTP_5XX',
  'NETWORK_FAILURE',
  'VALIDATION_FAILED',
  'UNKNOWN_EXCEPTION',
] as const;

export type ExecutionFailureCode = (typeof EXECUTION_FAILURE_CODES)[number];

export type FailureRetryClass = 'auto_retry' | 'needs_user' | 'permanent' | 'unknown';

export type ClassifiedFailure = {
  failureCode: ExecutionFailureCode;
  failureMessage: string;
  failureStep: string | null;
  failureTimestamp: string;
  retryClass: FailureRetryClass;
  label: string;
  suggestedFix: string;
};

const LABELS: Record<ExecutionFailureCode, string> = {
  NAVIGATION_TIMEOUT: 'Navigation Timeout',
  WEBSITE_UNREACHABLE: 'Website Unreachable',
  DNS_FAILED: 'DNS Failed',
  SSL_CERTIFICATE_ERROR: 'SSL Certificate Error',
  HTTP_403_FORBIDDEN: '403 Forbidden',
  HTTP_429_RATE_LIMITED: '429 Rate Limited',
  CAPTCHA_DETECTED: 'CAPTCHA Detected',
  LOGIN_REQUIRED: 'Login Required',
  EMAIL_VERIFICATION_REQUIRED: 'Email Verification Required',
  PHONE_VERIFICATION_REQUIRED: 'Phone Verification Required',
  ACCOUNT_SUSPENDED: 'Account Suspended',
  REQUIRED_FIELD_MISSING: 'Required Field Missing',
  SELECTOR_NOT_FOUND: 'Selector Not Found',
  FORM_CHANGED: 'Form Changed',
  SUBMIT_BUTTON_MISSING: 'Submit Button Missing',
  SUBMIT_FAILED: 'Submit Failed',
  PLAYWRIGHT_LAUNCH_FAILED: 'Playwright Launch Failed',
  BROWSER_RUNTIME_MISSING: 'Browser Runtime Missing',
  BROWSER_CLOSED: 'Browser Closed',
  WORKER_OFFLINE: 'Worker Offline',
  QUEUE_TIMEOUT: 'Queue Timeout',
  INTERNAL_ERROR: 'Internal Error',
  PROVIDER_OFFLINE: 'Provider Offline',
  CONNECTION_RESET: 'Connection Reset',
  HTTP_5XX: 'Server Error (5xx)',
  NETWORK_FAILURE: 'Network Failure',
  VALIDATION_FAILED: 'Validation Failed',
  UNKNOWN_EXCEPTION: 'Unknown Exception',
};

const RETRY_CLASS: Record<ExecutionFailureCode, FailureRetryClass> = {
  NAVIGATION_TIMEOUT: 'auto_retry',
  WEBSITE_UNREACHABLE: 'auto_retry',
  DNS_FAILED: 'auto_retry',
  SSL_CERTIFICATE_ERROR: 'permanent',
  HTTP_403_FORBIDDEN: 'permanent',
  HTTP_429_RATE_LIMITED: 'permanent',
  CAPTCHA_DETECTED: 'needs_user',
  LOGIN_REQUIRED: 'needs_user',
  EMAIL_VERIFICATION_REQUIRED: 'needs_user',
  PHONE_VERIFICATION_REQUIRED: 'needs_user',
  ACCOUNT_SUSPENDED: 'permanent',
  REQUIRED_FIELD_MISSING: 'permanent',
  SELECTOR_NOT_FOUND: 'permanent',
  FORM_CHANGED: 'permanent',
  SUBMIT_BUTTON_MISSING: 'permanent',
  SUBMIT_FAILED: 'permanent',
  PLAYWRIGHT_LAUNCH_FAILED: 'auto_retry',
  BROWSER_RUNTIME_MISSING: 'needs_user',
  BROWSER_CLOSED: 'auto_retry',
  WORKER_OFFLINE: 'auto_retry',
  QUEUE_TIMEOUT: 'auto_retry',
  INTERNAL_ERROR: 'auto_retry',
  PROVIDER_OFFLINE: 'auto_retry',
  CONNECTION_RESET: 'auto_retry',
  HTTP_5XX: 'auto_retry',
  NETWORK_FAILURE: 'auto_retry',
  VALIDATION_FAILED: 'permanent',
  UNKNOWN_EXCEPTION: 'unknown',
};

const FIXES: Record<ExecutionFailureCode, string> = {
  NAVIGATION_TIMEOUT: 'Retry automatically after a short wait. Check if the site is slow or blocking bots.',
  WEBSITE_UNREACHABLE: 'Site may be temporarily down. Auto-retry, then try again later if it persists.',
  DNS_FAILED: 'Temporary DNS issue. Auto-retry. If persistent, verify the domain spelling.',
  SSL_CERTIFICATE_ERROR: 'Certificate problem on the destination. Contact site admin or skip this website.',
  HTTP_403_FORBIDDEN: 'Access forbidden — do not retry. Review IP/bot blocks or credentials.',
  HTTP_429_RATE_LIMITED: 'Rate limited — do not hammer retries. Slow down submissions and try later.',
  CAPTCHA_DETECTED: 'Complete the CAPTCHA in the browser session. Resume will continue automatically when cleared.',
  LOGIN_REQUIRED: 'Sign in manually in the headed browser session, then resume.',
  EMAIL_VERIFICATION_REQUIRED: 'Complete email verification, then resume execution.',
  PHONE_VERIFICATION_REQUIRED: 'Complete phone/SMS verification, then resume.',
  ACCOUNT_SUSPENDED: 'Account is suspended. Resolve with the destination site before retrying.',
  REQUIRED_FIELD_MISSING: 'Generate missing content fields in Content Studio, then retry.',
  SELECTOR_NOT_FOUND: 'Form selectors changed. Run selector learning or update the form profile, then retry.',
  FORM_CHANGED: 'Destination form layout changed. Re-analyze the page and update field mapping.',
  SUBMIT_BUTTON_MISSING: 'Submit control not found. Re-scan the form or submit manually.',
  SUBMIT_FAILED: 'Submit did not complete. Inspect the screenshot and validation messages, then retry manually.',
  PLAYWRIGHT_LAUNCH_FAILED:
    'Browser failed to launch. Install Chromium (`npx playwright install chromium`) or use Repair Browser on the Browser Runtime page.',
  BROWSER_RUNTIME_MISSING:
    'Browser Runtime Missing — Administrator Action Required. Suggested Fix: Install Chromium. Jobs wait for infrastructure and resume automatically.',
  BROWSER_CLOSED: 'Browser closed unexpectedly. Auto-retry with a fresh session.',
  WORKER_OFFLINE: 'Execution worker is offline. Restore worker health, then retry.',
  QUEUE_TIMEOUT: 'Job waited too long in queue. Check worker capacity and retry.',
  INTERNAL_ERROR: 'Unexpected internal error. Auto-retry; if it persists, inspect worker logs.',
  PROVIDER_OFFLINE: 'A required provider is offline. Restore provider health, then retry.',
  CONNECTION_RESET: 'Connection reset by peer. Auto-retry with backoff.',
  HTTP_5XX: 'Destination returned a server error. Auto-retry after backoff.',
  NETWORK_FAILURE: 'Transient network failure. Auto-retry with backoff.',
  VALIDATION_FAILED: 'Form validation failed permanently for this payload. Fix field values before retrying.',
  UNKNOWN_EXCEPTION: 'Inspect stack trace and screenshots. Retry only if the error looks transient.',
};

/** Backoff seconds by 1-based attempt number after a failure (attempt 1 → 5s, 2 → 20s). */
export function retryBackoffSeconds(attemptAfterFailure: number): number | null {
  if (attemptAfterFailure === 1) return 5;
  if (attemptAfterFailure === 2) return 20;
  return null;
}

export function failureLabel(code: string | null | undefined): string {
  if (!code) return 'Unknown Exception';
  if (code in LABELS) return LABELS[code as ExecutionFailureCode];
  return code.replace(/_/g, ' ');
}

export function suggestedFixForCode(code: string | null | undefined): string {
  if (code && code in FIXES) return FIXES[code as ExecutionFailureCode];
  return FIXES.UNKNOWN_EXCEPTION;
}

export function isAutoRetryable(code: string | null | undefined): boolean {
  if (!code || !(code in RETRY_CLASS)) return false;
  return RETRY_CLASS[code as ExecutionFailureCode] === 'auto_retry';
}

export function classifyExecutionError(
  err: unknown,
  context: { step?: string | null; statusCode?: number | null } = {}
): ClassifiedFailure {
  const raw = err instanceof Error ? err.message : String(err ?? 'Unknown error');
  const msg = raw.toLowerCase();
  const name = err instanceof Error ? err.name.toLowerCase() : '';
  const stack = err instanceof Error ? (err.stack ?? '').toLowerCase() : '';
  const blob = `${name} ${msg} ${stack}`;

  let code: ExecutionFailureCode = 'UNKNOWN_EXCEPTION';

  if (context.statusCode === 403 || /\b403\b|forbidden/.test(blob)) code = 'HTTP_403_FORBIDDEN';
  else if (context.statusCode === 429 || /\b429\b|rate.?limit|too many requests/.test(blob))
    code = 'HTTP_429_RATE_LIMITED';
  else if (context.statusCode && context.statusCode >= 500) code = 'HTTP_5XX';
  else if (/captcha|recaptcha|hcaptcha|cf-challenge/.test(blob)) code = 'CAPTCHA_DETECTED';
  else if (/email.?verif|verify your email/.test(blob)) code = 'EMAIL_VERIFICATION_REQUIRED';
  else if (/phone.?verif|sms.?code|otp/.test(blob)) code = 'PHONE_VERIFICATION_REQUIRED';
  else if (/login required|sign in|unauthorized|401/.test(blob)) code = 'LOGIN_REQUIRED';
  else if (/suspended|banned|disabled account/.test(blob)) code = 'ACCOUNT_SUSPENDED';
  else if (/timeout|timed out|navigation.?timeout|net::err_timed_out/.test(blob))
    code = 'NAVIGATION_TIMEOUT';
  else if (/err_name_not_resolved|dns|getaddrinfo|enotfound/.test(blob)) code = 'DNS_FAILED';
  else if (/ssl|certificate|cert_|err_cert|tls/.test(blob)) code = 'SSL_CERTIFICATE_ERROR';
  else if (/err_connection_refused|econnrefused|unreachable|net::err_connection/.test(blob))
    code = 'WEBSITE_UNREACHABLE';
  else if (/econnreset|connection reset|socket hang up/.test(blob)) code = 'CONNECTION_RESET';
  else if (/network|net::err|fetch failed/.test(blob)) code = 'NETWORK_FAILURE';
  else if (/browser.?closed|target closed|session closed|context.?closed/.test(blob))
    code = 'BROWSER_CLOSED';
  else if (
    /executable doesn't exist|could not find browser|browser.*missing|playwright.*install chromium/.test(
      blob
    )
  )
    code = 'BROWSER_RUNTIME_MISSING';
  else if (/playwright|browserType\.launch|chromium/.test(blob)) code = 'PLAYWRIGHT_LAUNCH_FAILED';
  else if (/selector.?not.?found|waiting for selector|no element|strict mode violation/.test(blob))
    code = 'SELECTOR_NOT_FOUND';
  else if (/form changed|stale element|detached/.test(blob)) code = 'FORM_CHANGED';
  else if (/submit.?button|no submit/.test(blob)) code = 'SUBMIT_BUTTON_MISSING';
  else if (/required field|field missing|missing required/.test(blob)) code = 'REQUIRED_FIELD_MISSING';
  else if (/validation/.test(blob)) code = 'VALIDATION_FAILED';
  else if (/submit/.test(blob) && /fail|error/.test(blob)) code = 'SUBMIT_FAILED';
  else if (/worker.?offline|queue.?timeout/.test(blob)) code = 'WORKER_OFFLINE';
  else if (/provider.?offline/.test(blob)) code = 'PROVIDER_OFFLINE';
  else if (/internal/.test(blob)) code = 'INTERNAL_ERROR';

  return {
    failureCode: code,
    failureMessage: LABELS[code] === raw ? raw : `${LABELS[code]}: ${raw}`.slice(0, 500),
    failureStep: context.step ?? null,
    failureTimestamp: new Date().toISOString(),
    retryClass: RETRY_CLASS[code],
    label: LABELS[code],
    suggestedFix: FIXES[code],
  };
}

export function analyzeFailureAi(input: {
  failureCode?: string | null;
  failureMessage?: string | null;
  pauseReason?: string | null;
  status?: string | null;
}): { summary: string; suggestedAction: string; severity: 'info' | 'warning' | 'critical' } {
  const code = String(input.failureCode ?? '');
  const pause = String(input.pauseReason ?? '');
  const status = String(input.status ?? '');

  if (pause === 'captcha' || code === 'CAPTCHA_DETECTED' || status.includes('captcha')) {
    return {
      summary: 'CAPTCHA detected on the destination website.',
      suggestedAction: 'Complete CAPTCHA in the browser session. Resume continues automatically when cleared.',
      severity: 'warning',
    };
  }
  if (pause === 'login' || code === 'LOGIN_REQUIRED') {
    return {
      summary: 'Login is required before submission can continue.',
      suggestedAction: 'Authenticate manually in the headed browser, then click Resume.',
      severity: 'warning',
    };
  }
  if (code === 'SELECTOR_NOT_FOUND' || code === 'FORM_CHANGED') {
    return {
      summary: 'Form selectors appear to have changed on the destination site.',
      suggestedAction: 'Learn the new selector and save it into selector memory, then retry.',
      severity: 'critical',
    };
  }
  if (code === 'WEBSITE_UNREACHABLE' || code === 'DNS_FAILED' || code === 'HTTP_5XX') {
    return {
      summary: 'Website appears offline or unstable.',
      suggestedAction: 'Auto-retry with backoff. If it keeps failing, retry tomorrow.',
      severity: 'warning',
    };
  }
  if (code === 'HTTP_403_FORBIDDEN' || code === 'HTTP_429_RATE_LIMITED') {
    return {
      summary: failureLabel(code),
      suggestedAction: suggestedFixForCode(code),
      severity: 'critical',
    };
  }

  return {
    summary: failureLabel(code) || input.failureMessage || 'Execution failed',
    suggestedAction: suggestedFixForCode(code || 'UNKNOWN_EXCEPTION'),
    severity: isAutoRetryable(code) ? 'info' : 'warning',
  };
}

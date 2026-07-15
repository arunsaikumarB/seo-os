/**
 * BrowserExecutionService — Playwright runtime for BEE.
 * Never bypasses CAPTCHA/MFA/email/phone/login. Pauses and returns gate reason.
 */
import { logger } from '../../lib/logger.js';

export type BrowserMode = 'headless' | 'headed';

export interface RuntimeHealth {
  status: 'healthy' | 'degraded' | 'down' | 'unavailable';
  message: string;
  playwrightAvailable: boolean;
}

export interface LaunchOptions {
  mode: BrowserMode;
  timeoutMs?: number;
  storageState?: unknown;
  userDataDir?: string;
}

export interface PageCapture {
  screenshotBase64?: string;
  htmlSnippet?: string;
  consoleLogs: string[];
  url: string;
  title: string;
  detectedGates: Array<'captcha' | 'mfa' | 'email_verify' | 'phone_verify' | 'login'>;
}

type PlaywrightModule = typeof import('playwright');
type PlaywrightBrowser = import('playwright').Browser;

let playwrightMod: PlaywrightModule | null | undefined;

/** Shared Chromium processes — contexts are cheap; browsers are expensive. */
const browserPool = new Map<BrowserMode, PlaywrightBrowser>();
let poolLaunchInFlight: Map<BrowserMode, Promise<PlaywrightBrowser>> = new Map();

async function loadPlaywright(): Promise<PlaywrightModule | null> {
  if (playwrightMod !== undefined) return playwrightMod;
  try {
    playwrightMod = await import('playwright');
    return playwrightMod;
  } catch {
    playwrightMod = null;
    return null;
  }
}

async function acquirePooledBrowser(mode: BrowserMode, timeoutMs: number): Promise<PlaywrightBrowser> {
  const existing = browserPool.get(mode);
  if (existing?.isConnected()) return existing;

  const inFlight = poolLaunchInFlight.get(mode);
  if (inFlight) return inFlight;

  const launchPromise = (async () => {
    const pw = await loadPlaywright();
    if (!pw) throw new Error('Playwright unavailable');
    process.env.PLAYWRIGHT_CHROMIUM_USE_HEADLESS_SHELL ??= '0';
    const executablePath = pw.chromium.executablePath();
    const browser = await pw.chromium.launch({
      headless: mode === 'headless',
      timeout: timeoutMs,
      executablePath,
    });
    browserPool.set(mode, browser);
    browser.on('disconnected', () => {
      if (browserPool.get(mode) === browser) browserPool.delete(mode);
    });
    logger.info({ mode }, 'BEE browser pool launched Chromium');
    return browser;
  })().finally(() => {
    poolLaunchInFlight.delete(mode);
  });

  poolLaunchInFlight.set(mode, launchPromise);
  return launchPromise;
}

export class BrowserExecutionService {
  private browser: import('playwright').Browser | null = null;
  private context: import('playwright').BrowserContext | null = null;
  private page: import('playwright').Page | null = null;
  private consoleLogs: string[] = [];
  private mode: BrowserMode = 'headless';
  /** When true, close() releases context only — Chromium stays in the pool. */
  private pooled = false;

  async health(): Promise<RuntimeHealth> {
    const pw = await loadPlaywright();
    if (!pw) {
      return {
        status: 'unavailable',
        message: 'Playwright package not installed in this runtime',
        playwrightAvailable: false,
      };
    }
    try {
      if (this.browser?.isConnected() || browserPool.get(this.mode)?.isConnected()) {
        return { status: 'healthy', message: 'Browser pool ready', playwrightAvailable: true };
      }
      return { status: 'healthy', message: 'Playwright ready (no active browser)', playwrightAvailable: true };
    } catch (err) {
      return {
        status: 'degraded',
        message: err instanceof Error ? err.message : 'Health check failed',
        playwrightAvailable: true,
      };
    }
  }

  async launch(opts: LaunchOptions): Promise<void> {
    const pw = await loadPlaywright();
    if (!pw) {
      throw Object.assign(
        new Error(
          'Browser Runtime Missing — Administrator Action Required. Suggested Fix: Install Chromium.'
        ),
        {
          code: 'BROWSER_RUNTIME_MISSING',
        }
      );
    }
    await this.closeContextOnly();
    this.mode = opts.mode;
    this.consoleLogs = [];
    try {
      process.env.PLAYWRIGHT_CHROMIUM_USE_HEADLESS_SHELL ??= '0';
      this.browser = await acquirePooledBrowser(opts.mode, opts.timeoutMs ?? 20_000);
      this.pooled = true;
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      if (/executable doesn't exist|could not find browser|browserType\.launch|headless_shell/i.test(raw)) {
        throw Object.assign(
          new Error(
            'Browser Runtime Missing — Administrator Action Required. Suggested Fix: Install Chromium.'
          ),
          { code: 'BROWSER_RUNTIME_MISSING', cause: err }
        );
      }
      throw err;
    }
    this.context = await this.browser.newContext({
      storageState: opts.storageState as never,
      acceptDownloads: true,
    });
    this.page = await this.context.newPage();
    this.page.on('console', (msg) => {
      const line = `[${msg.type()}] ${msg.text()}`;
      this.consoleLogs.push(line.slice(0, 500));
      if (this.consoleLogs.length > 200) this.consoleLogs.shift();
    });
    logger.info({ mode: opts.mode, pooled: true }, 'BEE context acquired from browser pool');
  }

  async restoreStorageState(state: unknown): Promise<void> {
    if (!this.context) throw new Error('No browser context');
    // Re-create context with storage state
    const pw = await loadPlaywright();
    if (!pw || !this.browser) throw new Error('Playwright unavailable');
    await this.context.close();
    this.context = await this.browser.newContext({ storageState: state as never, acceptDownloads: true });
    this.page = await this.context.newPage();
  }

  async exportStorageState(): Promise<unknown> {
    if (!this.context) return null;
    return this.context.storageState();
  }

  async navigate(url: string, timeoutMs = 20_000): Promise<PageCapture> {
    if (!this.page) throw new Error('No page — call launch() first');
    try {
      await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    } catch (err) {
      const { classifyNavigationFailure } = await import('./bee-timeouts.js');
      const c = classifyNavigationFailure(err);
      throw Object.assign(new Error(c.message), {
        code: c.code,
        failureCode: c.code,
        temporary: c.retryable,
        cause: err,
      });
    }
    return this.capture('navigated');
  }

  async capture(_label: string): Promise<PageCapture> {
    if (!this.page) throw new Error('No page');
    const html = await this.page.content();
    const htmlLower = html.toLowerCase();
    const detectedGates: PageCapture['detectedGates'] = [];
    if (/captcha|recaptcha|hcaptcha|turnstile/.test(htmlLower)) detectedGates.push('captcha');
    if (/mfa|2fa|two-factor|authenticator|otp/.test(htmlLower)) detectedGates.push('mfa');
    if (/verify your email|email verification/.test(htmlLower)) detectedGates.push('email_verify');
    if (/phone verification|sms code|verify.*phone/.test(htmlLower)) detectedGates.push('phone_verify');
    if (/type=["']password["']|sign in|log in/.test(htmlLower)) detectedGates.push('login');

    let screenshotBase64: string | undefined;
    try {
      const buf = await this.page.screenshot({ type: 'jpeg', quality: 60, fullPage: false });
      screenshotBase64 = buf.toString('base64');
    } catch {
      // ignore screenshot failures
    }

    return {
      screenshotBase64,
      htmlSnippet: html.slice(0, 50_000),
      consoleLogs: [...this.consoleLogs],
      url: this.page.url(),
      title: await this.page.title(),
      detectedGates,
    };
  }

  async fillFields(mapping: Record<string, unknown>): Promise<{ filled: string[]; missing: string[] }> {
    if (!this.page) throw new Error('No page');
    const filled: string[] = [];
    const missing: string[] = [];
    const canonical = (mapping.__canonical as Record<string, unknown> | undefined) ?? mapping;

    for (const [name, value] of Object.entries(mapping)) {
      if (name.startsWith('__') || value == null) continue;
      if (typeof value === 'object') continue;
      const str = String(value);
      try {
        const locator = this.page.locator(
          `input[name="${name}"], textarea[name="${name}"], select[name="${name}"]`
        );
        if ((await locator.count()) > 0) {
          await locator.first().fill(str);
          filled.push(name);
        } else {
          missing.push(name);
        }
      } catch {
        missing.push(name);
      }
    }

    // Heuristic fills for common labels when name mapping missed
    const heuristics: Array<[string, string]> = [
      ['input[type="email"]', String(canonical.email ?? '')],
      ['input[name*="phone" i], input[type="tel"]', String(canonical.phone ?? '')],
      ['textarea', String(canonical.description ?? '')],
    ];
    for (const [sel, val] of heuristics) {
      if (!val) continue;
      try {
        const loc = this.page.locator(sel);
        if ((await loc.count()) > 0) {
          await loc.first().fill(val);
          filled.push(sel);
        }
      } catch {
        // ignore
      }
    }

    return { filled, missing };
  }

  async uploadFile(selector: string, filePath: string): Promise<void> {
    if (!this.page) throw new Error('No page');
    await this.page.setInputFiles(selector, filePath);
  }

  /**
   * Submit is only called after approval. Still pauses if gate detected on page.
   */
  async listCookieNames(): Promise<string[]> {
    if (!this.context) return [];
    try {
      const cookies = await this.context.cookies();
      return cookies.map((c) => c.name);
    } catch {
      return [];
    }
  }

  async probeGateDom(): Promise<{
    captchaIframeVisible?: boolean;
    captchaContainerVisible?: boolean;
    submitDisabled?: boolean;
    logoutVisible?: boolean;
    avatarVisible?: boolean;
    verifiedBadgeVisible?: boolean;
    successBannerVisible?: boolean;
  }> {
    if (!this.page) return {};
    try {
      // String form avoids Node TS needing DOM lib; runs in browser context only.
      return (await this.page.evaluate(`(() => {
        const visible = (el) => {
          if (!el) return false;
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        };
        const captchaIframe = document.querySelector(
          'iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="turnstile"], iframe[title*="captcha" i]'
        );
        const captchaContainer = document.querySelector(
          '.g-recaptcha, .h-captcha, .cf-turnstile, [data-sitekey], #captcha, .captcha'
        );
        const submit = document.querySelector('button[type="submit"], input[type="submit"]');
        const logout = Array.from(document.querySelectorAll('a,button')).find((el) =>
          /log\\s?out|sign\\s?out/i.test(el.textContent || '')
        );
        const avatar = document.querySelector(
          '[class*="avatar" i], [data-testid*="avatar" i], img[alt*="avatar" i], .user-menu, .account-menu'
        );
        const verified = Array.from(document.querySelectorAll('*')).some((el) =>
          /verified|account activated|email confirmed/i.test(el.textContent || '')
        );
        const success = Array.from(document.querySelectorAll('[role="alert"], .toast, .banner, .alert')).some(
          (el) => /success|verified|thank you|submitted/i.test(el.textContent || '')
        );
        return {
          captchaIframeVisible: visible(captchaIframe),
          captchaContainerVisible: visible(captchaContainer),
          submitDisabled: submit ? Boolean(submit.disabled) : undefined,
          logoutVisible: Boolean(logout && visible(logout)),
          avatarVisible: Boolean(avatar && visible(avatar)),
          verifiedBadgeVisible: verified,
          successBannerVisible: success,
        };
      })()`)) as {
        captchaIframeVisible?: boolean;
        captchaContainerVisible?: boolean;
        submitDisabled?: boolean;
        logoutVisible?: boolean;
        avatarVisible?: boolean;
        verifiedBadgeVisible?: boolean;
        successBannerVisible?: boolean;
      };
    } catch {
      return {};
    }
  }

  /**
   * Revalidate required fields / validation messages before auto-submit after a gate clears.
   * Never bypasses protected gates.
   */
  async revalidateBeforeSubmit(mapping: Record<string, unknown> = {}): Promise<{
    ok: boolean;
    missing: string[];
    validationMessages: string[];
    corrected: string[];
  }> {
    if (!this.page) throw new Error('No page');
    const missing: string[] = [];
    const corrected: string[] = [];
    const validationMessages: string[] = [];

    try {
      const requiredEmpty = (await this.page.evaluate(`(() => {
        const empty = [];
        document.querySelectorAll('input[required], textarea[required], select[required]').forEach((el) => {
          if (!String(el.value || '').trim()) {
            empty.push(el.name || el.id || el.getAttribute('aria-label') || 'required');
          }
        });
        return empty;
      })()`)) as string[];
      missing.push(...requiredEmpty);
    } catch {
      // ignore
    }

    // Attempt automatic correction from known mapping (never passwords / OTP)
    if (missing.length && mapping) {
      const fillResult = await this.fillFields(mapping);
      corrected.push(...fillResult.filled);
      try {
        const stillEmpty = (await this.page.evaluate(`(() => {
          const empty = [];
          document.querySelectorAll('input[required], textarea[required], select[required]').forEach((el) => {
            if (!String(el.value || '').trim()) {
              empty.push(el.name || el.id || 'required');
            }
          });
          return empty;
        })()`)) as string[];
        missing.length = 0;
        missing.push(...stillEmpty);
      } catch {
        // keep previous missing
      }
    }

    try {
      const msgs = (await this.page.evaluate(`(() =>
        Array.from(document.querySelectorAll('[aria-invalid="true"], .error, .invalid-feedback, .field-error'))
          .map((el) => (el.textContent || '').trim())
          .filter(Boolean)
          .slice(0, 10)
      )()`)) as string[];
      validationMessages.push(...msgs);
    } catch {
      // ignore
    }

    return {
      ok: missing.length === 0 && validationMessages.length === 0,
      missing,
      validationMessages,
      corrected,
    };
  }

  async attemptSubmit(submitSelector = 'button[type="submit"], input[type="submit"]'): Promise<{
    submitted: boolean;
    gate?: PageCapture['detectedGates'][number];
    capture: PageCapture;
    validationFailed?: boolean;
  }> {
    if (!this.page) throw new Error('No page');
    const before = await this.capture('before_submit_check');
    if (before.detectedGates.includes('captcha')) {
      return { submitted: false, gate: 'captcha', capture: before };
    }
    if (before.detectedGates.includes('mfa')) {
      return { submitted: false, gate: 'mfa', capture: before };
    }
    if (before.detectedGates.includes('email_verify')) {
      return { submitted: false, gate: 'email_verify', capture: before };
    }
    if (before.detectedGates.includes('phone_verify')) {
      return { submitted: false, gate: 'phone_verify', capture: before };
    }

    try {
      const btn = this.page.locator(submitSelector).first();
      if ((await btn.count()) === 0) {
        return { submitted: false, capture: await this.capture('submit_missing') };
      }
      const disabled = await btn.isDisabled().catch(() => false);
      if (disabled) {
        return {
          submitted: false,
          validationFailed: true,
          capture: await this.capture('submit_disabled'),
        };
      }
      await btn.click({ timeout: 10_000 });
      await this.page.waitForTimeout(1500);
      return { submitted: true, capture: await this.capture('after_submit') };
    } catch (err) {
      logger.warn({ err }, 'Submit click failed');
      return { submitted: false, capture: await this.capture('submit_error') };
    }
  }

  async restart(): Promise<void> {
    const mode = this.mode;
    await this.close();
    await this.launch({ mode });
  }

  private async closeContextOnly(): Promise<void> {
    try {
      await this.page?.close().catch(() => undefined);
      await this.context?.close().catch(() => undefined);
    } finally {
      this.page = null;
      this.context = null;
    }
  }

  async close(): Promise<void> {
    await this.closeContextOnly();
    // Keep pooled Chromium warm for the next job
    if (!this.pooled) {
      await this.browser?.close().catch(() => undefined);
      this.browser = null;
    } else {
      this.browser = null;
    }
  }
}

/** Process-local session registry (single API instance). Multi-instance: store state in DB only. */
const sessionRuntimes = new Map<string, BrowserExecutionService>();

export function getBrowserPoolStats(): {
  headlessConnected: boolean;
  headedConnected: boolean;
  activeSessions: number;
} {
  return {
    headlessConnected: Boolean(browserPool.get('headless')?.isConnected()),
    headedConnected: Boolean(browserPool.get('headed')?.isConnected()),
    activeSessions: sessionRuntimes.size,
  };
}

export async function isPlaywrightAvailable(): Promise<boolean> {
  const pw = await loadPlaywright();
  if (!pw) return false;
  try {
    const { access } = await import('node:fs/promises');
    await access(pw.chromium.executablePath());
    return true;
  } catch {
    return false;
  }
}

export function getSessionRuntime(sessionId: string): BrowserExecutionService {
  let svc = sessionRuntimes.get(sessionId);
  if (!svc) {
    svc = new BrowserExecutionService();
    sessionRuntimes.set(sessionId, svc);
  }
  return svc;
}

export async function disposeSessionRuntime(sessionId: string): Promise<void> {
  const svc = sessionRuntimes.get(sessionId);
  if (svc) {
    await svc.close();
    sessionRuntimes.delete(sessionId);
  }
}

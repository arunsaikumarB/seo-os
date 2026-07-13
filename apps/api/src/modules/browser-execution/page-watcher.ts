/**
 * PageWatcher — DOM/URL/probe inspection for BEE gate clearance.
 * Never solves CAPTCHA/MFA/email/phone/login — only detects user completion.
 */
import {
  evaluateGateClearance,
  type GateClearanceResult,
  type PageWatcherSnapshot,
} from '@seo-os/backlink-builder';
import type { ExecutionGate } from '@seo-os/backlink-builder';
import type { BrowserExecutionService } from './browser-runtime.service.js';

export class PageWatcher {
  private previousUrl: string | undefined;

  constructor(private readonly runtime: BrowserExecutionService) {}

  async snapshot(): Promise<PageWatcherSnapshot> {
    const capture = await this.runtime.capture('page_watcher');
    const probes = await this.runtime.probeGateDom();
    const cookieNames = await this.runtime.listCookieNames();
    const snap: PageWatcherSnapshot = {
      html: capture.htmlSnippet ?? '',
      url: capture.url,
      title: capture.title,
      previousUrl: this.previousUrl,
      cookieNames,
      probes,
    };
    this.previousUrl = capture.url;
    return snap;
  }

  async evaluate(gate: ExecutionGate): Promise<GateClearanceResult & { snapshot: PageWatcherSnapshot }> {
    const snapshot = await this.snapshot();
    const result = evaluateGateClearance(gate, snapshot);
    return { ...result, snapshot };
  }

  seedUrl(url: string): void {
    this.previousUrl = url;
  }
}

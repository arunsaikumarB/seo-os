/**
 * Phase 14 — Playwright bounded wizard walker for Assisted Manual.
 * Advances category → free link-type → continue (max 4 steps) to reach the real form.
 * Never selects paid tiers, never ticks agreements, never solves CAPTCHA.
 */
import { logger } from '../../lib/logger.js';
import { BrowserExecutionService } from './browser-runtime.service.js';
import {
  WIZARD_MAX_STEPS,
  WIZARD_COULD_NOT_REACH_LABEL,
  WIZARD_PAID_ONLY_LABEL,
  classifyWizardStep,
  formatWizardStepSequence,
  htmlHasCoreContentFields,
  isIntermediateWizardStep,
  isPaidOnlyWizardStep,
  type WizardWalkStatus,
} from '@seo-os/backlink-builder';

export type WizardWalkResult = {
  status: WizardWalkStatus;
  html: string | null;
  finalUrl: string | null;
  stepsTaken: string[];
  stepLog: string[];
  stepsWalked: number;
  label: string | null;
  pagesCrawled: string[];
};

const STEP_TIMEOUT_MS = 20_000;

/**
 * Browser-side advance script (string IIFE — same pattern as probeGateDom).
 * Selects free tier / first category option, then clicks Next/Continue.
 * Never ticks agreement checkboxes or paid options.
 */
const ADVANCE_STEP_SCRIPT = `(() => {
  const visible = (el) => {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const textOf = (el) =>
    (el && (el.innerText || el.textContent || el.value || (el.getAttribute && el.getAttribute('aria-label')) || '') || '')
      .toString()
      .trim();
  const FREE_RE = /\\b(regular|free|normal|standard|basic|nofollow\\s*free|free\\s*listing|no\\s*cost|\\$\\s*0|0\\s*(usd|eur)?)\\b/i;
  const PAID_RE = /\\b(featured|premium|paid|gold|silver|platinum|sponsored|promoted|express|priority)\\b/i;
  const PRICE_RE = /\\$\\s*\\d+|€\\s*\\d+|£\\s*\\d+|\\d+\\s*(usd|eur|gbp)/i;
  const PLACEHOLDER_RE = /^(select|choose|pick|--+|category|please\\s+select)/i;
  const NEXT_RE = /go\\s+to\\s+step|next\\s+step|\\bcontinue\\b|\\bproceed\\b|^next$/i;
  const AGREE_RE = /agree|terms|rules|privacy|consent|i\\s+accept/i;

  const isFree = (t) => FREE_RE.test(t);
  const isPaid = (t) => (PAID_RE.test(t) || PRICE_RE.test(t)) && !FREE_RE.test(t);

  let selectedFree = false;

  const radios = Array.from(document.querySelectorAll('input[type="radio"]')).filter(visible);
  let freeRadio = null;
  let anyPaidRadio = false;
  let anyFreeRadio = false;
  for (const r of radios) {
    const label =
      r.closest('label') ||
      (r.id ? document.querySelector('label[for="' + r.id + '"]') : null);
    const t = textOf(label) + ' ' + (r.value || '') + ' ' + (r.name || '');
    if (isPaid(t)) anyPaidRadio = true;
    if (isFree(t)) {
      anyFreeRadio = true;
      if (!freeRadio) freeRadio = r;
    }
  }
  if (radios.length && anyPaidRadio && !anyFreeRadio) {
    return { action: 'paid_only', detail: 'radio group has no free option' };
  }
  if (freeRadio) {
    freeRadio.click();
    freeRadio.checked = true;
    freeRadio.dispatchEvent(new Event('change', { bubbles: true }));
    selectedFree = true;
  }

  const selects = Array.from(document.querySelectorAll('select')).filter(visible);
  for (const sel of selects) {
    const name = ((sel.name || '') + ' ' + (sel.id || '') + ' ' + textOf(sel.closest('label'))).toLowerCase();
    const opts = Array.from(sel.options || []);
    const freeOpt = opts.find((o) => isFree((o.text || '') + ' ' + (o.value || '')));
    const paidOpts = opts.filter((o) => isPaid((o.text || '') + ' ' + (o.value || '')));
    const validOpts = opts.filter((o) => {
      const t = ((o.text || o.value || '') + '').trim();
      return t && !PLACEHOLDER_RE.test(t) && o.value !== '';
    });

    if (/link.?type|plan|pricing|package/.test(name) || (paidOpts.length > 0 && (freeOpt || paidOpts.length > 0))) {
      if (paidOpts.length > 0 && !freeOpt) {
        return { action: 'paid_only', detail: 'select has no free option' };
      }
      if (freeOpt) {
        sel.value = freeOpt.value;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        selectedFree = true;
      }
    } else if (/categor|topic|niche|industry|^type$/.test(name) || (validOpts.length > 0 && selects.length <= 3)) {
      const cur = sel.options[sel.selectedIndex];
      const curText = ((cur && (cur.text || cur.value)) || '').trim();
      if (validOpts.length > 0 && (sel.selectedIndex <= 0 || PLACEHOLDER_RE.test(curText))) {
        sel.value = validOpts[0].value;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  }

  const candidates = Array.from(
    document.querySelectorAll('button, input[type="submit"], input[type="button"], a')
  ).filter(visible);
  let next = null;
  let bestScore = -1;
  for (const el of candidates) {
    const t = textOf(el);
    if (!t) continue;
    if (AGREE_RE.test(t) && !NEXT_RE.test(t)) continue;
    if (/captcha|login|sign\\s*in|register|buy|checkout|pay\\s*now/i.test(t)) continue;
    let score = 0;
    if (/go\\s+to\\s+step/i.test(t)) score += 50;
    if (/next\\s+step/i.test(t)) score += 40;
    if (/^continue$/i.test(t) || /^next$/i.test(t) || /^proceed$/i.test(t)) score += 30;
    if (NEXT_RE.test(t)) score += 20;
    if (el.tagName === 'INPUT' && /submit|button/i.test(el.type || '')) score += 5;
    if (score > bestScore) {
      bestScore = score;
      next = el;
    }
  }
  if (!next || bestScore < 15) {
    return { action: 'no_next', detail: 'no next/continue control found' };
  }
  next.click();
  return {
    action: selectedFree ? 'selected_free_and_next' : 'clicked_next',
    detail: textOf(next).slice(0, 80),
  };
})()`;

async function settleBrief(runtime: BrowserExecutionService, ms = 1_200): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
  try {
    await runtime.settleForSpaForms({ timeoutMs: 6_000 });
  } catch {
    /* best-effort */
  }
}

/**
 * Walk a multi-step submission wizard to the real content form.
 */
export async function walkSubmissionWizard(params: {
  entryUrl: string;
  maxSteps?: number;
  timeoutMs?: number;
}): Promise<WizardWalkResult> {
  const maxSteps = params.maxSteps ?? WIZARD_MAX_STEPS;
  const timeoutMs = params.timeoutMs ?? 45_000;
  const stepsTaken: string[] = [];
  const stepLog: string[] = [];
  const pagesCrawled: string[] = [];
  const runtime = new BrowserExecutionService();

  const fail = (
    status: WizardWalkStatus,
    html: string | null,
    finalUrl: string | null,
    label: string | null
  ): WizardWalkResult => ({
    status,
    html,
    finalUrl,
    stepsTaken,
    stepLog,
    stepsWalked: stepsTaken.length,
    label,
    pagesCrawled,
  });

  try {
    await runtime.launch({ mode: 'headless', timeoutMs: Math.min(timeoutMs, 25_000) });
    await runtime.navigate(params.entryUrl, timeoutMs);
    await settleBrief(runtime, 800);

    let html = await runtime.getPageHtml();
    let pageUrl = await runtime.getPageUrl().catch(() => params.entryUrl);
    pagesCrawled.push(pageUrl);
    stepLog.push(`start ${pageUrl} (${html.length} bytes)`);

    if (htmlHasCoreContentFields(html)) {
      stepLog.push('already on content form');
      return {
        status: 'reached_form',
        html: html.slice(0, 500_000),
        finalUrl: pageUrl,
        stepsTaken: ['the form appears'],
        stepLog,
        stepsWalked: 0,
        label: null,
        pagesCrawled,
      };
    }

    if (isPaidOnlyWizardStep(html)) {
      stepLog.push('paid_only on entry');
      return fail('paid_only', html.slice(0, 500_000), pageUrl, WIZARD_PAID_ONLY_LABEL);
    }

    if (!isIntermediateWizardStep(html)) {
      stepLog.push('not a wizard step');
      return fail('not_a_wizard', html.slice(0, 500_000), pageUrl, null);
    }

    for (let i = 0; i < maxSteps; i++) {
      const kind = classifyWizardStep(html);
      stepLog.push(`step ${i + 1} kind=${kind}`);

      if (kind === 'content_form' || htmlHasCoreContentFields(html)) {
        stepsTaken.push('the form appears');
        stepLog.push('reached content form');
        return {
          status: 'reached_form',
          html: html.slice(0, 500_000),
          finalUrl: pageUrl,
          stepsTaken,
          stepLog,
          stepsWalked: i,
          label: formatWizardStepSequence(stepsTaken) || null,
          pagesCrawled,
        };
      }

      if (kind === 'paid_only' || isPaidOnlyWizardStep(html)) {
        stepLog.push('paid_only — stopping');
        return fail('paid_only', html.slice(0, 500_000), pageUrl, WIZARD_PAID_ONLY_LABEL);
      }

      if (kind === 'category') stepsTaken.push('Choose a category');
      else if (kind === 'link_type') stepsTaken.push('choose Regular (free)');
      else if (kind === 'continue_gate') stepsTaken.push('Continue');
      else stepsTaken.push(`Step ${i + 1}`);

      let advance: { action?: string; detail?: string } = {};
      try {
        advance = (await Promise.race([
          runtime.evaluateOnPage<{ action?: string; detail?: string }>(ADVANCE_STEP_SCRIPT),
          new Promise<{ action: string; detail: string }>((_, rej) =>
            setTimeout(() => rej(new Error('step timeout')), STEP_TIMEOUT_MS)
          ),
        ])) as { action?: string; detail?: string };
      } catch (err) {
        stepLog.push(`advance error: ${err instanceof Error ? err.message : String(err)}`);
        return fail('could_not_reach', html.slice(0, 500_000), pageUrl, WIZARD_COULD_NOT_REACH_LABEL);
      }

      stepLog.push(`advance=${advance.action} detail=${advance.detail ?? ''}`);

      if (advance.action === 'paid_only') {
        return fail('paid_only', html.slice(0, 500_000), pageUrl, WIZARD_PAID_ONLY_LABEL);
      }
      if (advance.action === 'no_next') {
        return fail('could_not_reach', html.slice(0, 500_000), pageUrl, WIZARD_COULD_NOT_REACH_LABEL);
      }

      await settleBrief(runtime, 1_500);
      html = await runtime.getPageHtml();
      pageUrl = await runtime.getPageUrl().catch(() => pageUrl);
      pagesCrawled.push(pageUrl);
      stepLog.push(`after advance url=${pageUrl} bytes=${html.length}`);
    }

    if (htmlHasCoreContentFields(html)) {
      stepsTaken.push('the form appears');
      return {
        status: 'reached_form',
        html: html.slice(0, 500_000),
        finalUrl: pageUrl,
        stepsTaken,
        stepLog,
        stepsWalked: maxSteps,
        label: formatWizardStepSequence(stepsTaken) || null,
        pagesCrawled,
      };
    }

    stepLog.push('max steps exhausted without content form');
    return fail('could_not_reach', html.slice(0, 500_000), pageUrl, WIZARD_COULD_NOT_REACH_LABEL);
  } catch (err) {
    logger.warn({ err, url: params.entryUrl }, 'walkSubmissionWizard failed');
    stepLog.push(`fatal: ${err instanceof Error ? err.message : String(err)}`);
    return fail('error', null, null, WIZARD_COULD_NOT_REACH_LABEL);
  } finally {
    await runtime.close().catch(() => undefined);
  }
}

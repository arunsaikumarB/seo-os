/**
 * Universal URL verdict. Pure: the API fetches and renders, this function only
 * reads the evidence it was given. It never invents a status.
 */

import { parseFormControls, type ParsedFormControl } from './form-fill.js';
import { shouldBlockAutoSubmit } from './detector-registry.js';

export type ScanRenderSource = 'http' | 'playwright' | 'fixture' | 'browser';

export type PageKind =
  | 'article'
  | 'contact'
  | 'homepage'
  | 'login'
  | 'signup'
  | 'submission'
  | 'search'
  | 'directory'
  | 'unknown';

export type FormKind =
  | 'search'
  | 'newsletter'
  | 'contact'
  | 'comment'
  | 'login'
  | 'signup'
  | 'submission'
  | 'other';

export type LinkPolicy = 'dofollow' | 'nofollow' | 'mixed' | 'unknown';

export interface ScannedField {
  name: string;
  type: string;
  label: string;
  required: boolean;
}

export interface ScannedForm {
  pageUrl: string;
  index: number;
  kind: FormKind;
  action: string | null;
  fields: ScannedField[];
  isBacklinkSubmission: boolean;
}

export interface ScanPageEvidence {
  url: string;
  html: string;
  httpStatus: number | null;
}

export interface ScanEvidence {
  requestedUrl: string;
  finalUrl: string | null;
  httpStatus: number | null;
  /** Node/network error message, when fetch never returned a response. */
  fetchError?: string | null;
  contentType?: string | null;
  robotsMeta?: string | null;
  xRobotsTag?: string | null;
  pages: ScanPageEvidence[];
  renderedWith: ScanRenderSource;
  /** What the user hopes this URL is. Compared, never assumed. */
  requestedCategory?: string | null;
}

export interface UrlScanVerdict {
  requestedUrl: string;
  finalUrl: string | null;
  redirected: boolean;
  httpStatus: number | null;
  fetchError: string | null;
  broken: boolean;
  brokenReason: string | null;
  /** True when the URL must not proceed to submit or outreach. */
  stop: boolean;
  parked: boolean;
  pageKind: PageKind;
  loginRequired: boolean;
  loginUrl: string | null;
  signupRequired: boolean;
  signupUrl: string | null;
  captcha: boolean;
  cloudflare: boolean;
  forms: ScannedForm[];
  submissionFormIndex: number | null;
  noForm: boolean;
  contactEmails: string[];
  nextAction: string;
  linkPolicy: LinkPolicy;
  linkPolicyEvidence: string;
  suggestedCategory: string | null;
  categoryFit: 'match' | 'mismatch' | 'unknown';
  indexable: boolean | null;
  robotsNoindex: boolean;
  renderedWith: ScanRenderSource;
  truthStatus: string;
  notes: string[];
}

const PARKED_RE =
  /domain (?:is )?for sale|buy this domain|this domain (?:has )?expired|parked domain|domain parking|sedo\.com|afternic|hugedomains|godaddy parking/i;

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

function norm(url: string | null | undefined): string {
  if (!url) return '';
  try {
    const u = new URL(url);
    u.hash = '';
    return u.toString().replace(/\/$/, '').toLowerCase();
  } catch {
    return url.trim().toLowerCase().replace(/\/$/, '');
  }
}

function classifyError(message: string): string | null {
  const m = message.toLowerCase();
  if (/enotfound|eai_again|getaddrinfo|nxdomain|dns/.test(m)) {
    return `DNS failure: ${message}`;
  }
  if (/cert|ssl|unable_to_verify|self-signed|certificate/.test(m)) {
    return `SSL error: ${message}`;
  }
  if (/timeout|timed out|aborted|etimedout|und_err/.test(m)) {
    return `Timeout: ${message}`;
  }
  if (message.trim()) return message;
  return null;
}

function pageText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000);
}

function titleOf(html: string): string {
  return (/<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1] ?? '').replace(/\s+/g, ' ').trim();
}

function classifyPageKind(url: string, html: string, forms: ScannedForm[]): PageKind {
  const blob = `${url} ${titleOf(html)} ${pageText(html).slice(0, 500)}`.toLowerCase();
  if (forms.some((f) => f.kind === 'login') && !forms.some((f) => f.isBacklinkSubmission)) return 'login';
  if (forms.some((f) => f.kind === 'signup') && !forms.some((f) => f.isBacklinkSubmission)) return 'signup';
  if (forms.some((f) => f.isBacklinkSubmission)) return 'submission';
  if (/\/contact|contact us|get in touch/.test(blob)) return 'contact';
  if (forms.some((f) => f.kind === 'search') && forms.length === 1) return 'search';
  if (/<article\b|blog post|published|posted on/i.test(html) || /\b(article|blog)\b/.test(blob)) return 'article';
  if (/directory|add your site|submit (a |your )?link/.test(blob)) return 'directory';
  try {
    const u = new URL(url);
    if (u.pathname === '/' || u.pathname === '') return 'homepage';
  } catch {
    /* ignore */
  }
  return 'unknown';
}

function fieldBlob(control: ParsedFormControl): string {
  return [control.name, control.id, control.label, control.placeholder, control.ariaLabel, control.autocomplete, control.type]
    .join(' ')
    .toLowerCase();
}

function classifyForm(html: string, controls: ParsedFormControl[]): FormKind {
  // Visible text only. Raw HTML comments contain the letters "comment" and must not win.
  const blob = `${pageText(html)} ${controls.map(fieldBlob).join(' ')}`.toLowerCase();
  const hasPassword = controls.some((c) => c.type === 'password');
  if (hasPassword && /sign\s*up|register|create account/.test(blob)) return 'signup';
  if (hasPassword) return 'login';
  const listing = controls.filter((c) =>
    /title|description|website|url|business|company|listing/.test(fieldBlob(c))
  );
  if (listing.length >= 2 || /submit (your )?(site|url|link|listing)|add (your )?(site|business|company)/.test(blob)) {
    return 'submission';
  }
  if (/\blog\s*in\b|\bsign\s*in\b/.test(blob) && controls.length <= 4) return 'login';
  if (controls.some((c) => c.type === 'search') || (controls.length <= 3 && /\bsearch\b/.test(blob))) return 'search';
  if (/newsletter|\bsubscribe\b/.test(blob) && !/description|website|business/.test(blob)) return 'newsletter';
  if (/\bcomment\b|leave a reply/.test(blob)) return 'comment';
  if (/contact|\bmessage\b|inquiry/.test(blob) || controls.some((c) => c.type === 'email' && /message|textarea/.test(blob))) {
    return 'contact';
  }
  return 'other';
}

function extractForms(pageUrl: string, html: string): ScannedForm[] {
  const chunks = html.match(/<form\b[\s\S]*?<\/form>/gi) ?? [];
  return chunks.map((chunk, index) => {
    const controls = parseFormControls(chunk);
    const kind = classifyForm(chunk, controls);
    const action = /action=["']([^"']*)["']/i.exec(chunk)?.[1] ?? null;
    const fields: ScannedField[] = controls
      .filter((c) => c.tag !== 'button' && c.type !== 'submit' && c.type !== 'hidden')
      .map((c) => ({
        name: c.name || c.id || c.label || c.placeholder || c.type,
        type: c.type || c.tag,
        label: c.label || c.ariaLabel || c.placeholder || c.name,
        required: c.required,
      }));
    return {
      pageUrl,
      index,
      kind,
      action,
      fields,
      isBacklinkSubmission: kind === 'submission',
    };
  });
}

function linkPolicy(html: string): { policy: LinkPolicy; evidence: string } {
  const re = /<a\b([^>]*)>/gi;
  let external = 0;
  let nofollow = 0;
  let dofollow = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1] ?? '';
    const href = /href=["']([^"']+)["']/i.exec(attrs)?.[1] ?? '';
    if (!/^https?:/i.test(href)) continue;
    external += 1;
    const rel = (/rel=["']([^"']+)["']/i.exec(attrs)?.[1] ?? '').toLowerCase();
    if (/nofollow|sponsored|ugc/.test(rel)) nofollow += 1;
    else dofollow += 1;
  }
  if (external === 0) {
    return { policy: 'unknown', evidence: 'No external links on the fetched page, so dofollow vs nofollow is unknown.' };
  }
  if (dofollow === 0) {
    return { policy: 'nofollow', evidence: `${nofollow} external link(s), all nofollow, sponsored, or ugc.` };
  }
  if (nofollow === 0) {
    return { policy: 'dofollow', evidence: `${dofollow} external link(s) without nofollow.` };
  }
  return {
    policy: 'mixed',
    evidence: `${dofollow} dofollow and ${nofollow} nofollow/sponsored/ugc external links.`,
  };
}

function emailsIn(html: string): string[] {
  const found = pageText(html).match(EMAIL_RE) ?? [];
  return [...new Set(found.map((e) => e.toLowerCase()))].filter(
    (e) => !e.endsWith('.png') && !e.includes('example.com') && !e.endsWith('@sentry.io')
  );
}

function suggestedCategory(kind: PageKind, forms: ScannedForm[]): string | null {
  if (forms.some((f) => f.isBacklinkSubmission)) return 'directory';
  if (forms.some((f) => f.kind === 'comment')) return 'blog_comment';
  if (kind === 'contact') return 'resource_page';
  if (kind === 'article') return 'guest_post';
  return null;
}

function hopLoginUrl(pages: ScanPageEvidence[], forms: ScannedForm[]): string | null {
  const loginForm = forms.find((f) => f.kind === 'login');
  if (loginForm) return loginForm.pageUrl;
  for (const page of pages) {
    const href = /href=["']([^"']*(?:login|sign-in|signin)[^"']*)["']/i.exec(page.html)?.[1];
    if (!href) continue;
    try {
      return new URL(href, page.url).toString();
    } catch {
      return href;
    }
  }
  return null;
}

export function analyzeScannedPage(evidence: ScanEvidence): UrlScanVerdict {
  const notes: string[] = [];
  const fetchError = evidence.fetchError?.trim() || null;
  const errorReason = fetchError ? classifyError(fetchError) : null;
  const status = evidence.httpStatus;
  const html = evidence.pages.map((p) => p.html).join('\n');
  const primary = evidence.pages[0];
  const parked = PARKED_RE.test(html) || PARKED_RE.test(titleOf(html));
  const hardEarly = shouldBlockAutoSubmit(html);
  // A challenge interstitial often returns 403. That is a human gate, not a dead URL.
  const challengeHttp = status === 403 && (hardEarly === 'cloudflare' || hardEarly === 'captcha');
  const httpBroken = status != null && status >= 400 && !challengeHttp;
  const brokenReason = errorReason
    ? errorReason
    : httpBroken
      ? `HTTP ${status}`
      : parked
        ? 'Parked or expired domain'
        : null;
  const broken = Boolean(brokenReason);

  const forms = evidence.pages.flatMap((p) => extractForms(p.url, p.html));
  const submission = forms.find((f) => f.isBacklinkSubmission) ?? null;
  const loginForm = forms.some((f) => f.kind === 'login');
  const signupForm = forms.some((f) => f.kind === 'signup');
  const loginRequired = (loginForm || signupForm) && !submission;
  const loginUrl = loginRequired ? hopLoginUrl(evidence.pages, forms) : null;
  const captcha = hardEarly === 'captcha';
  const cloudflare = hardEarly === 'cloudflare';
  const noForm = forms.length === 0;
  const pageKind = primary ? classifyPageKind(primary.url, primary.html, forms) : 'unknown';
  const contacts = evidence.pages.flatMap((p) => emailsIn(p.html));
  const links = linkPolicy(html);
  const suggested = suggestedCategory(pageKind, forms);
  const requested = evidence.requestedCategory?.trim() || null;
  const categoryFit: UrlScanVerdict['categoryFit'] = !requested
    ? 'unknown'
    : suggested && suggested !== requested
      ? 'mismatch'
      : suggested
        ? 'match'
        : 'unknown';

  const robotsBlob = `${evidence.robotsMeta ?? ''} ${evidence.xRobotsTag ?? ''} ${
    /<meta[^>]+name=["']robots["'][^>]*>/i.exec(html)?.[0] ?? ''
  }`.toLowerCase();
  const robotsNoindex = /noindex/.test(robotsBlob);
  const indexable = broken ? false : captcha || cloudflare ? null : robotsNoindex ? false : primary ? true : null;

  const finalUrl = evidence.finalUrl;
  const redirected = Boolean(finalUrl && norm(finalUrl) !== norm(evidence.requestedUrl));

  let nextAction = 'Review the verdict before any submit or outreach.';
  let truthStatus = 'scanned';
  if (broken) {
    truthStatus = 'broken';
    nextAction = `Stop. ${brokenReason}. Do not submit, email, or move this URL to the next step.`;
  } else if (captcha || cloudflare) {
    truthStatus = 'captcha';
    nextAction = captcha
      ? 'Captcha is on the page. A person has to solve it. The app will not click Submit.'
      : 'Cloudflare or an anti-bot challenge is on the page. A person has to clear it.';
  } else if (loginRequired) {
    truthStatus = 'login_required';
    nextAction = `Login required first${loginUrl ? ` (${loginUrl})` : ''}. Sign in through the companion or an assisted step, then re-scan.`;
  } else if (noForm) {
    truthStatus = 'no_form';
    const what =
      pageKind === 'article'
        ? 'This is an article, not a submission form.'
        : pageKind === 'contact'
          ? 'This is a contact page without a usable form in the HTML.'
          : pageKind === 'homepage'
            ? 'This is a homepage with no form.'
            : `No form found. The page looks like: ${pageKind}.`;
    nextAction = contacts.length
      ? `${what} Best next action: outreach email to ${contacts[0]}. Do not invent a form.`
      : `${what} No contact email was found. Best next action: none, unless a person finds a real editor.`;
  } else if (submission && !captcha && !cloudflare && !loginRequired) {
    nextAction = 'A backlink submission form is present. It can be filled for review. Submit only after the approval gate and a human confirm when a gate appears.';
  } else if (forms.length) {
    nextAction = `Forms found (${forms.map((f) => f.kind).join(', ')}). None is a backlink submission form. Do not submit the search, newsletter, or contact widget as a backlink.`;
  }

  if (evidence.renderedWith === 'http' && /id=["'](root|app|__next)["']/i.test(html) && forms.length === 0) {
    notes.push('The HTTP body looks like a JavaScript shell. Render with Playwright before trusting "no form".');
  }
  if (redirected && finalUrl) notes.push(`Redirected to ${finalUrl}.`);
  if (categoryFit === 'mismatch') {
    notes.push(`Page signals suggest ${suggested}, not ${requested}.`);
  }

  return {
    requestedUrl: evidence.requestedUrl,
    finalUrl,
    redirected,
    httpStatus: status,
    fetchError,
    broken,
    brokenReason,
    stop: broken,
    parked,
    pageKind,
    loginRequired,
    loginUrl,
    signupRequired: signupForm && !submission,
    signupUrl: signupForm && !submission ? loginUrl : null,
    captcha,
    cloudflare,
    forms,
    submissionFormIndex: submission ? forms.indexOf(submission) : null,
    noForm,
    contactEmails: [...new Set(contacts)].slice(0, 5),
    nextAction,
    linkPolicy: links.policy,
    linkPolicyEvidence: links.evidence,
    suggestedCategory: suggested,
    categoryFit,
    indexable,
    robotsNoindex,
    renderedWith: evidence.renderedWith,
    truthStatus,
    notes,
  };
}

/**
 * Page-intent detectors — Phase 5 extension of the Phase 4.5 Detector Registry.
 * Same evidence discipline (signals + confidence). Does not invent a second truth system.
 */
import type { DetectorSignal } from './detector-registry.js';

export const PAGE_INTENTS = [
  'Homepage',
  'Category',
  'Article',
  'Write For Us',
  'Guest Post Guidelines',
  'Submission Form',
  'Registration',
  'Login',
  'Dashboard',
  'Contact',
  'Directory',
  'Forum',
  'Comment Form',
  'Email Only',
  'Google Form',
  'Typeform',
  'Unsupported',
] as const;

export type PageIntent = (typeof PAGE_INTENTS)[number];

export type PageIntentDetectorId =
  | 'page_homepage'
  | 'page_guidelines'
  | 'page_write_for_us'
  | 'page_submission_form'
  | 'page_google_form'
  | 'page_typeform'
  | 'page_login'
  | 'page_registration'
  | 'page_dashboard'
  | 'page_contact'
  | 'page_email_only'
  | 'page_comment'
  | 'page_directory'
  | 'page_forum'
  | 'page_category'
  | 'page_article';

export type PageIntentResult = {
  intent: PageIntent;
  detectorId: PageIntentDetectorId;
  matched: boolean;
  confidence: number;
  signals: DetectorSignal[];
  /** Extracted email when Email Only */
  emailAddress?: string | null;
};

export type PageIntentInput = {
  html: string;
  url: string;
  title?: string | null;
  /** Platform hints from fingerprint — never substitute for evidence */
  platformHints?: string[];
};

const CFG = {
  writeForUsUrl:
    /\/(write-for-us|write-for-me|guest-post|guest-posts|contribute|submit-guest|submit-article|submit-post)(\/|$|\?)/i,
  writeForUsText: /write\s+for\s+us|guest\s+post\s+opportunit|contribute\s+(an?\s+)?article/i,
  writeForUsHeading:
    /<(?:h1|h2)[^>]*>[^<]*(write\s+for\s+us|guest\s+post|contribute)[^<]*</i,
  guidelinesUrl: /\/(guidelines|editorial-guidelines|guest-post-guidelines|submission-guidelines)(\/|$|\?)/i,
  guidelinesText:
    /guest\s+post\s+guidelines|editorial\s+guidelines|submission\s+guidelines|word\s+count|do\s+not\s+promote/i,
  submissionFields:
    /<(?:textarea|input)[^>]*(name|id|placeholder)=["'][^"']*(title|article|content|body|description|listing|company|website|url|business|pitch)[^"']*["']/i,
  fileUpload: /<input[^>]*\btype=["']file["']/i,
  contactUrl: /\/(contact|contact-us|get-in-touch)(\/|$|\?)/i,
  contactText: /contact\s+us|get\s+in\s+touch|send\s+us\s+a\s+message/i,
  loginUrl: /\/(login|signin|sign-in|wp-login\.php|auth)(\/|$|\?)/i,
  signupUrl: /\/(signup|sign-up|register|join|wp-signup)(\/|$|\?)/i,
  dashboardUrl: /\/(dashboard|wp-admin|member|account|user\/home)(\/|$|\?)/i,
  dashboardText: /my\s+dashboard|member\s+area|contributor\s+dashboard|wp-admin/i,
  googleForm: /docs\.google\.com\/forms|forms\.gle\//i,
  typeform: /typeform\.com|data-tf-/i,
  emailMailto: /mailto:([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i,
  emailPlain: /\b([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})\b/i,
  commentForm:
    /<(?:textarea)[^>]*(name|id)=["'][^"']*comment[^"']*["']|leave\s+a\s+comment|post\s+a\s+comment/i,
  newsletter:
    /newsletter|subscribe\s+to\s+our|email\s+signup|<input[^>]*(name|id)=["'][^"']*(newsletter|subscribe)[^"']*["']/i,
  searchOnly: /<input[^>]*\btype=["']search["']|<form[^>]*role=["']search["']/i,
  directory: /directory|listings?\s+index|browse\s+categories/i,
  forum: /forum|discussion\s+board|bbpress|discourse/i,
  category: /category|topics?|tag\//i,
  article: /<(?:article|time)[^>]*>|posted\s+on|by\s+author|min\s+read/i,
  homepagePath: /^\/?$|^\/index\.(html?|php)$/i,
} as const;

function sig(id: string, kind: DetectorSignal['kind'], detail: string): DetectorSignal {
  return { id, kind, detail };
}

function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

/** Submission Form requires content-shaped fields — not login/search/newsletter alone. */
export function hasContentSubmissionForm(html: string): boolean {
  if (!CFG.submissionFields.test(html) && !/<form[\s\S]{120,}?<\/form>/i.test(html)) return false;
  if (CFG.newsletter.test(html) && !CFG.submissionFields.test(html)) return false;
  if (CFG.commentForm.test(html) && !CFG.writeForUsText.test(html)) return false;
  // Login-shaped
  if (
    /<input[^>]*\btype=["']password["']/i.test(html) &&
    !CFG.submissionFields.test(html) &&
    !CFG.fileUpload.test(html)
  ) {
    return false;
  }
  return (
    CFG.submissionFields.test(html) ||
    (CFG.fileUpload.test(html) && /form/i.test(html) && CFG.writeForUsText.test(html))
  );
}

function runGuidelines(input: PageIntentInput): PageIntentResult {
  const html = input.html;
  const url = input.url;
  const signals: DetectorSignal[] = [];
  const urlHit = CFG.guidelinesUrl.test(url);
  const textHit = CFG.guidelinesText.test(html);
  if (urlHit) signals.push(sig('guidelines_url', 'url', url));
  if (textHit) signals.push(sig('guidelines_copy', 'text', 'guidelines language'));
  // Guidelines pages often mention email but are NOT submission forms
  const matched = urlHit || (textHit && !hasContentSubmissionForm(html));
  return {
    intent: 'Guest Post Guidelines',
    detectorId: 'page_guidelines',
    matched,
    confidence: matched ? (urlHit && textHit ? 0.95 : 0.8) : 0,
    signals,
  };
}

function runWriteForUs(input: PageIntentInput): PageIntentResult {
  const signals: DetectorSignal[] = [];
  const urlHit = CFG.writeForUsUrl.test(input.url);
  const headingHit = CFG.writeForUsHeading.test(input.html);
  const textHit = CFG.writeForUsText.test(input.html);
  if (urlHit) signals.push(sig('wfu_url', 'url', input.url));
  if (headingHit) signals.push(sig('wfu_heading', 'text', 'write-for-us heading'));
  if (textHit) signals.push(sig('wfu_text', 'text', 'write-for-us copy'));
  // Prefer guidelines detector when clearly guidelines without a form
  if (CFG.guidelinesText.test(input.html) && !hasContentSubmissionForm(input.html)) {
    return {
      intent: 'Write For Us',
      detectorId: 'page_write_for_us',
      matched: false,
      confidence: 0,
      signals,
    };
  }
  // Nav-only mentions do not count — need URL or heading (or body copy + form)
  const matched =
    urlHit || headingHit || (textHit && hasContentSubmissionForm(input.html));
  return {
    intent: 'Write For Us',
    detectorId: 'page_write_for_us',
    matched,
    confidence: matched ? (urlHit || headingHit ? 0.9 : 0.75) : 0,
    signals,
  };
}

function runSubmissionForm(input: PageIntentInput): PageIntentResult {
  const signals: DetectorSignal[] = [];
  const form = hasContentSubmissionForm(input.html);
  if (form) signals.push(sig('submission_fields', 'dom', 'content-submission fields'));
  if (CFG.fileUpload.test(input.html)) signals.push(sig('file_upload', 'dom', 'file input'));
  // Must not be login / comment / newsletter only
  const matched = form;
  return {
    intent: 'Submission Form',
    detectorId: 'page_submission_form',
    matched,
    confidence: matched ? 0.9 : 0,
    signals,
  };
}

function runGoogleForm(input: PageIntentInput): PageIntentResult {
  const hit = CFG.googleForm.test(input.url) || CFG.googleForm.test(input.html);
  return {
    intent: 'Google Form',
    detectorId: 'page_google_form',
    matched: hit,
    confidence: hit ? 0.98 : 0,
    signals: hit ? [sig('google_form', 'url', input.url)] : [],
  };
}

function runTypeform(input: PageIntentInput): PageIntentResult {
  const hit = CFG.typeform.test(input.url) || CFG.typeform.test(input.html);
  return {
    intent: 'Typeform',
    detectorId: 'page_typeform',
    matched: hit,
    confidence: hit ? 0.98 : 0,
    signals: hit ? [sig('typeform', 'url', input.url)] : [],
  };
}

function runLogin(input: PageIntentInput): PageIntentResult {
  const html = input.html;
  const url = input.url;
  const signals: DetectorSignal[] = [];
  const urlHit = CFG.loginUrl.test(url);
  const pw = /<input[^>]*\btype=["']password["']/i.test(html);
  const loginCopy = /sign[\s-]?in|log[\s-]?in/i.test(html);
  if (urlHit) signals.push(sig('login_url', 'url', url));
  if (pw) signals.push(sig('password', 'dom', 'password field'));
  const matched = (urlHit || (pw && loginCopy)) && !hasContentSubmissionForm(html);
  return {
    intent: 'Login',
    detectorId: 'page_login',
    matched,
    confidence: matched ? 0.9 : 0,
    signals,
  };
}

function runRegistration(input: PageIntentInput): PageIntentResult {
  const urlHit = CFG.signupUrl.test(input.url);
  const copy = /sign[\s-]?up|register|create (an )?account/i.test(input.html);
  const matched = urlHit || (copy && /<input[^>]*\btype=["']password["']/i.test(input.html));
  return {
    intent: 'Registration',
    detectorId: 'page_registration',
    matched,
    confidence: matched ? 0.88 : 0,
    signals: matched ? [sig('registration', 'text', 'signup')] : [],
  };
}

function runDashboard(input: PageIntentInput): PageIntentResult {
  const matched =
    CFG.dashboardUrl.test(input.url) || CFG.dashboardText.test(input.html);
  return {
    intent: 'Dashboard',
    detectorId: 'page_dashboard',
    matched,
    confidence: matched ? 0.85 : 0,
    signals: matched ? [sig('dashboard', 'url', input.url)] : [],
  };
}

function runContact(input: PageIntentInput): PageIntentResult {
  const urlHit = CFG.contactUrl.test(input.url);
  const textHit = CFG.contactText.test(input.html);
  const hasForm = /<form[\s\S]+?<\/form>/i.test(input.html);
  const matched = (urlHit || textHit) && hasForm && !hasContentSubmissionForm(input.html);
  return {
    intent: 'Contact',
    detectorId: 'page_contact',
    matched,
    confidence: matched ? 0.8 : 0,
    signals: matched ? [sig('contact', 'text', 'contact form')] : [],
  };
}

function runEmailOnly(input: PageIntentInput): PageIntentResult {
  const mailto = input.html.match(CFG.emailMailto);
  const plain = !mailto ? input.html.match(CFG.emailPlain) : null;
  const email = mailto?.[1] ?? plain?.[1] ?? null;
  const hasForm = hasContentSubmissionForm(input.html) || /<form[\s\S]+?<\/form>/i.test(input.html);
  // Email only when email present and no real submission/contact form
  const guidelines = CFG.guidelinesText.test(input.html);
  const matched = Boolean(email) && (!hasForm || guidelines) && !CFG.googleForm.test(input.html);
  return {
    intent: 'Email Only',
    detectorId: 'page_email_only',
    matched: matched && Boolean(email),
    confidence: matched ? 0.75 : 0,
    signals: email ? [sig('email', 'text', email)] : [],
    emailAddress: matched ? email : null,
  };
}

function runComment(input: PageIntentInput): PageIntentResult {
  const matched = CFG.commentForm.test(input.html) && !hasContentSubmissionForm(input.html);
  return {
    intent: 'Comment Form',
    detectorId: 'page_comment',
    matched,
    confidence: matched ? 0.85 : 0,
    signals: matched ? [sig('comment', 'dom', 'comment textarea')] : [],
  };
}

function runDirectory(input: PageIntentInput): PageIntentResult {
  const matched = CFG.directory.test(`${input.url}\n${input.html}`);
  return {
    intent: 'Directory',
    detectorId: 'page_directory',
    matched,
    confidence: matched ? 0.7 : 0,
    signals: matched ? [sig('directory', 'text', 'directory')] : [],
  };
}

function runForum(input: PageIntentInput): PageIntentResult {
  const matched = CFG.forum.test(`${input.url}\n${input.html}`);
  return {
    intent: 'Forum',
    detectorId: 'page_forum',
    matched,
    confidence: matched ? 0.7 : 0,
    signals: matched ? [sig('forum', 'text', 'forum')] : [],
  };
}

function runHomepage(input: PageIntentInput): PageIntentResult {
  const path = pathOf(input.url);
  const matched = CFG.homepagePath.test(path);
  return {
    intent: 'Homepage',
    detectorId: 'page_homepage',
    matched,
    confidence: matched ? 0.7 : 0,
    signals: matched ? [sig('homepage_path', 'url', path)] : [],
  };
}

function runCategory(input: PageIntentInput): PageIntentResult {
  const matched = CFG.category.test(input.url) && !CFG.writeForUsUrl.test(input.url);
  return {
    intent: 'Category',
    detectorId: 'page_category',
    matched,
    confidence: matched ? 0.65 : 0,
    signals: matched ? [sig('category', 'url', input.url)] : [],
  };
}

function runArticle(input: PageIntentInput): PageIntentResult {
  const matched = CFG.article.test(input.html) && !hasContentSubmissionForm(input.html);
  return {
    intent: 'Article',
    detectorId: 'page_article',
    matched,
    confidence: matched ? 0.6 : 0,
    signals: matched ? [sig('article', 'dom', 'article markers')] : [],
  };
}

/** Priority order — first strong match wins (guidelines before write-for-us before form). */
export const PAGE_INTENT_DETECTORS: Array<(input: PageIntentInput) => PageIntentResult> = [
  runGoogleForm,
  runTypeform,
  runGuidelines,
  runSubmissionForm,
  runWriteForUs,
  runLogin,
  runRegistration,
  runDashboard,
  runContact,
  runEmailOnly,
  runComment,
  runDirectory,
  runForum,
  runHomepage,
  runCategory,
  runArticle,
];

export type ClassifiedPage = {
  url: string;
  intent: PageIntent;
  confidence: number;
  detectorId: PageIntentDetectorId | 'unsupported';
  signals: DetectorSignal[];
  emailAddress?: string | null;
};

/**
 * Classify a page with exactly ONE intent. Unverifiable → Unsupported.
 */
export function classifyPageIntent(input: PageIntentInput): ClassifiedPage {
  let best: PageIntentResult | null = null;
  for (const det of PAGE_INTENT_DETECTORS) {
    const r = det(input);
    if (!r.matched) continue;
    if (!best || r.confidence > best.confidence) best = r;
    // High-confidence early exit for platform forms / guidelines / submission
    if (r.confidence >= 0.9) break;
  }
  if (!best || best.confidence < 0.55) {
    return {
      url: input.url,
      intent: 'Unsupported',
      confidence: 0,
      detectorId: 'unsupported',
      signals: [],
    };
  }
  return {
    url: input.url,
    intent: best.intent,
    confidence: best.confidence,
    detectorId: best.detectorId,
    signals: best.signals,
    emailAddress: best.emailAddress,
  };
}

/**
 * Capability 3 — Contact Form Intelligence.
 * Extends Site Intelligence for contact-form / outreach workflows.
 * Does not modify CSM, BEE, AI Review, SIE core, WordPress, or Directory modules.
 */
import type { DetectorSignal } from './detector-registry.js';
import type { ClassifiedPage } from './page-intent-detectors.js';
import type { SiteFingerprint } from './site-fingerprint.js';
import type {
  ExpectedIntervention,
  StrategyPlan,
  SubmissionStrategyName,
} from './site-strategy.js';

export const CONTACT_FORM_PLATFORMS = [
  'Contact Form 7',
  'Gravity Forms',
  'WPForms',
  'Ninja Forms',
  'Elementor Forms',
  'Fluent Forms',
  'HubSpot Forms',
  'Typeform',
  'Google Forms',
  'Jotform',
  'Tally',
  'Zoho Forms',
  'Airtable Forms',
  'Custom HTML Forms',
  'Unknown Form',
] as const;

export type ContactFormPlatform = (typeof CONTACT_FORM_PLATFORMS)[number];

export const CONTACT_FORM_INTENTS = [
  'General Contact',
  'Guest Post Submission',
  'Write For Us',
  'Business Listing',
  'Advertising',
  'Sponsored Post',
  'Media Contact',
  'Partnership',
  'Support',
  'Sales',
  'Newsletter',
  'Job Application',
  'Feedback',
  'Unknown',
] as const;

export type ContactFormIntent = (typeof CONTACT_FORM_INTENTS)[number];

export const CONTACT_FORM_STRATEGIES = [
  'Guest Post',
  'Business Listing',
  'Partnership',
  'General Outreach',
  'Media Request',
  'Advertising',
  'Unsupported',
] as const;

export type ContactFormStrategyName = (typeof CONTACT_FORM_STRATEGIES)[number];

export type ContactFormFieldMap = {
  name: boolean;
  firstName: boolean;
  lastName: boolean;
  businessName: boolean;
  company: boolean;
  email: boolean;
  phone: boolean;
  website: boolean;
  url: boolean;
  subject: boolean;
  message: boolean;
  attachment: boolean;
  category: boolean;
  country: boolean;
  socialLinks: boolean;
  requiredFields: string[];
  optionalFields: string[];
  rawFields: string[];
};

export type ContactFormAttachments = {
  images: boolean;
  pdf: boolean;
  docx: boolean;
  zip: boolean;
  mediaKit: boolean;
  accepted: boolean;
  acceptAttr: string | null;
};

export type ContactFormAntiSpam = {
  honeypot: boolean;
  hiddenInputs: string[];
  timeCheck: boolean;
  jsValidation: boolean;
  turnstile: boolean;
  recaptcha: boolean;
  hcaptcha: boolean;
  mathCaptcha: boolean;
  requiresHuman: boolean;
};

export type ContactFormValidation = {
  requiredFields: string[];
  emailPattern: boolean;
  urlValidation: boolean;
  phonePattern: boolean;
  characterLimits: Record<string, number>;
  fileSizeLimit: string | null;
  acceptedFormats: string[];
};

export type ContactFormSuccessIndicators = {
  successMessage: boolean;
  thankYouPage: boolean;
  confirmationBanner: boolean;
  redirect: boolean;
  formReset: boolean;
  emailConfirmation: boolean;
  patterns: string[];
};

export type ContactFormMessageTemplate = {
  strategy: ContactFormStrategyName;
  subject: string;
  bodyOutline: string;
  tone: string;
};

export type ContactFormKnowledge = {
  detected: boolean;
  confidence: number;
  signals: DetectorSignal[];
  platform: ContactFormPlatform;
  platformConfidence: number;
  platformVersion: string | null;
  formIntent: ContactFormIntent;
  formIntentConfidence: number;
  entryUrl: string | null;
  fieldMap: ContactFormFieldMap | null;
  attachments: ContactFormAttachments;
  antiSpam: ContactFormAntiSpam;
  validation: ContactFormValidation;
  successIndicators: ContactFormSuccessIndicators;
  messageTemplate: ContactFormMessageTemplate | null;
  workflow: ContactFormStrategyName | null;
};

export type ContactFormLearning = {
  platform: string | null;
  successfulStrategy: string | null;
  requiredFields: string[];
  attachmentSupport: boolean | null;
  validationRules: string[];
  averageSubmissionTimeMs: number | null;
  successRate: number | null;
  failures: Array<{ at: string; reason: string }>;
  knownSelectors: string[];
  submissionUrl: string | null;
  knownSuccessIndicators: string[];
};

function sig(id: string, kind: DetectorSignal['kind'], detail: string): DetectorSignal {
  return { id, kind, detail };
}

const PLATFORM_RULES: Array<{
  platform: ContactFormPlatform;
  re: RegExp;
  versionRe?: RegExp;
}> = [
  {
    platform: 'Contact Form 7',
    re: /wpcf7|contact-form-7/i,
    versionRe: /contact-form-7[^"']*?[?&]ver=([\d.]+)/i,
  },
  {
    platform: 'Gravity Forms',
    re: /gform_wrapper|gravityforms|gform_ajax/i,
    versionRe: /gravityforms[^"']*?[?&]ver=([\d.]+)/i,
  },
  {
    platform: 'WPForms',
    re: /wpforms-(?:form|container|submit)|wpforms\.min\.js/i,
  },
  { platform: 'Ninja Forms', re: /nf-form|ninja-forms/i },
  { platform: 'Elementor Forms', re: /elementor-form|elementor-field/i },
  { platform: 'Fluent Forms', re: /fluentform|ff-el-form/i },
  {
    platform: 'HubSpot Forms',
    re: /hs-form|hbspt\.forms|hubspot\.com\/.*forms/i,
  },
  { platform: 'Typeform', re: /typeform\.com|data-tf-widget|tf-v1-/i },
  {
    platform: 'Google Forms',
    re: /docs\.google\.com\/forms|googleusercontent\.com\/forms/i,
  },
  { platform: 'Jotform', re: /jotform\.com|jsform-|jotformForm/i },
  { platform: 'Tally', re: /tally\.so|tally-embed/i },
  { platform: 'Zoho Forms', re: /forms\.zohopublic|zoho\.com\/forms/i },
  { platform: 'Airtable Forms', re: /airtable\.com\/.*form|airtable-embed/i },
];

const FORM_SIGNAL_TESTS: Array<{
  id: string;
  kind: DetectorSignal['kind'];
  test: (html: string, url: string) => boolean;
  detail: string;
}> = [
  {
    id: 'contact_heading',
    kind: 'text',
    test: (h) => /<h[1-3][^>]*>\s*contact(\s+us)?\s*</i.test(h) || /get\s+in\s+touch/i.test(h),
    detail: 'Contact heading',
  },
  {
    id: 'contact_url',
    kind: 'url',
    test: (_h, u) => /\/(contact|get-in-touch|reach-us)(\/|$|\?)/i.test(u),
    detail: 'Contact URL',
  },
  {
    id: 'form_tag',
    kind: 'dom',
    test: (h) => /<form[\s\S]{40,}?<\/form>/i.test(h),
    detail: 'HTML form',
  },
  {
    id: 'email_field',
    kind: 'dom',
    test: (h) => /type=["']email["']|name=["'][^"']*email/i.test(h),
    detail: 'Email field',
  },
  {
    id: 'message_field',
    kind: 'dom',
    test: (h) => /<(textarea)[^>]*(name|id)=["'][^"']*(message|body|comment|inquiry)/i.test(h),
    detail: 'Message field',
  },
  {
    id: 'cf7',
    kind: 'dom',
    test: (h) => /wpcf7|contact-form-7/i.test(h),
    detail: 'Contact Form 7',
  },
  {
    id: 'gravity',
    kind: 'dom',
    test: (h) => /gform_wrapper|gravityforms/i.test(h),
    detail: 'Gravity Forms',
  },
  {
    id: 'wpforms',
    kind: 'dom',
    test: (h) => /wpforms-/i.test(h),
    detail: 'WPForms',
  },
  {
    id: 'hubspot',
    kind: 'dom',
    test: (h) => /hs-form|hbspt\.forms/i.test(h),
    detail: 'HubSpot Forms',
  },
  {
    id: 'typeform',
    kind: 'dom',
    test: (h) => /typeform\.com|data-tf-widget/i.test(h),
    detail: 'Typeform',
  },
  {
    id: 'google_forms',
    kind: 'dom',
    test: (h, u) => /docs\.google\.com\/forms/i.test(h) || /docs\.google\.com\/forms/i.test(u),
    detail: 'Google Forms',
  },
  {
    id: 'jotform',
    kind: 'dom',
    test: (h) => /jotform/i.test(h),
    detail: 'Jotform',
  },
];

/** Multi-signal contact form detection — never one selector. */
export function detectContactForm(params: {
  html: string;
  url: string;
}): { detected: boolean; confidence: number; signals: DetectorSignal[] } {
  const signals: DetectorSignal[] = [];
  for (const t of FORM_SIGNAL_TESTS) {
    if (t.test(params.html, params.url)) signals.push(sig(t.id, t.kind, t.detail));
  }
  const detected = signals.length >= 2;
  return {
    detected,
    confidence: detected
      ? Math.min(0.98, 0.4 + signals.length * 0.08)
      : signals.length === 1
        ? 0.3
        : 0,
    signals,
  };
}

export function detectContactFormPlatform(
  html: string,
  url: string
): {
  platform: ContactFormPlatform;
  confidence: number;
  version: string | null;
  signals: DetectorSignal[];
} {
  const blob = `${html}\n${url}`;
  for (const rule of PLATFORM_RULES) {
    if (!rule.re.test(blob)) continue;
    let version: string | null = null;
    if (rule.versionRe) {
      const m = blob.match(rule.versionRe);
      version = m?.[1] ?? null;
    }
    return {
      platform: rule.platform,
      confidence: 0.92,
      version,
      signals: [sig('cf_platform', 'dom', rule.platform)],
    };
  }
  if (/<form[\s\S]{40,}?<\/form>/i.test(html)) {
    return {
      platform: 'Custom HTML Forms',
      confidence: 0.55,
      version: null,
      signals: [sig('cf_platform', 'dom', 'Custom HTML Forms')],
    };
  }
  return {
    platform: 'Unknown Form',
    confidence: 0,
    version: null,
    signals: [],
  };
}

export function classifyContactFormIntent(params: {
  html: string;
  url: string;
  title?: string | null;
}): { intent: ContactFormIntent; confidence: number; signals: DetectorSignal[] } {
  const blob = `${params.title ?? ''}\n${params.url}\n${params.html}`;
  const rules: Array<{ intent: ContactFormIntent; re: RegExp; confidence: number }> = [
    {
      intent: 'Write For Us',
      re: /write\s+for\s+us|become\s+a\s+contributor/i,
      confidence: 0.92,
    },
    {
      intent: 'Guest Post Submission',
      re: /guest\s*post|submit\s+(an?\s+)?article|contribute/i,
      confidence: 0.92,
    },
    {
      intent: 'Business Listing',
      re: /business\s+listing|list\s+your\s+business|add\s+your\s+company/i,
      confidence: 0.9,
    },
    {
      intent: 'Sponsored Post',
      re: /sponsored\s+post|sponsored\s+content/i,
      confidence: 0.88,
    },
    {
      intent: 'Advertising',
      re: /advertis|media\s+kit|ad\s+rates|promote\s+with/i,
      confidence: 0.85,
    },
    {
      intent: 'Partnership',
      re: /partner(ship)?|collaborat|affiliate/i,
      confidence: 0.85,
    },
    {
      intent: 'Media Contact',
      re: /press\s+(contact|inquiry|kit)|media\s+(contact|inquiry)|journalist/i,
      confidence: 0.88,
    },
    {
      intent: 'Job Application',
      re: /job\s+application|careers?|apply\s+now|resume|\bcv\b/i,
      confidence: 0.9,
    },
    {
      intent: 'Newsletter',
      re: /newsletter|subscribe|mailing\s+list/i,
      confidence: 0.85,
    },
    {
      intent: 'Support',
      re: /support\s+ticket|help\s+desk|technical\s+support/i,
      confidence: 0.82,
    },
    {
      intent: 'Sales',
      re: /request\s+a\s+demo|sales\s+inquiry|get\s+a\s+quote/i,
      confidence: 0.82,
    },
    {
      intent: 'Feedback',
      re: /feedback|survey|rate\s+(us|our)/i,
      confidence: 0.8,
    },
    {
      intent: 'General Contact',
      re: /contact(\s+us)?|get\s+in\s+touch|reach\s+out/i,
      confidence: 0.75,
    },
  ];
  for (const r of rules) {
    if (r.re.test(blob)) {
      return {
        intent: r.intent,
        confidence: r.confidence,
        signals: [sig('cf_intent', 'text', r.intent)],
      };
    }
  }
  return { intent: 'Unknown', confidence: 0.4, signals: [] };
}

const HONEYPOT_NAME_RE =
  /^(honeypot|hp|bot.?field|leave.?blank|fax|company_url|confirm.?email)$/i;

function isLikelyHoneypot(name: string, inputHtml: string): boolean {
  // Explicit honeypot names — never treat as visible fields
  if (HONEYPOT_NAME_RE.test(name)) return true;
  // Off-screen / aria-hidden traps (including classic website/url honeypots)
  if (
    /aria-hidden=["']true["']|tabindex=["']-1["']|position:\s*absolute;\s*left:\s*-/i.test(
      inputHtml
    )
  )
    return true;
  if (/class=["'][^"']*(honeypot|hp-field|wpcf7-pot)[^"']*["']/i.test(inputHtml)) return true;
  if (
    /type=["']hidden["']/i.test(inputHtml) &&
    /honeypot|hp_|bot|leave.?blank/i.test(name + inputHtml)
  )
    return true;
  // Visible website/url fields are legitimate — do not classify as honeypot
  return false;
}

export function extractContactFormFieldMap(html: string): ContactFormFieldMap {
  const rawFields: string[] = [];
  const requiredFields: string[] = [];
  const optionalFields: string[] = [];
  const flags: Omit<
    ContactFormFieldMap,
    'requiredFields' | 'optionalFields' | 'rawFields'
  > = {
    name: false,
    firstName: false,
    lastName: false,
    businessName: false,
    company: false,
    email: false,
    phone: false,
    website: false,
    url: false,
    subject: false,
    message: false,
    attachment: false,
    category: false,
    country: false,
    socialLinks: false,
  };

  const fieldRe = /<(input|textarea|select)([^>]*?)(?:\/?>|>([\s\S]*?)<\/\1>)/gi;
  let m: RegExpExecArray | null;
  while ((m = fieldRe.exec(html))) {
    const tag = m[0];
    const attrs = m[2] ?? '';
    const nameMatch = attrs.match(/name=["']([^"']+)["']/i);
    const idMatch = attrs.match(/id=["']([^"']+)["']/i);
    const name = (nameMatch?.[1] ?? idMatch?.[1] ?? '').trim();
    if (!name || /submit|button|csrf|_wpnonce|g-recaptcha/i.test(name)) continue;
    if (isLikelyHoneypot(name, tag)) continue;

    rawFields.push(name);
    const required =
      /\srequired([\s=>/]|$)/i.test(attrs) ||
      /aria-required=["']true["']/i.test(attrs) ||
      /class=["'][^"']*required[^"']*["']/i.test(attrs);
    if (required) requiredFields.push(name);
    else optionalFields.push(name);

    const key = name.toLowerCase();
    if (/^name$|full.?name|your.?name|contact.?name/i.test(key)) flags.name = true;
    if (/first.?name|fname/i.test(key)) flags.firstName = true;
    if (/last.?name|lname|surname/i.test(key)) flags.lastName = true;
    if (/business.?name|listing.?name/i.test(key)) flags.businessName = true;
    if (/^company$|organization|org.?name/i.test(key)) flags.company = true;
    if (/email|e-mail/i.test(key) || /type=["']email["']/i.test(attrs)) flags.email = true;
    if (/phone|tel|mobile/i.test(key) || /type=["']tel["']/i.test(attrs)) flags.phone = true;
    if (/website|site.?url|web.?address/i.test(key)) flags.website = true;
    if (/^url$|homepage|link.?url/i.test(key) || /type=["']url["']/i.test(attrs)) flags.url = true;
    if (/subject|topic/i.test(key)) flags.subject = true;
    if (/message|body|comment|inquiry|enquiry|details/i.test(key) || m[1] === 'textarea')
      flags.message = true;
    if (/type=["']file["']/i.test(attrs) || /attach|upload|file/i.test(key)) flags.attachment = true;
    if (/categor|topic.?select/i.test(key)) flags.category = true;
    if (/country|nation/i.test(key)) flags.country = true;
    if (/linkedin|twitter|facebook|instagram|social/i.test(key)) flags.socialLinks = true;
  }

  return {
    ...flags,
    requiredFields: [...new Set(requiredFields)].slice(0, 40),
    optionalFields: [...new Set(optionalFields)].slice(0, 40),
    rawFields: [...new Set(rawFields)].slice(0, 60),
  };
}

export function detectContactFormAttachments(html: string): ContactFormAttachments {
  const fileInputs = [...html.matchAll(/<input[^>]*type=["']file["'][^>]*>/gi)].map((x) => x[0]);
  const acceptAttr =
    fileInputs
      .map((t) => t.match(/accept=["']([^"']+)["']/i)?.[1])
      .filter(Boolean)
      .join(',') || null;
  const blob = `${html}\n${acceptAttr ?? ''}`.toLowerCase();
  const images = /image\/|\.jpe?g|\.png|\.gif|\.webp|photo/i.test(blob);
  const pdf = /pdf|application\/pdf/i.test(blob);
  const docx = /docx?|msword|officedocument/i.test(blob);
  const zip = /zip|compressed/i.test(blob);
  const mediaKit = /media\s*kit|press\s*kit/i.test(html);
  return {
    images,
    pdf,
    docx,
    zip,
    mediaKit,
    accepted: fileInputs.length > 0 || mediaKit,
    acceptAttr,
  };
}

export function detectContactFormAntiSpam(html: string): ContactFormAntiSpam {
  const hiddenInputs: string[] = [];
  const hiddenRe = /<input[^>]*type=["']hidden["'][^>]*name=["']([^"']+)["'][^>]*>/gi;
  let hm: RegExpExecArray | null;
  while ((hm = hiddenRe.exec(html))) {
    const n = hm[1]!;
    if (/csrf|_wpnonce|nonce|form_id|timestamp/i.test(n)) continue;
    if (isLikelyHoneypot(n, hm[0]) || /honeypot|hp_|bot/i.test(n)) hiddenInputs.push(n);
  }
  const namedHp =
    /name=["'](honeypot|hp|fax|leave.?blank)["']/i.test(html) ||
    /class=["'][^"']*(honeypot|wpcf7-pot)[^"']*["']/i.test(html);
  const turnstile = /cf-turnstile|challenges\.cloudflare\.com\/turnstile/i.test(html);
  const recaptcha = /g-recaptcha|recaptcha\/api|google\.com\/recaptcha/i.test(html);
  const hcaptcha = /h-captcha|hcaptcha\.com/i.test(html);
  const mathCaptcha = /what\s+is\s+\d+\s*[\+\-\*]\s*\d+|math.?captcha|captcha.?math/i.test(html);
  const timeCheck = /time.?check|form.?timer|min.?submit.?time|data-start-time/i.test(html);
  const jsValidation = /novalidate|parsley|jquery\.validate|wpforms-validate|gform_validation/i.test(
    html
  );
  const honeypot = namedHp || hiddenInputs.length > 0;
  const requiresHuman = turnstile || recaptcha || hcaptcha || mathCaptcha;
  return {
    honeypot,
    hiddenInputs: [...new Set(hiddenInputs)].slice(0, 10),
    timeCheck,
    jsValidation,
    turnstile,
    recaptcha,
    hcaptcha,
    mathCaptcha,
    requiresHuman,
  };
}

export function detectContactFormValidation(
  html: string,
  fieldMap: ContactFormFieldMap
): ContactFormValidation {
  const characterLimits: Record<string, number> = {};
  const maxRe = /name=["']([^"']+)["'][^>]*maxlength=["'](\d+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = maxRe.exec(html))) {
    characterLimits[m[1]!] = Number(m[2]);
  }
  const acceptedFormats: string[] = [];
  const accept = html.match(/accept=["']([^"']+)["']/i)?.[1];
  if (accept) acceptedFormats.push(...accept.split(/[,\s]+/).filter(Boolean));
  const fileSize =
    html.match(/(\d+)\s*(kb|mb).*?(file|upload|attachment)/i) ??
    html.match(/max(?:imum)?\s*file\s*size[^0-9]*(\d+)\s*(kb|mb)/i);
  return {
    requiredFields: fieldMap.requiredFields,
    emailPattern: fieldMap.email || /type=["']email["']/i.test(html),
    urlValidation: fieldMap.website || fieldMap.url || /type=["']url["']/i.test(html),
    phonePattern: fieldMap.phone || /type=["']tel["']/i.test(html),
    characterLimits,
    fileSizeLimit: fileSize ? `${fileSize[1]}${fileSize[2]}` : null,
    acceptedFormats: acceptedFormats.slice(0, 20),
  };
}

export function detectContactFormSuccessIndicators(html: string): ContactFormSuccessIndicators {
  const patterns: string[] = [];
  const successMessage =
    /thank\s+you|message\s+(has\s+been\s+)?sent|successfully\s+submitted|we('|"|\s)?ll\s+get\s+back/i.test(
      html
    );
  if (successMessage) patterns.push('success_message');
  const thankYouPage = /thank-?you|confirmation/i.test(html);
  if (thankYouPage) patterns.push('thank_you');
  const confirmationBanner =
    /wpcf7-mail-sent-ok|gform_confirmation|wpforms-confirmation|form-success/i.test(html);
  if (confirmationBanner) patterns.push('confirmation_banner');
  const redirect = /window\.location|meta[^>]+refresh|redirect.?url/i.test(html);
  if (redirect) patterns.push('redirect');
  const formReset = /reset\(\)|form\.reset/i.test(html);
  if (formReset) patterns.push('form_reset');
  const emailConfirmation = /confirmation\s+email|check\s+your\s+(email|inbox)/i.test(html);
  if (emailConfirmation) patterns.push('email_confirmation');
  return {
    successMessage,
    thankYouPage,
    confirmationBanner,
    redirect,
    formReset,
    emailConfirmation,
    patterns,
  };
}

/** Strategy-specific message outlines — never one prompt for every form. */
export function generateContactFormMessage(
  strategy: ContactFormStrategyName,
  businessText?: string | null
): ContactFormMessageTemplate {
  const biz = (businessText ?? 'our business').trim().slice(0, 120);
  switch (strategy) {
    case 'Guest Post':
      return {
        strategy,
        subject: 'Guest post contribution inquiry',
        bodyOutline: `Professional outreach introducing ${biz}, proposed topic angles, author bio, and relevant prior work. Ask about guidelines and editorial fit.`,
        tone: 'professional editorial',
      };
    case 'Business Listing':
      return {
        strategy,
        subject: 'Business listing request',
        bodyOutline: `Concise business summary for ${biz}: what we do, location/audience, website URL, and why the listing helps readers.`,
        tone: 'factual business summary',
      };
    case 'Partnership':
      return {
        strategy,
        subject: 'Partnership / collaboration proposal',
        bodyOutline: `Collaboration proposal for ${biz}: mutual value, audience overlap, and a clear next step for discussion.`,
        tone: 'collaborative',
      };
    case 'Media Request':
      return {
        strategy,
        subject: 'Press / media inquiry',
        bodyOutline: `Press inquiry for ${biz}: story angle, spokesperson availability, and link to media kit if relevant.`,
        tone: 'press inquiry',
      };
    case 'Advertising':
      return {
        strategy,
        subject: 'Advertising / sponsored content inquiry',
        bodyOutline: `Advertising inquiry for ${biz}: campaign goals, budget range placeholder, and request for rates or media kit.`,
        tone: 'commercial inquiry',
      };
    case 'General Outreach':
      return {
        strategy,
        subject: 'Introduction and collaboration interest',
        bodyOutline: `Professional outreach for ${biz}: brief introduction, why we are reaching out, and a polite ask without assuming guest-post acceptance.`,
        tone: 'professional outreach',
      };
    default:
      return {
        strategy: 'Unsupported',
        subject: '',
        bodyOutline: '',
        tone: 'n/a',
      };
  }
}

export function selectContactFormStrategy(params: {
  formIntent: ContactFormIntent;
  fieldMap: ContactFormFieldMap | null;
  attachments: ContactFormAttachments;
  antiSpam: ContactFormAntiSpam;
}): {
  strategy: ContactFormStrategyName;
  reasoning: string;
  suitable: boolean;
} {
  const { formIntent, fieldMap, attachments, antiSpam } = params;

  if (
    formIntent === 'Job Application' ||
    formIntent === 'Newsletter' ||
    formIntent === 'Support' ||
    formIntent === 'Sales' ||
    formIntent === 'Feedback'
  ) {
    return {
      strategy: 'Unsupported',
      reasoning: `${formIntent} form is not suitable for backlink submission`,
      suitable: false,
    };
  }

  if (formIntent === 'Guest Post Submission' || formIntent === 'Write For Us') {
    return {
      strategy: 'Guest Post',
      reasoning: `Form intent ${formIntent} → Guest Post strategy`,
      suitable: true,
    };
  }
  if (formIntent === 'Business Listing') {
    return {
      strategy: 'Business Listing',
      reasoning: 'Business listing contact form',
      suitable: true,
    };
  }
  if (formIntent === 'Partnership') {
    return {
      strategy: 'Partnership',
      reasoning: 'Partnership / collaboration form',
      suitable: true,
    };
  }
  if (formIntent === 'Media Contact') {
    return {
      strategy: 'Media Request',
      reasoning: 'Editorial / media contact — outreach via form (not a failure)',
      suitable: true,
    };
  }
  if (formIntent === 'Advertising' || formIntent === 'Sponsored Post') {
    return {
      strategy: 'Advertising',
      reasoning: `${formIntent} — advertising inquiry strategy`,
      suitable: true,
    };
  }

  const hasCore = Boolean(fieldMap?.email && fieldMap?.message);
  if (!hasCore && !fieldMap?.message) {
    return {
      strategy: 'Unsupported',
      reasoning: 'Contact form missing core outreach fields',
      suitable: false,
    };
  }

  let reasoning = 'General contact form → General Outreach';
  if (!attachments.accepted) {
    reasoning += '; no attachments — message-only package';
  }
  if (antiSpam.requiresHuman) {
    reasoning += '; CAPTCHA present — never auto-solve';
  }
  return {
    strategy: 'General Outreach',
    reasoning,
    suitable: true,
  };
}

function toSieStrategy(name: ContactFormStrategyName): SubmissionStrategyName {
  switch (name) {
    case 'Guest Post':
      return 'Guest Post';
    case 'Business Listing':
    case 'Partnership':
    case 'General Outreach':
    case 'Media Request':
    case 'Advertising':
      return 'Contact Form';
    default:
      return 'Unsupported';
  }
}

export function findContactFormEntryUrl(
  pages: Array<{ url: string; html: string; status?: string }>
): string | null {
  const scored = pages
    .filter((p) => p.status !== 'failed')
    .map((p) => {
      const det = detectContactForm({ html: p.html, url: p.url });
      const intent = classifyContactFormIntent({ html: p.html, url: p.url });
      let score = det.confidence;
      if (/\/(contact|write-for-us|guest-post|get-in-touch)(\/|$|\?)/i.test(p.url)) score += 0.3;
      if (
        ['Guest Post Submission', 'Write For Us', 'Business Listing', 'Partnership'].includes(
          intent.intent
        )
      )
        score += 0.25;
      if (det.detected) score += 0.2;
      return { url: p.url, score };
    })
    .sort((a, b) => b.score - a.score);
  return scored[0] && scored[0].score >= 0.5 ? scored[0].url : null;
}

export function buildContactFormKnowledge(params: {
  homepageUrl: string;
  pages: Array<{ url: string; html: string; status: string; title?: string | null }>;
  businessText?: string | null;
}): ContactFormKnowledge | null {
  let bestSignals: DetectorSignal[] = [];
  let bestConf = 0;
  let detected = false;
  let bestPage = params.pages.find((p) => p.status === 'fetched') ?? {
    url: params.homepageUrl,
    html: '',
    status: 'failed' as const,
  };

  for (const p of params.pages) {
    if (p.status !== 'fetched') continue;
    const d = detectContactForm({ html: p.html, url: p.url });
    if (d.confidence > bestConf) {
      bestConf = d.confidence;
      bestSignals = d.signals;
      detected = d.detected;
      bestPage = p;
    }
  }
  if (!detected && bestConf < 0.5) return null;

  const entryUrl =
    findContactFormEntryUrl(params.pages.filter((p) => p.status === 'fetched')) ?? bestPage.url;
  const entryHtml = params.pages.find((p) => p.url === entryUrl)?.html ?? bestPage.html;
  const platform = detectContactFormPlatform(entryHtml, entryUrl);
  const intent = classifyContactFormIntent({
    html: entryHtml,
    url: entryUrl,
    title: bestPage.title,
  });
  const fieldMap = extractContactFormFieldMap(entryHtml);
  const attachments = detectContactFormAttachments(entryHtml);
  const antiSpam = detectContactFormAntiSpam(entryHtml);
  const validation = detectContactFormValidation(entryHtml, fieldMap);
  const successIndicators = detectContactFormSuccessIndicators(entryHtml);
  const selected = selectContactFormStrategy({
    formIntent: intent.intent,
    fieldMap,
    attachments,
    antiSpam,
  });
  const messageTemplate =
    selected.suitable && selected.strategy !== 'Unsupported'
      ? generateContactFormMessage(selected.strategy, params.businessText)
      : null;

  return {
    detected: true,
    confidence: Math.max(bestConf, platform.confidence * 0.5),
    signals: bestSignals,
    platform: platform.platform,
    platformConfidence: platform.confidence,
    platformVersion: platform.version,
    formIntent: intent.intent,
    formIntentConfidence: intent.confidence,
    entryUrl,
    fieldMap,
    attachments,
    antiSpam,
    validation,
    successIndicators,
    messageTemplate,
    workflow: selected.strategy,
  };
}

export function enrichWithContactFormIntelligence(params: {
  fingerprint: SiteFingerprint;
  pageClassifications: ClassifiedPage[];
  strategy: StrategyPlan;
  pages: Array<{
    url: string;
    html: string;
    status: string;
    depth: number;
    title?: string | null;
  }>;
  homepageUrl: string;
  businessText?: string | null;
  /** Soft-attach when WP/Directory already owns a stronger path */
  softAttachOnly?: boolean;
}): {
  fingerprint: SiteFingerprint;
  pageClassifications: ClassifiedPage[];
  strategy: StrategyPlan;
  contactForm: ContactFormKnowledge | null;
} {
  const knowledge = buildContactFormKnowledge({
    homepageUrl: params.homepageUrl,
    pages: params.pages,
    businessText: params.businessText,
  });

  if (!knowledge) {
    return {
      fingerprint: params.fingerprint,
      pageClassifications: params.pageClassifications,
      strategy: params.strategy,
      contactForm: null,
    };
  }

  const fingerprint: SiteFingerprint = {
    ...params.fingerprint,
    contactForm: knowledge as unknown as Record<string, unknown>,
    hints: {
      ...params.fingerprint.hints,
      formHints: [
        ...new Set([
          ...params.fingerprint.hints.formHints,
          'contact_form',
          knowledge.platform.toLowerCase().replace(/\s+/g, '_'),
        ]),
      ],
      submissionUrlPatterns: [
        ...new Set([
          ...params.fingerprint.hints.submissionUrlPatterns,
          '/contact',
          '/get-in-touch',
        ]),
      ],
    },
  };

  if (params.softAttachOnly) {
    return {
      fingerprint,
      pageClassifications: params.pageClassifications,
      strategy: params.strategy,
      contactForm: knowledge,
    };
  }

  const selected = selectContactFormStrategy({
    formIntent: knowledge.formIntent,
    fieldMap: knowledge.fieldMap,
    attachments: knowledge.attachments,
    antiSpam: knowledge.antiSpam,
  });
  knowledge.workflow = selected.strategy;
  knowledge.messageTemplate =
    selected.suitable && selected.strategy !== 'Unsupported'
      ? generateContactFormMessage(selected.strategy, params.businessText)
      : null;

  const expected: ExpectedIntervention[] = [];
  if (knowledge.antiSpam.requiresHuman) expected.push('CAPTCHA');

  const payloadHints = {
    ...params.strategy.payloadHints,
    fields: knowledge.fieldMap?.requiredFields?.length
      ? knowledge.fieldMap.requiredFields
      : ['name', 'email', 'message'].filter((f) => {
          const map = knowledge.fieldMap;
          if (!map) return true;
          if (f === 'name') return map.name || map.firstName;
          if (f === 'email') return map.email;
          if (f === 'message') return map.message;
          return true;
        }),
    skip: knowledge.antiSpam.honeypot
      ? [
          ...(params.strategy.payloadHints?.skip ?? []),
          'honeypot',
          ...knowledge.antiSpam.hiddenInputs,
        ]
      : params.strategy.payloadHints?.skip,
    fieldMap: knowledge.fieldMap,
    contactFormPlatform: knowledge.platform,
    contactFormIntent: knowledge.formIntent,
    messageTemplate: knowledge.messageTemplate,
    attachments: knowledge.attachments,
    validation: knowledge.validation,
    successIndicators: knowledge.successIndicators,
    antiSpam: knowledge.antiSpam,
    contactFormOutreach:
      selected.strategy === 'General Outreach' || selected.strategy === 'Media Request',
    neverAutoSolveCaptcha: true,
  };

  return {
    fingerprint,
    pageClassifications: params.pageClassifications,
    strategy: {
      chosen: toSieStrategy(selected.strategy),
      reasoning: selected.reasoning,
      entryUrl: knowledge.entryUrl,
      expectedInterventions: expected,
      fallbacks: params.strategy.fallbacks,
      contactFormStrategy: selected.strategy,
      payloadHints,
    },
    contactForm: knowledge,
  };
}

export function emptyContactFormLearning(): ContactFormLearning {
  return {
    platform: null,
    successfulStrategy: null,
    requiredFields: [],
    attachmentSupport: null,
    validationRules: [],
    averageSubmissionTimeMs: null,
    successRate: null,
    failures: [],
    knownSelectors: [],
    submissionUrl: null,
    knownSuccessIndicators: [],
  };
}

export function recordContactFormLearning(
  prev: ContactFormLearning | null | undefined,
  update: Partial<ContactFormLearning> & { failureReason?: string }
): ContactFormLearning {
  const base = prev ?? emptyContactFormLearning();
  const next: ContactFormLearning = { ...base, ...update, failures: base.failures };
  if (update.failureReason) {
    next.failures = [
      { at: new Date().toISOString(), reason: update.failureReason },
      ...base.failures,
    ].slice(0, 20);
  }
  delete (next as { failureReason?: string }).failureReason;
  return next;
}

export function summarizeContactFormHealth(
  profiles: Array<{
    fingerprint?: { contactForm?: ContactFormKnowledge | Record<string, unknown> };
    strategy?: {
      contactFormStrategy?: string;
      chosen?: string;
      expectedInterventions?: string[];
      payloadHints?: { needsReview?: boolean };
    };
    learning?: { contactForm?: ContactFormLearning };
  }>
) {
  const forms = profiles.filter((p) => {
    const c = p.fingerprint?.contactForm as ContactFormKnowledge | undefined;
    return Boolean(c && (c as ContactFormKnowledge).detected);
  });
  let supported = 0;
  let unsupported = 0;
  let captcha = 0;
  let manualReview = 0;
  let successSum = 0;
  let successN = 0;
  let timeSum = 0;
  let timeN = 0;
  let successful = 0;
  let failed = 0;

  for (const p of forms) {
    const c = p.fingerprint!.contactForm as ContactFormKnowledge;
    const strat = p.strategy?.contactFormStrategy ?? c.workflow ?? p.strategy?.chosen;
    if (strat === 'Unsupported' || c.workflow === 'Unsupported') unsupported++;
    else supported++;
    if (
      c.antiSpam?.requiresHuman ||
      (p.strategy?.expectedInterventions ?? []).includes('CAPTCHA')
    )
      captcha++;
    if (p.strategy?.payloadHints?.needsReview) manualReview++;
    const rate = p.learning?.contactForm?.successRate;
    if (rate != null) {
      successSum += rate;
      successN++;
      if (rate >= 0.5) successful++;
      else failed++;
    }
    const t = p.learning?.contactForm?.averageSubmissionTimeMs;
    if (t != null) {
      timeSum += t;
      timeN++;
    }
  }

  return {
    detected: forms.length,
    supported,
    unsupported,
    successful,
    failed,
    captcha,
    manualReview,
    averageCompletionTimeMs: timeN > 0 ? Math.round(timeSum / timeN) : null,
    successRate: successN > 0 ? Math.round((successSum / successN) * 10) / 10 : null,
  };
}

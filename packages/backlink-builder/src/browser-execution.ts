/** BEE — Execution planner, form intelligence, asset mapping (domain logic) */

export type ExecutionStepAction =
  | 'open'
  | 'login'
  | 'navigate'
  | 'analyze_form'
  | 'fill'
  | 'select'
  | 'upload'
  | 'upload_logo'
  | 'upload_images'
  | 'upload_videos'
  | 'preview'
  | 'wait_approval'
  | 'submit'
  | 'verify'
  | 'screenshot';

export type ExecutionGate =
  | 'login'
  | 'captcha'
  | 'mfa'
  | 'email_verify'
  | 'phone_verify'
  | 'human_approval'
  | null;

export interface ExecutionPlanStep {
  stepIndex: number;
  action: ExecutionStepAction;
  detail: Record<string, unknown>;
  requiresUser: boolean;
  blocker?: ExecutionGate;
  selectorHint?: string;
}

export interface DetectedFormControl {
  name: string;
  type: string;
  required: boolean;
  placeholder?: string;
  maxLength?: number;
  options?: string[];
}

export interface FormIntelligenceResult {
  controls: DetectedFormControl[];
  requiredFields: string[];
  validationHints: string[];
  hasRichEditor: boolean;
  hasFileUpload: boolean;
  hasImageUpload: boolean;
  hasVideoUpload: boolean;
  metricsSource: 'estimated' | 'live';
  gates: {
    login: boolean;
    captcha: boolean;
    mfa: boolean;
    emailVerify: boolean;
    phoneVerify: boolean;
  };
}

export interface AssetMapping {
  businessName?: string;
  company?: string;
  description?: string;
  keywords?: string[];
  categories?: string[];
  tags?: string[];
  anchorText?: string;
  landingPage?: string;
  logoUrl?: string;
  imageUrls?: string[];
  videoUrls?: string[];
  socialUrls?: Record<string, string>;
  phone?: string;
  address?: string;
  email?: string;
  overrides?: Record<string, unknown>;
}

const FIELD_ALIASES: Record<string, keyof AssetMapping | 'businessName'> = {
  business_name: 'businessName',
  businessname: 'businessName',
  company: 'company',
  company_name: 'company',
  name: 'businessName',
  title: 'businessName',
  description: 'description',
  about: 'description',
  bio: 'description',
  keywords: 'keywords',
  tags: 'tags',
  category: 'categories',
  categories: 'categories',
  website: 'landingPage',
  url: 'landingPage',
  landing: 'landingPage',
  anchor: 'anchorText',
  anchor_text: 'anchorText',
  email: 'email',
  phone: 'phone',
  telephone: 'phone',
  address: 'address',
  logo: 'logoUrl',
};

export function detectFormIntelligence(htmlSnippet?: string): FormIntelligenceResult {
  const html = (htmlSnippet ?? '').toLowerCase();
  const metricsSource: 'estimated' | 'live' = htmlSnippet ? 'live' : 'estimated';
  const controls: DetectedFormControl[] = [];
  const requiredFields: string[] = [];

  const inputRe = /<input([^>]+)>/gi;
  let m: RegExpExecArray | null;
  while ((m = inputRe.exec(htmlSnippet ?? '')) !== null) {
    const attrs = m[1];
    const name = /name=["']([^"']+)["']/i.exec(attrs)?.[1] ?? '';
    const type = /type=["']([^"']+)["']/i.exec(attrs)?.[1] ?? 'text';
    const required = /\brequired\b/i.test(attrs);
    const placeholder = /placeholder=["']([^"']+)["']/i.exec(attrs)?.[1];
    const maxLength = Number(/maxlength=["'](\d+)["']/i.exec(attrs)?.[1] ?? 0) || undefined;
    if (!name && type === 'hidden') continue;
    controls.push({
      name: name || type,
      type,
      required,
      placeholder,
      maxLength,
    });
    if (required && name) requiredFields.push(name);
  }

  const textareaRe = /<textarea([^>]*)>/gi;
  while ((m = textareaRe.exec(htmlSnippet ?? '')) !== null) {
    const attrs = m[1];
    const name = /name=["']([^"']+)["']/i.exec(attrs)?.[1] ?? 'textarea';
    const required = /\brequired\b/i.test(attrs);
    controls.push({ name, type: 'textarea', required });
    if (required) requiredFields.push(name);
  }

  const selectRe = /<select([^>]*)>/gi;
  while ((m = selectRe.exec(htmlSnippet ?? '')) !== null) {
    const attrs = m[1];
    const name = /name=["']([^"']+)["']/i.exec(attrs)?.[1] ?? 'select';
    controls.push({ name, type: 'select', required: /\brequired\b/i.test(attrs) });
  }

  const gates = {
    login: /login|sign[\s-]?in|password/i.test(html),
    captcha: /captcha|recaptcha|hcaptcha|turnstile/i.test(html),
    mfa: /mfa|2fa|two[\s-]?factor|otp|authenticator/i.test(html),
    emailVerify: /verify your email|email verification|confirm your email/i.test(html),
    phoneVerify: /verify.*(phone|sms)|sms code|phone verification/i.test(html),
  };

  const validationHints: string[] = [];
  if (/aria-invalid|error|invalid/i.test(html)) validationHints.push('Page contains validation error markers');

  return {
    controls,
    requiredFields,
    validationHints,
    hasRichEditor: /contenteditable|tinymce|ckeditor|quill|draft-js/i.test(html),
    hasFileUpload: /type=["']file["']/i.test(html),
    hasImageUpload: /accept=["'][^"']*image/i.test(html) || /upload.*image|logo/i.test(html),
    hasVideoUpload: /accept=["'][^"']*video/i.test(html) || /upload.*video/i.test(html),
    metricsSource,
    gates,
  };
}

export function buildExecutionPlan(input: {
  url: string;
  opportunityType: string;
  form?: FormIntelligenceResult;
  profile?: {
    loginUrl?: string | null;
    submissionUrl?: string | null;
    requiredAssets?: unknown[];
  };
  requireApproval?: boolean;
}): ExecutionPlanStep[] {
  const form = input.form ?? detectFormIntelligence();
  const steps: ExecutionPlanStep[] = [];
  let i = 0;
  const push = (
    action: ExecutionStepAction,
    detail: Record<string, unknown>,
    opts: { requiresUser?: boolean; blocker?: ExecutionGate; selectorHint?: string } = {}
  ) => {
    steps.push({
      stepIndex: i++,
      action,
      detail,
      requiresUser: opts.requiresUser ?? false,
      blocker: opts.blocker ?? null,
      selectorHint: opts.selectorHint,
    });
  };

  push('open', { url: input.url }, { requiresUser: false });
  push('screenshot', { label: 'page_loaded' });

  if (form.gates.login || input.profile?.loginUrl) {
    push(
      'login',
      { loginUrl: input.profile?.loginUrl ?? null, message: 'User must authenticate — never bypassed' },
      { requiresUser: true, blocker: 'login' }
    );
    push('screenshot', { label: 'login' });
  }

  push('navigate', {
    url: input.profile?.submissionUrl ?? input.url,
    opportunityType: input.opportunityType,
  });
  push('analyze_form', { detect: true });
  push('screenshot', { label: 'form_ready' });

  push('fill', { targets: ['businessName', 'company', 'description', 'email', 'phone', 'address'] });
  push('select', { targets: ['categories', 'tags'] });
  push('fill', { targets: ['keywords', 'anchorText', 'landingPage', 'socialUrls'] });

  if (form.hasImageUpload || form.hasFileUpload) {
    push('upload_logo', { field: 'logo' }, { requiresUser: false });
    push('upload_images', { field: 'images' });
  }
  if (form.hasVideoUpload) {
    push('upload_videos', { field: 'videos' });
  }

  push('preview', { message: 'Review filled form before submit' }, { requiresUser: true });
  push('screenshot', { label: 'before_submit' });

  if (form.gates.captcha) {
    push(
      'wait_approval',
      { reason: 'captcha', message: 'Complete CAPTCHA manually — never bypassed' },
      { requiresUser: true, blocker: 'captcha' }
    );
  }
  if (form.gates.mfa) {
    push(
      'wait_approval',
      { reason: 'mfa', message: 'Complete MFA manually — never bypassed' },
      { requiresUser: true, blocker: 'mfa' }
    );
  }
  if (form.gates.emailVerify) {
    push(
      'wait_approval',
      { reason: 'email_verify', message: 'Complete email verification — never bypassed' },
      { requiresUser: true, blocker: 'email_verify' }
    );
  }
  if (form.gates.phoneVerify) {
    push(
      'wait_approval',
      { reason: 'phone_verify', message: 'Complete phone verification — never bypassed' },
      { requiresUser: true, blocker: 'phone_verify' }
    );
  }

  const requireApproval = input.requireApproval !== false;
  if (requireApproval) {
    push(
      'wait_approval',
      { reason: 'human_approval', message: 'User must approve submission' },
      { requiresUser: true, blocker: 'human_approval' }
    );
  }

  push('submit', { message: 'Submit only after authorization' }, { requiresUser: !requireApproval });
  push('screenshot', { label: 'after_submit' });
  push('verify', { enqueue: true });
  push('screenshot', { label: 'completion' });

  return steps;
}

export function mapAssetsToFields(
  assets: AssetMapping,
  controls: DetectedFormControl[],
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};
  const merged: AssetMapping = { ...assets, ...((overrides.assets as AssetMapping) ?? {}) };

  for (const control of controls) {
    const key = control.name.toLowerCase().replace(/[\[\]]/g, '');
    const alias = FIELD_ALIASES[key];
    if (alias && merged[alias] != null) {
      mapped[control.name] = merged[alias];
      continue;
    }
    if (overrides[control.name] != null) {
      mapped[control.name] = overrides[control.name];
    }
  }

  // Always expose canonical keys for workers
  mapped.__canonical = {
    businessName: merged.businessName ?? merged.company,
    description: merged.description,
    keywords: merged.keywords,
    categories: merged.categories,
    anchorText: merged.anchorText,
    landingPage: merged.landingPage,
    logoUrl: merged.logoUrl,
    imageUrls: merged.imageUrls,
    videoUrls: merged.videoUrls,
    email: merged.email,
    phone: merged.phone,
    address: merged.address,
    socialUrls: merged.socialUrls,
  };

  return { ...mapped, ...overrides };
}

/** Job statuses including watcher / auto-resume lifecycle (DB CHECK in 081). */
export const EXECUTION_JOB_STATUSES = [
  'queued',
  'preparing',
  'launching_browser',
  'authenticating',
  'navigating',
  'analyzing_form',
  'uploading_assets',
  'filling_fields',
  'validating',
  'ready_for_review',
  'awaiting_user',
  'submitting',
  'waiting_verification',
  'completed',
  'failed',
  'cancelled',
  'retry_scheduled',
  'paused',
  'needs_approval',
  'blocked_captcha',
  'blocked_mfa',
  'blocked_email_verify',
  'blocked_phone_verify',
  'watching',
  'watching_captcha',
  'watching_login',
  'watching_mfa',
  'watching_email',
  'watching_phone',
  'ready_to_continue',
  'submitted',
  'verified',
] as const;

export type ExecutionJobStatus = (typeof EXECUTION_JOB_STATUSES)[number];

export function gateStatusFromBlocker(blocker: ExecutionGate): string | null {
  switch (blocker) {
    case 'captcha':
      return 'blocked_captcha';
    case 'mfa':
      return 'blocked_mfa';
    case 'email_verify':
      return 'blocked_email_verify';
    case 'phone_verify':
      return 'blocked_phone_verify';
    case 'login':
    case 'human_approval':
      return 'needs_approval';
    default:
      return null;
  }
}

/** After blocked_* is recorded, transition into watching_* for auto-resume polling. */
export function watchingStatusFromBlocker(blocker: ExecutionGate): string | null {
  switch (blocker) {
    case 'captcha':
      return 'watching_captcha';
    case 'login':
      return 'watching_login';
    case 'mfa':
      return 'watching_mfa';
    case 'email_verify':
      return 'watching_email';
    case 'phone_verify':
      return 'watching_phone';
    default:
      return null;
  }
}

export function isWatchableGate(blocker: ExecutionGate): boolean {
  return (
    blocker === 'captcha' ||
    blocker === 'login' ||
    blocker === 'mfa' ||
    blocker === 'email_verify' ||
    blocker === 'phone_verify'
  );
}

export function redactFormValues(values: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const secretRe = /password|token|secret|cookie|credential|otp|mfa/i;
  for (const [k, v] of Object.entries(values)) {
    if (secretRe.test(k)) {
      out[k] = '[REDACTED]';
    } else if (typeof v === 'string' && v.length > 500) {
      out[k] = `${v.slice(0, 500)}…`;
    } else {
      out[k] = v;
    }
  }
  return out;
}

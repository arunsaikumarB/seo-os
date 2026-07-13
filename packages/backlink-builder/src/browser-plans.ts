/** Browser action plan builder — never bypasses CAPTCHA/login */

export interface BrowserPlanStep {
  order: number;
  action: string;
  detail: string;
  requiresUser: boolean;
  blocker?: 'login' | 'captcha' | 'email_verify' | null;
}

export interface BrowserActionPlanResult {
  steps: BrowserPlanStep[];
  blockers: Array<{ type: string; message: string }>;
  detectedForm: Record<string, unknown>;
  metricsSource: 'estimated' | 'live';
  mode: 'action_plan';
}

export function buildBrowserActionPlan(input: {
  url: string;
  opportunityType: string;
  prefill: Record<string, unknown>;
  htmlSnippet?: string;
  loginRequired?: boolean;
  captchaRequired?: boolean;
  emailVerifyRequired?: boolean;
}): BrowserActionPlanResult {
  const html = (input.htmlSnippet ?? '').toLowerCase();
  let metricsSource: 'estimated' | 'live' = input.htmlSnippet ? 'live' : 'estimated';

  const loginRequired =
    input.loginRequired ||
    html.includes('login') ||
    html.includes('sign in') ||
    html.includes('password');
  const captchaRequired =
    input.captchaRequired ||
    html.includes('captcha') ||
    html.includes('recaptcha') ||
    html.includes('hcaptcha');
  const emailVerifyRequired =
    input.emailVerifyRequired ||
    html.includes('verify your email') ||
    html.includes('email verification');

  const formFields: string[] = [];
  const inputRegex = /<input[^>]+name=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = inputRegex.exec(html)) !== null) {
    formFields.push(m[1]);
  }

  const steps: BrowserPlanStep[] = [
    {
      order: 1,
      action: 'Open submission URL',
      detail: input.url,
      requiresUser: true,
    },
  ];

  if (loginRequired) {
    steps.push({
      order: steps.length + 1,
      action: 'Sign in',
      detail: 'Log in with your account on the third-party site. SEO OS will not store or bypass credentials.',
      requiresUser: true,
      blocker: 'login',
    });
  }

  steps.push({
    order: steps.length + 1,
    action: 'Locate submission form',
    detail:
      formFields.length > 0
        ? `Detected fields: ${formFields.slice(0, 12).join(', ')}`
        : `Locate the ${input.opportunityType.replace(/_/g, ' ')} submission form on the page.`,
    requiresUser: true,
  });

  steps.push({
    order: steps.length + 1,
    action: 'Fill prepared fields',
    detail: `Use Submission Preview values: ${Object.keys(input.prefill).slice(0, 10).join(', ')}`,
    requiresUser: true,
  });

  if (captchaRequired) {
    steps.push({
      order: steps.length + 1,
      action: 'Complete CAPTCHA',
      detail: 'Solve CAPTCHA manually. Automated bypass is never performed.',
      requiresUser: true,
      blocker: 'captcha',
    });
  }

  if (emailVerifyRequired) {
    steps.push({
      order: steps.length + 1,
      action: 'Confirm email verification',
      detail: 'Check your inbox and confirm any verification link the site sends.',
      requiresUser: true,
      blocker: 'email_verify',
    });
  }

  steps.push({
    order: steps.length + 1,
    action: 'Submit and record status',
    detail: 'Submit on the third-party site, then mark Submitted in Submission Center.',
    requiresUser: true,
  });

  const blockers: Array<{ type: string; message: string }> = [];
  if (loginRequired) blockers.push({ type: 'login', message: 'Login required before submission' });
  if (captchaRequired) blockers.push({ type: 'captcha', message: 'CAPTCHA must be completed by user' });
  if (emailVerifyRequired)
    blockers.push({ type: 'email_verify', message: 'Email verification likely required' });

  return {
    steps,
    blockers,
    detectedForm: {
      url: input.url,
      fields: formFields,
      opportunityType: input.opportunityType,
    },
    metricsSource,
    mode: 'action_plan',
  };
}

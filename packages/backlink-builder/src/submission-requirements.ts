/** Detect submission requirements from opportunity type + optional HTML */

export interface SubmissionRequirementsResult {
  requiredFields: string[];
  categories: string[];
  mediaRequirements: {
    images: boolean;
    videos: boolean;
    imageNotes?: string;
    videoNotes?: string;
  };
  businessDetails: string[];
  descriptions: string[];
  keywords: boolean;
  anchorText: boolean;
  contactDetails: string[];
  loginRequired: boolean;
  captchaRequired: boolean;
  emailVerifyRequired: boolean;
  detectedFields: Record<string, unknown>;
  metricsSource: 'estimated' | 'live';
}

const BY_TYPE: Record<string, Partial<SubmissionRequirementsResult>> = {
  guest_post: {
    requiredFields: ['seoTitle', 'body', 'bio', 'anchorText', 'targetUrl', 'authorName', 'authorEmail'],
    descriptions: ['shortBio', 'authorBio'],
    keywords: true,
    anchorText: true,
    mediaRequirements: { images: true, videos: false, imageNotes: 'Featured image often required' },
    contactDetails: ['authorEmail'],
  },
  directory: {
    requiredFields: ['businessName', 'website', 'shortDescription', 'longDescription', 'category', 'email', 'phone'],
    categories: ['business', 'local', 'industry'],
    businessDetails: ['businessName', 'address', 'phone', 'hours'],
    descriptions: ['shortDescription', 'longDescription'],
    contactDetails: ['email', 'phone'],
    mediaRequirements: { images: true, videos: false, imageNotes: 'Logo often required' },
  },
  profile: {
    requiredFields: ['displayName', 'website', 'bio', 'avatar'],
    descriptions: ['bio'],
    contactDetails: ['email'],
    mediaRequirements: { images: true, videos: false },
  },
  forum: {
    requiredFields: ['title', 'body', 'username'],
    loginRequired: true,
    captchaRequired: true,
  },
  qa_site: {
    requiredFields: ['questionOrAnswer', 'body'],
    loginRequired: true,
  },
  press_release: {
    requiredFields: ['headline', 'body', 'boilerplate', 'mediaContact', 'anchorText'],
    contactDetails: ['mediaContact'],
    keywords: true,
    anchorText: true,
  },
  resource_page: {
    requiredFields: ['resourceTitle', 'resourceUrl', 'description', 'anchorText'],
    descriptions: ['description'],
    anchorText: true,
  },
  broken_link: {
    requiredFields: ['brokenUrl', 'replacementUrl', 'anchorText', 'outreachEmail'],
    anchorText: true,
    contactDetails: ['outreachEmail'],
  },
};

export function detectSubmissionRequirements(
  opportunityType: string,
  opts: { htmlSnippet?: string; url?: string } = {}
): SubmissionRequirementsResult {
  const base = BY_TYPE[opportunityType] ?? {
    requiredFields: ['businessName', 'website', 'description', 'email'],
    descriptions: ['description'],
    contactDetails: ['email'],
  };

  let loginRequired = Boolean(base.loginRequired);
  let captchaRequired = Boolean(base.captchaRequired);
  let emailVerifyRequired = Boolean(base.emailVerifyRequired);
  let metricsSource: 'estimated' | 'live' = 'estimated';

  const html = (opts.htmlSnippet ?? '').toLowerCase();
  if (html) {
    metricsSource = 'live';
    if (html.includes('captcha') || html.includes('recaptcha') || html.includes('hcaptcha')) {
      captchaRequired = true;
    }
    if (html.includes('login') || html.includes('sign in') || html.includes('password')) {
      loginRequired = true;
    }
    if (html.includes('verify your email') || html.includes('email verification')) {
      emailVerifyRequired = true;
    }
  }

  return {
    requiredFields: base.requiredFields ?? [],
    categories: base.categories ?? [],
    mediaRequirements: base.mediaRequirements ?? { images: false, videos: false },
    businessDetails: base.businessDetails ?? [],
    descriptions: base.descriptions ?? [],
    keywords: base.keywords ?? false,
    anchorText: base.anchorText ?? false,
    contactDetails: base.contactDetails ?? [],
    loginRequired,
    captchaRequired,
    emailVerifyRequired,
    detectedFields: {
      opportunityType,
      url: opts.url ?? null,
      analyzer: metricsSource === 'live' ? 'html_heuristic_v11' : 'type_template_v11',
    },
    metricsSource,
  };
}

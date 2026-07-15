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
  contentLengthHints?: { minWords?: number; maxWords?: number };
  imageDimensions?: string[];
  acceptedFormats?: string[];
  anchorRules?: string[];
}

const BY_TYPE: Record<string, Partial<SubmissionRequirementsResult>> = {
  guest_post: {
    requiredFields: [
      'seoTitle',
      'slug',
      'metaTitle',
      'metaDescription',
      'excerpt',
      'body',
      'authorBio',
      'anchorText',
      'targetUrl',
      'featuredImage',
      'altText',
      'faq',
      'cta',
    ],
    descriptions: ['excerpt', 'authorBio'],
    keywords: true,
    anchorText: true,
    mediaRequirements: { images: true, videos: false, imageNotes: 'Featured image often required' },
    contactDetails: ['authorEmail'],
    contentLengthHints: { minWords: 800, maxWords: 1800 },
    acceptedFormats: ['docx', 'html', 'md'],
    anchorRules: ['natural placement', 'one primary branded anchor'],
  },
  directory: {
    requiredFields: [
      'businessName',
      'businessDescription',
      'shortDescription',
      'longDescription',
      'category',
      'address',
      'phone',
      'email',
      'website',
      'businessHours',
      'logo',
      'socialLinks',
      'metaDescription',
      'keywords',
    ],
    categories: ['business', 'local', 'industry'],
    businessDetails: ['businessName', 'address', 'phone', 'hours', 'logo'],
    descriptions: ['shortDescription', 'longDescription', 'businessDescription'],
    contactDetails: ['email', 'phone'],
    keywords: true,
    mediaRequirements: { images: true, videos: false, imageNotes: 'Logo often required' },
    imageDimensions: ['512x512', '200x200'],
    acceptedFormats: ['png', 'jpg', 'webp'],
  },
  profile: {
    requiredFields: [
      'displayName',
      'about',
      'services',
      'founder',
      'website',
      'socialLinks',
      'logo',
      'coverImage',
      'bio',
    ],
    descriptions: ['about', 'bio'],
    contactDetails: ['email'],
    mediaRequirements: { images: true, videos: false, imageNotes: 'Logo + cover image' },
    imageDimensions: ['400x400', '1200x400'],
  },
  forum: {
    requiredFields: ['title', 'discussionOpener', 'helpfulReply', 'anchorText', 'references'],
    loginRequired: true,
    captchaRequired: true,
    anchorText: true,
    contentLengthHints: { minWords: 80, maxWords: 400 },
  },
  qa_site: {
    requiredFields: ['question', 'answer', 'supportingExplanation', 'referenceLinks'],
    loginRequired: true,
    anchorText: true,
    contentLengthHints: { minWords: 100, maxWords: 600 },
  },
  press_release: {
    requiredFields: [
      'headline',
      'subheading',
      'body',
      'quotes',
      'boilerplate',
      'mediaContact',
      'mediaAssets',
      'anchorText',
    ],
    contactDetails: ['mediaContact'],
    keywords: true,
    anchorText: true,
    mediaRequirements: { images: true, videos: false },
    contentLengthHints: { minWords: 300, maxWords: 900 },
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
  citation: {
    requiredFields: [
      'businessName',
      'website',
      'address',
      'phone',
      'email',
      'shortDescription',
      'category',
    ],
    businessDetails: ['businessName', 'address', 'phone'],
    contactDetails: ['email', 'phone'],
    mediaRequirements: { images: true, videos: false },
  },
  digital_pr: {
    requiredFields: ['headline', 'body', 'boilerplate', 'mediaContact'],
    contactDetails: ['mediaContact'],
    keywords: true,
  },
  web2: {
    requiredFields: ['seoTitle', 'body', 'tags', 'featuredImage'],
    keywords: true,
    mediaRequirements: { images: true, videos: false },
  },
  article_submission: {
    requiredFields: [
      'title',
      'seoHeading',
      'subheadings',
      'introduction',
      'body',
      'conclusion',
      'references',
      'metaTags',
      'internalLinks',
      'anchorText',
    ],
    keywords: true,
    anchorText: true,
    contentLengthHints: { minWords: 600, maxWords: 1500 },
  },
  video: {
    requiredFields: [
      'videoTitle',
      'videoDescription',
      'tags',
      'thumbnail',
      'transcript',
      'chapters',
      'seoKeywords',
    ],
    mediaRequirements: {
      images: true,
      videos: true,
      videoNotes: 'Upload video or host URL + thumbnail',
      imageNotes: 'Thumbnail required',
    },
    keywords: true,
    acceptedFormats: ['mp4', 'mov', 'webm'],
  },
  podcast: {
    requiredFields: ['episodeTitle', 'description', 'tags', 'audioUrl', 'showNotes'],
    mediaRequirements: { images: true, videos: false, imageNotes: 'Cover art' },
    keywords: true,
  },
  infographic: {
    requiredFields: [
      'infographicTitle',
      'summary',
      'altText',
      'source',
      'keywords',
      'description',
      'imageFile',
    ],
    mediaRequirements: {
      images: true,
      videos: false,
      imageNotes: 'Infographic image required',
    },
    keywords: true,
    imageDimensions: ['800x2000', '1200x3000'],
    acceptedFormats: ['png', 'jpg', 'svg', 'pdf'],
  },
  image_submission: {
    requiredFields: [
      'imageTitle',
      'imageCaption',
      'imageDescription',
      'altText',
      'seoFilename',
      'tags',
      'category',
      'sourceUrl',
      'imageFile',
    ],
    mediaRequirements: { images: true, videos: false },
    keywords: true,
    acceptedFormats: ['jpg', 'png', 'webp', 'gif'],
  },
  pdf: {
    requiredFields: ['documentTitle', 'description', 'tags', 'fileUpload', 'author'],
    descriptions: ['description'],
    keywords: true,
    acceptedFormats: ['pdf'],
  },
};

/** Map classification / storage aliases onto requirement templates */
const TYPE_ALIASES: Record<string, string> = {
  business_directory: 'directory',
  directory_submission: 'directory',
  local_citation: 'citation',
  company_listing: 'directory',
  business_profile: 'profile',
  profile_creation: 'profile',
  article_submission: 'article_submission',
  blog_submission: 'guest_post',
  image_submission: 'image_submission',
  infographic_submission: 'infographic',
  video_submission: 'video',
  podcast_submission: 'podcast',
  forum_posting: 'forum',
  community: 'forum',
  qa_website: 'qa_site',
  press_release: 'press_release',
  saas_directory: 'directory',
  startup_directory: 'directory',
  niche_directory: 'directory',
  product_listing: 'directory',
  marketplace_listing: 'directory',
};

export function detectSubmissionRequirements(
  opportunityType: string,
  opts: { htmlSnippet?: string; url?: string } = {}
): SubmissionRequirementsResult {
  const resolved = TYPE_ALIASES[opportunityType] ?? opportunityType;
  const base = BY_TYPE[resolved] ?? {
    requiredFields: ['businessName', 'website', 'description', 'email'],
    descriptions: ['description'],
    contactDetails: ['email'],
  };

  let loginRequired = Boolean(base.loginRequired);
  let captchaRequired = Boolean(base.captchaRequired);
  let emailVerifyRequired = Boolean(base.emailVerifyRequired);
  let metricsSource: 'estimated' | 'live' = 'estimated';
  const extraFields: string[] = [];

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
    if (html.includes('write for us') || html.includes('guest post') || html.includes('submit article')) {
      extraFields.push('seoTitle', 'body', 'authorBio');
    }
    if (html.includes('add listing') || html.includes('submit business') || html.includes('company directory')) {
      extraFields.push('businessName', 'shortDescription', 'category', 'logo');
    }
    if (html.includes('upload image') || html.includes('type="file"') || html.includes('accept="image')) {
      extraFields.push('imageFile', 'altText');
    }
    if (html.includes('upload video') || html.includes('accept="video')) {
      extraFields.push('videoFile', 'videoTitle', 'thumbnail');
    }
    if (html.includes('create profile') || html.includes('business listing')) {
      extraFields.push('displayName', 'about', 'logo');
    }
  }

  return {
    requiredFields: [...new Set([...(base.requiredFields ?? []), ...extraFields])],
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
    contentLengthHints: base.contentLengthHints,
    imageDimensions: base.imageDimensions,
    acceptedFormats: base.acceptedFormats,
    anchorRules: base.anchorRules,
    detectedFields: {
      opportunityType,
      resolvedType: resolved,
      url: opts.url ?? null,
      analyzer: metricsSource === 'live' ? 'html_heuristic_v11' : 'type_template_v11',
      extraFieldsFromHtml: extraFields,
    },
    metricsSource,
  };
}

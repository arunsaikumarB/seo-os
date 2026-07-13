/** Image Intelligence Engine — prompt, quality, metadata, style (domain) */

export const IMAGE_TYPES = [
  'blog_hero',
  'featured_image',
  'website_banner',
  'business_banner',
  'open_graph',
  'twitter_card',
  'linkedin_banner',
  'facebook_cover',
  'instagram_post',
  'instagram_story',
  'pinterest_pin',
  'directory_logo',
  'company_logo',
  'infographic',
  'feature_graphic',
  'workflow_diagram',
  'comparison_chart',
  'product_showcase',
  'technology_illustration',
  'restaurant_illustration',
  'team_illustration',
  'author_avatar',
  'guest_post_banner',
  'thumbnail',
] as const;

export type ImageType = (typeof IMAGE_TYPES)[number];

export const IMAGE_SIZES: Record<string, { w: number; h: number }> = {
  '1200x630': { w: 1200, h: 630 },
  '1600x900': { w: 1600, h: 900 },
  '1920x1080': { w: 1920, h: 1080 },
  '1080x1080': { w: 1080, h: 1080 },
  '1080x1920': { w: 1080, h: 1920 },
  '1000x1500': { w: 1000, h: 1500 },
  '512x512': { w: 512, h: 512 },
  '1280x720': { w: 1280, h: 720 },
};

export const DEFAULT_SIZE_FOR_TYPE: Partial<Record<ImageType, string>> = {
  blog_hero: '1600x900',
  featured_image: '1200x630',
  open_graph: '1200x630',
  twitter_card: '1200x630',
  linkedin_banner: '1920x1080',
  facebook_cover: '1920x1080',
  instagram_post: '1080x1080',
  instagram_story: '1080x1920',
  pinterest_pin: '1000x1500',
  directory_logo: '512x512',
  company_logo: '512x512',
  thumbnail: '1280x720',
  guest_post_banner: '1200x630',
};

export interface DomainStyleProfileInput {
  domain: string;
  brandName: string;
  industry?: string;
  audience?: string;
  brandTone?: string;
  keywords?: string[];
  competitors?: string[];
  products?: string[];
  services?: string[];
  logoUrl?: string;
}

export interface DomainStyleProfile {
  brandColors: string[];
  fonts: string[];
  mood: string;
  photographyStyle: string;
  illustrationStyle: string;
  lighting: string;
  theme: string;
  industry: string;
  audience: string;
  brandTone: string;
  products: string[];
  services: string[];
  keywords: string[];
  competitors: string[];
  logoUrl?: string;
  metricsSource: 'estimated';
  confidence: number;
}

const INDUSTRY_STYLES: Record<string, Partial<DomainStyleProfile>> = {
  restaurant: {
    brandColors: ['#7c2d12', '#fef3c7', '#1c1917'],
    mood: 'warm appetizing',
    photographyStyle: 'food photography',
    lighting: 'soft natural window light',
  },
  saas: {
    brandColors: ['#0f766e', '#ecfdf5', '#134e4a'],
    mood: 'clean modern',
    photographyStyle: 'product UI mockup',
    lighting: 'studio softbox',
  },
  healthcare: {
    brandColors: ['#0369a1', '#f0f9ff', '#0c4a6e'],
    mood: 'calm trustworthy',
    photographyStyle: 'clinical editorial',
    lighting: 'bright even',
  },
  default: {
    brandColors: ['#0f766e', '#f8fafc', '#134e4a'],
    mood: 'professional',
    photographyStyle: 'editorial',
    lighting: 'balanced',
  },
};

export function buildDomainStyleProfile(input: DomainStyleProfileInput): DomainStyleProfile {
  const industry = (input.industry ?? 'general').toLowerCase();
  const base =
    INDUSTRY_STYLES[industry] ??
    (industry.includes('restaurant') || industry.includes('food')
      ? INDUSTRY_STYLES.restaurant
      : industry.includes('saas') || industry.includes('software')
        ? INDUSTRY_STYLES.saas
        : industry.includes('health')
          ? INDUSTRY_STYLES.healthcare
          : INDUSTRY_STYLES.default);

  return {
    brandColors: base.brandColors ?? INDUSTRY_STYLES.default.brandColors!,
    fonts: ['Georgia', 'system-ui'],
    mood: base.mood ?? 'professional',
    photographyStyle: base.photographyStyle ?? 'editorial',
    illustrationStyle: 'minimal vector accents',
    lighting: base.lighting ?? 'balanced',
    theme: `${input.brandName} brand visual system`,
    industry,
    audience: input.audience ?? 'business decision makers',
    brandTone: input.brandTone ?? 'professional and approachable',
    products: input.products ?? [],
    services: input.services ?? [],
    keywords: input.keywords ?? [],
    competitors: input.competitors ?? [],
    logoUrl: input.logoUrl,
    metricsSource: 'estimated',
    confidence: 55,
  };
}

export interface PromptPack {
  prompt: string;
  negativePrompt: string;
  aspectRatio: string;
  recommendedProvider: 'flux' | 'sdxl' | 'comfy';
  width: number;
  height: number;
  qualitySettings: { steps: number; guidance: number };
}

export function buildImagePrompt(input: {
  imageType: ImageType | string;
  style: DomainStyleProfile;
  topic?: string;
  backlinkType?: string;
  brandName: string;
  customPrompt?: string;
  sizeKey?: string;
}): PromptPack {
  const type = String(input.imageType);
  const sizeKey = input.sizeKey ?? DEFAULT_SIZE_FOR_TYPE[type as ImageType] ?? '1200x630';
  const size = IMAGE_SIZES[sizeKey] ?? IMAGE_SIZES['1200x630'];
  const topic = input.topic ?? type.replace(/_/g, ' ');
  const colors = input.style.brandColors.join(', ');

  const prompt =
    input.customPrompt?.trim() ||
    [
      `${input.style.photographyStyle} for ${input.brandName}`,
      topic,
      input.style.mood,
      `${input.style.lighting}`,
      `color palette ${colors}`,
      input.style.brandTone,
      '4K, ultra detailed, professional, no watermark, no text overlay unless logo mark',
      `suitable for ${type.replace(/_/g, ' ')}`,
      input.backlinkType ? `context ${input.backlinkType.replace(/_/g, ' ')}` : '',
    ]
      .filter(Boolean)
      .join(', ');

  const negativePrompt =
    'blurry, low quality, watermark, stock photo stamp, illegible text, deformed, spammy, NSFW';

  return {
    prompt,
    negativePrompt,
    aspectRatio: `${size.w}:${size.h}`,
    recommendedProvider: 'flux',
    width: size.w,
    height: size.h,
    qualitySettings: { steps: 28, guidance: 7 },
  };
}

export interface QualityScores {
  resolution: number;
  sharpness: number;
  seoScore: number;
  brandMatch: number;
  visualQuality: number;
  readability: number;
  submissionReadiness: number;
  overall: number;
  pass: boolean;
  rejectReason?: string;
}

export function scoreImageQuality(input: {
  width: number;
  height: number;
  mimeType: string;
  byteLength: number;
  imageType: string;
  hasMetadata: boolean;
  providerMode?: string;
}): QualityScores {
  let resolution = Math.min(100, Math.round(((input.width * input.height) / (1200 * 630)) * 70));
  if (input.width >= 1200 && input.height >= 630) resolution = Math.max(resolution, 80);

  const sharpness = input.mimeType.includes('svg') ? 55 : 78;
  const seoScore = input.hasMetadata ? 85 : 40;
  const brandMatch = 70;
  const visualQuality = input.providerMode === 'local_draft_svg' ? 48 : 82;
  const readability = input.mimeType.includes('svg') ? 60 : 75;
  let submissionReadiness = Math.round(
    (resolution + sharpness + seoScore + brandMatch + visualQuality + readability) / 6
  );

  // Draft SVG is fine for pipeline but not Ready for photo sites
  if (input.providerMode === 'local_draft_svg') {
    submissionReadiness = Math.min(submissionReadiness, 55);
  }

  const overall = submissionReadiness;
  const pass = overall >= 60 && seoScore >= 50;
  return {
    resolution,
    sharpness,
    seoScore,
    brandMatch,
    visualQuality,
    readability,
    submissionReadiness,
    overall,
    pass,
    rejectReason: pass ? undefined : 'Below quality threshold — regenerate or configure live provider',
  };
}

export function buildImageMetadata(input: {
  brandName: string;
  imageType: string;
  topic?: string;
  keywords?: string[];
  width: number;
  height: number;
}) {
  const topic = input.topic ?? input.imageType.replace(/_/g, ' ');
  const slug = `${input.brandName}-${topic}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  const keywords = input.keywords?.length
    ? input.keywords
    : [input.brandName, topic, input.imageType.replace(/_/g, ' ')];

  return {
    seoFilename: `${slug}-${input.width}x${input.height}.png`,
    imageTitle: `${topic} | ${input.brandName}`,
    altText: `${topic} visual for ${input.brandName}`,
    caption: `${topic} — ${input.brandName}`,
    description: `SEO-optimized ${input.imageType.replace(/_/g, ' ')} for ${input.brandName}: ${topic}.`,
    keywords,
    tags: keywords.slice(0, 8),
    categories: [input.imageType.replace(/_/g, ' ')],
    ogMetadata: {
      'og:title': `${topic} | ${input.brandName}`,
      'og:image:width': input.width,
      'og:image:height': input.height,
    },
    twitterMetadata: {
      'twitter:card': 'summary_large_image',
      'twitter:title': `${topic} | ${input.brandName}`,
    },
    structuredData: {
      '@context': 'https://schema.org',
      '@type': 'ImageObject',
      name: `${topic} | ${input.brandName}`,
      description: `SEO-optimized ${input.imageType.replace(/_/g, ' ')}`,
    },
    exifSuggestions: {
      Artist: input.brandName,
      ImageDescription: topic,
      Copyright: input.brandName,
    },
  };
}

export function buildSubmissionPackage(input: {
  metadata: ReturnType<typeof buildImageMetadata>;
  width: number;
  height: number;
  mimeType: string;
  siteKey?: string;
  maxBytes?: number;
}) {
  const checklist = [
    { id: 'image', label: 'Image asset present', done: true },
    { id: 'alt', label: 'Alt text', done: Boolean(input.metadata.altText) },
    { id: 'caption', label: 'Caption', done: Boolean(input.metadata.caption) },
    { id: 'filename', label: 'SEO filename', done: Boolean(input.metadata.seoFilename) },
    { id: 'dims', label: 'Dimensions set', done: input.width > 0 && input.height > 0 },
    {
      id: 'format',
      label: 'Format acceptable',
      done: /png|jpeg|jpg|webp|svg/i.test(input.mimeType),
    },
  ];
  return {
    image: true,
    altText: input.metadata.altText,
    caption: input.metadata.caption,
    description: input.metadata.description,
    filename: input.metadata.seoFilename,
    title: input.metadata.imageTitle,
    tags: input.metadata.tags,
    categories: input.metadata.categories,
    recommendedDimensions: { width: input.width, height: input.height },
    compression: 'webp_preferred',
    siteKey: input.siteKey ?? null,
    maxBytes: input.maxBytes ?? null,
    checklist,
    status: 'ready' as const,
  };
}

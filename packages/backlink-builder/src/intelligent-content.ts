/**
 * Intelligent Content Studio — mode adapter + quality scoring.
 * Extends Content Studio without replacing it.
 */

import {
  OPPORTUNITY_CLASSIFICATION_TYPES,
  getClassificationLabel,
  type OpportunityClassificationId,
} from './opportunity-classifier.js';
import {
  detectSubmissionRequirements,
  type SubmissionRequirementsResult,
} from './submission-requirements.js';

export type ContentStudioMode =
  | 'guest_post'
  | 'article'
  | 'directory'
  | 'profile'
  | 'forum'
  | 'qa'
  | 'press'
  | 'image'
  | 'infographic'
  | 'video'
  | 'resource'
  | 'outreach'
  | 'generic';

export type StudioUiSection =
  | 'business_fields'
  | 'blog_editor'
  | 'article_editor'
  | 'forum_editor'
  | 'qa_editor'
  | 'press_editor'
  | 'profile_fields'
  | 'image_assets'
  | 'video_assets'
  | 'links_anchors'
  | 'seo_metadata'
  | 'preview';

const MODE_SECTIONS: Record<ContentStudioMode, StudioUiSection[]> = {
  guest_post: ['blog_editor', 'seo_metadata', 'links_anchors', 'image_assets', 'preview'],
  article: ['article_editor', 'seo_metadata', 'links_anchors', 'preview'],
  directory: ['business_fields', 'seo_metadata', 'image_assets', 'preview'],
  profile: ['profile_fields', 'image_assets', 'seo_metadata', 'preview'],
  forum: ['forum_editor', 'links_anchors', 'preview'],
  qa: ['qa_editor', 'links_anchors', 'preview'],
  press: ['press_editor', 'seo_metadata', 'image_assets', 'preview'],
  image: ['image_assets', 'seo_metadata', 'preview'],
  infographic: ['image_assets', 'seo_metadata', 'preview'],
  video: ['video_assets', 'seo_metadata', 'preview'],
  resource: ['article_editor', 'links_anchors', 'seo_metadata', 'preview'],
  outreach: ['article_editor', 'links_anchors', 'preview'],
  generic: ['business_fields', 'seo_metadata', 'preview'],
};

const CLASSIFICATION_TO_MODE: Record<string, ContentStudioMode> = {
  guest_post: 'guest_post',
  article_submission: 'article',
  blog_submission: 'article',
  directory_submission: 'directory',
  business_directory: 'directory',
  local_citation: 'directory',
  company_listing: 'directory',
  business_profile: 'profile',
  profile_creation: 'profile',
  resource_page: 'resource',
  link_roundup: 'resource',
  press_release: 'press',
  forum_posting: 'forum',
  community: 'forum',
  qa_website: 'qa',
  social_bookmark: 'generic',
  document_sharing: 'article',
  pdf_submission: 'article',
  ppt_submission: 'article',
  image_submission: 'image',
  infographic_submission: 'infographic',
  video_submission: 'video',
  podcast_submission: 'video',
  product_listing: 'directory',
  marketplace_listing: 'directory',
  classified_submission: 'directory',
  review_website: 'directory',
  event_submission: 'directory',
  saas_directory: 'directory',
  startup_directory: 'directory',
  ai_tool_directory: 'directory',
  software_directory: 'directory',
  restaurant_directory: 'directory',
  healthcare_directory: 'directory',
  real_estate_directory: 'directory',
  education_directory: 'directory',
  government_directory: 'directory',
  niche_directory: 'directory',
  wiki_submission: 'article',
  sponsorship: 'outreach',
  broken_link: 'outreach',
  link_exchange: 'outreach',
  outreach_required: 'outreach',
  unknown: 'generic',
};

const STORAGE_TO_MODE: Record<string, ContentStudioMode> = {
  guest_post: 'guest_post',
  directory: 'directory',
  profile: 'profile',
  forum: 'forum',
  qa_site: 'qa',
  press_release: 'press',
  resource_page: 'resource',
  broken_link: 'outreach',
  citation: 'directory',
  digital_pr: 'press',
  web2: 'article',
  infographic: 'infographic',
  video: 'video',
  podcast: 'video',
  pdf: 'article',
  partnership: 'outreach',
  event: 'directory',
  edu: 'directory',
  gov: 'directory',
};

export function resolveStorageTypeFromClassification(classificationId: string): string {
  const hit = OPPORTUNITY_CLASSIFICATION_TYPES.find((t) => t.id === classificationId);
  return hit?.storageType ?? classificationId;
}

export function resolveContentStudioMode(input: {
  classificationId?: string | null;
  opportunityType?: string | null;
  workflowQueue?: string | null;
}): ContentStudioMode {
  const cid = input.classificationId ?? '';
  if (cid && CLASSIFICATION_TO_MODE[cid]) return CLASSIFICATION_TO_MODE[cid]!;
  const ot = input.opportunityType ?? '';
  if (ot && STORAGE_TO_MODE[ot]) return STORAGE_TO_MODE[ot]!;
  if (ot && CLASSIFICATION_TO_MODE[ot]) return CLASSIFICATION_TO_MODE[ot]!;
  const q = input.workflowQueue ?? '';
  if (q === 'image') return 'image';
  if (q === 'video') return 'video';
  if (q === 'directory' || q === 'marketplace') return 'directory';
  if (q === 'guest_post') return 'guest_post';
  if (q === 'article') return 'article';
  if (q === 'press') return 'press';
  if (q === 'forum' || q === 'community') return 'forum';
  if (q === 'qa') return 'qa';
  if (q === 'profile') return 'profile';
  return 'generic';
}

export function studioSectionsForMode(mode: ContentStudioMode): StudioUiSection[] {
  return MODE_SECTIONS[mode] ?? MODE_SECTIONS.generic;
}

export function studioModeLabel(mode: ContentStudioMode): string {
  const labels: Record<ContentStudioMode, string> = {
    guest_post: 'Guest Post Mode',
    article: 'Article Submission Mode',
    directory: 'Directory Submission Mode',
    profile: 'Profile Creation Mode',
    forum: 'Forum Mode',
    qa: 'Q&A Mode',
    press: 'Press Release Mode',
    image: 'Image Submission Mode',
    infographic: 'Infographic Mode',
    video: 'Video Submission Mode',
    resource: 'Resource Page Mode',
    outreach: 'Outreach Mode',
    generic: 'General Submission Mode',
  };
  return labels[mode];
}

export function shouldOpenImageStudio(mode: ContentStudioMode): boolean {
  return mode === 'image' || mode === 'infographic';
}

export function shouldOpenVideoStudio(mode: ContentStudioMode): boolean {
  return mode === 'video';
}

export type ContentQualityScores = {
  seoScore: number;
  readabilityScore: number;
  uniquenessScore: number;
  eeatScore: number;
  overall: number;
  recommendations: string[];
};

export function scoreContentPackQuality(pack: Record<string, unknown>): ContentQualityScores {
  const body = String(pack.body ?? '');
  const title = String(pack.seoTitle ?? pack.title ?? '');
  const meta = String(pack.metaDescription ?? '');
  const internal = Array.isArray(pack.internalLinks) ? pack.internalLinks.length : 0;
  const external = Array.isArray(pack.externalLinks) ? pack.externalLinks.length : 0;
  const h2 = Array.isArray(pack.h2) ? pack.h2.length : 0;
  const faq = Array.isArray(pack.faq) ? pack.faq.length : 0;

  let seo = 45;
  if (title.length >= 30 && title.length <= 65) seo += 12;
  if (meta.length >= 110 && meta.length <= 160) seo += 12;
  if (h2 >= 2) seo += 8;
  if (internal >= 1) seo += 8;
  if (external >= 1) seo += 5;
  if (faq >= 1) seo += 5;

  const words = body.split(/\s+/).filter(Boolean).length;
  let readability = 50;
  if (words >= 200 && words <= 1800) readability += 20;
  else if (words > 80) readability += 10;
  if (!/\b(click here|buy now!!!|guaranteed ranking)\b/i.test(body)) readability += 15;
  if (body.includes('\n') || h2 > 0) readability += 10;

  const uniqueness = Math.min(95, 55 + Math.min(30, words / 40) + (title ? 10 : 0));
  let eeat = 48;
  if (pack.schemaJsonLd || pack.schema) eeat += 12;
  if (String(pack.authorBio ?? pack.boilerplate ?? '').length > 40) eeat += 15;
  if (external >= 1) eeat += 10;
  if (internal >= 1) eeat += 8;

  const overall = Math.round((seo + readability + uniqueness + eeat) / 4);
  const recommendations: string[] = [];
  if (seo < 70) recommendations.push('Tighten SEO title/meta and heading hierarchy');
  if (readability < 70)
    recommendations.push('Improve readability — shorter paragraphs, clearer structure');
  if (internal < 1) recommendations.push('Add at least one natural internal link');
  if (eeat < 70)
    recommendations.push('Strengthen EEAT with author bio, schema, and authority citations');

  return {
    seoScore: Math.min(99, seo),
    readabilityScore: Math.min(99, readability),
    uniquenessScore: Math.min(99, Math.round(uniqueness)),
    eeatScore: Math.min(99, eeat),
    overall: Math.min(99, overall),
    recommendations,
  };
}

export function buildIntelligentContentPlan(input: {
  classificationId?: string | null;
  classificationLabel?: string | null;
  opportunityType?: string | null;
  workflowQueue?: string | null;
  confidence?: number | null;
  reason?: string | null;
  domain?: string | null;
  websiteName?: string | null;
  learnedRequirements?: Partial<SubmissionRequirementsResult> | null;
}): {
  mode: ContentStudioMode;
  modeLabel: string;
  detectedType: string;
  detectedTypeLabel: string;
  storageType: string;
  sections: StudioUiSection[];
  requirements: SubmissionRequirementsResult;
  openImageStudio: boolean;
  openVideoStudio: boolean;
  confidence: number;
  reason: string;
} {
  const storageType = input.classificationId
    ? resolveStorageTypeFromClassification(input.classificationId)
    : String(input.opportunityType ?? 'guest_post');
  const mode = resolveContentStudioMode({
    classificationId: input.classificationId,
    opportunityType: storageType,
    workflowQueue: input.workflowQueue,
  });
  const requirements = detectSubmissionRequirements(storageType, {
    url: input.domain ? `https://${input.domain}` : undefined,
  });
  if (input.learnedRequirements?.requiredFields?.length) {
    requirements.requiredFields = [
      ...new Set([...requirements.requiredFields, ...input.learnedRequirements.requiredFields]),
    ];
  }
  const detectedType =
    input.classificationId ??
    (storageType as OpportunityClassificationId | string) ??
    'unknown';

  return {
    mode,
    modeLabel: studioModeLabel(mode),
    detectedType: String(detectedType),
    detectedTypeLabel:
      input.classificationLabel ?? getClassificationLabel(String(detectedType)),
    storageType,
    sections: studioSectionsForMode(mode),
    requirements,
    openImageStudio: shouldOpenImageStudio(mode),
    openVideoStudio: shouldOpenVideoStudio(mode),
    confidence: Number(input.confidence ?? 0),
    reason:
      input.reason ??
      `Auto-detected ${getClassificationLabel(String(detectedType))} for ${input.websiteName ?? input.domain ?? 'website'}`,
  };
}

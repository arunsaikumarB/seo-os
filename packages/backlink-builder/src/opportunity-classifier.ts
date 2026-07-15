/**
 * AI-powered Backlink Opportunity Classification Engine
 * Extensible type registry + site-structure signal scoring (not domain-name-only).
 */

import type { BacklinkTypeId } from './backlink-types.js';
import { BACKLINK_TYPES, getTypeLabel } from './backlink-types.js';

/** Workflow queues that route opportunities into dedicated pipelines */
export const CLASSIFICATION_QUEUES = [
  'directory',
  'guest_post',
  'article',
  'image',
  'video',
  'profile',
  'forum',
  'qa',
  'citation',
  'press',
  'resource',
  'outreach',
  'marketplace',
  'community',
  'unknown',
] as const;

export type ClassificationQueue = (typeof CLASSIFICATION_QUEUES)[number];

/** Specialized workforce agents for classified opportunities */
export const CLASSIFICATION_AGENTS = [
  { id: 'directory_agent', displayName: 'Directory Agent', queues: ['directory', 'marketplace'] },
  { id: 'guest_post_agent', displayName: 'Guest Post Agent', queues: ['guest_post'] },
  { id: 'forum_agent', displayName: 'Forum Agent', queues: ['forum', 'community'] },
  { id: 'article_agent', displayName: 'Article Agent', queues: ['article', 'press'] },
  { id: 'image_agent', displayName: 'Image Agent', queues: ['image'] },
  { id: 'video_agent', displayName: 'Video Agent', queues: ['video'] },
  { id: 'profile_agent', displayName: 'Profile Agent', queues: ['profile'] },
  { id: 'qa_agent', displayName: 'Q&A Agent', queues: ['qa'] },
  { id: 'citation_agent', displayName: 'Citation Agent', queues: ['citation'] },
  { id: 'verification_agent', displayName: 'Verification Agent', queues: ['outreach', 'unknown'] },
] as const;

export type ClassificationAgentId = (typeof CLASSIFICATION_AGENTS)[number]['id'];

/**
 * Full classification taxonomy — append new `{ id, displayName, … }` rows to extend.
 * `storageType` maps into legacy BacklinkTypeId where a close match exists.
 */
export const OPPORTUNITY_CLASSIFICATION_TYPES = [
  { id: 'guest_post', displayName: 'Guest Post', queue: 'guest_post', storageType: 'guest_post', agent: 'guest_post_agent' },
  { id: 'article_submission', displayName: 'Article Submission', queue: 'article', storageType: 'guest_post', agent: 'article_agent' },
  { id: 'blog_submission', displayName: 'Blog Submission', queue: 'article', storageType: 'web2', agent: 'article_agent' },
  { id: 'directory_submission', displayName: 'Directory Submission', queue: 'directory', storageType: 'directory', agent: 'directory_agent' },
  { id: 'business_directory', displayName: 'Business Directory', queue: 'directory', storageType: 'directory', agent: 'directory_agent' },
  { id: 'local_citation', displayName: 'Local Citation', queue: 'citation', storageType: 'citation', agent: 'citation_agent' },
  { id: 'company_listing', displayName: 'Company Listing', queue: 'directory', storageType: 'directory', agent: 'directory_agent' },
  { id: 'business_profile', displayName: 'Business Profile', queue: 'profile', storageType: 'profile', agent: 'profile_agent' },
  { id: 'resource_page', displayName: 'Resource Page', queue: 'resource', storageType: 'resource_page', agent: 'article_agent' },
  { id: 'link_roundup', displayName: 'Link Roundup', queue: 'resource', storageType: 'resource_page', agent: 'article_agent' },
  { id: 'press_release', displayName: 'Press Release', queue: 'press', storageType: 'press_release', agent: 'article_agent' },
  { id: 'profile_creation', displayName: 'Profile Creation', queue: 'profile', storageType: 'profile', agent: 'profile_agent' },
  { id: 'forum_posting', displayName: 'Forum Posting', queue: 'forum', storageType: 'forum', agent: 'forum_agent' },
  { id: 'community', displayName: 'Community', queue: 'community', storageType: 'forum', agent: 'forum_agent' },
  { id: 'qa_website', displayName: 'Q&A Website', queue: 'qa', storageType: 'qa_site', agent: 'qa_agent' },
  { id: 'social_bookmark', displayName: 'Social Bookmark', queue: 'community', storageType: 'social_bookmark', agent: 'forum_agent' },
  { id: 'document_sharing', displayName: 'Document Sharing', queue: 'article', storageType: 'pdf', agent: 'article_agent' },
  { id: 'pdf_submission', displayName: 'PDF Submission', queue: 'article', storageType: 'pdf', agent: 'article_agent' },
  { id: 'ppt_submission', displayName: 'PPT Submission', queue: 'article', storageType: 'pdf', agent: 'article_agent' },
  { id: 'image_submission', displayName: 'Image Submission', queue: 'image', storageType: 'infographic', agent: 'image_agent' },
  { id: 'infographic_submission', displayName: 'Infographic Submission', queue: 'image', storageType: 'infographic', agent: 'image_agent' },
  { id: 'video_submission', displayName: 'Video Submission', queue: 'video', storageType: 'video', agent: 'video_agent' },
  { id: 'podcast_submission', displayName: 'Podcast Submission', queue: 'video', storageType: 'podcast', agent: 'video_agent' },
  { id: 'product_listing', displayName: 'Product Listing', queue: 'marketplace', storageType: 'directory', agent: 'directory_agent' },
  { id: 'marketplace_listing', displayName: 'Marketplace Listing', queue: 'marketplace', storageType: 'directory', agent: 'directory_agent' },
  { id: 'classified_submission', displayName: 'Classified Submission', queue: 'marketplace', storageType: 'directory', agent: 'directory_agent' },
  { id: 'review_website', displayName: 'Review Website', queue: 'directory', storageType: 'directory', agent: 'directory_agent' },
  { id: 'event_submission', displayName: 'Event Submission', queue: 'directory', storageType: 'event', agent: 'directory_agent' },
  { id: 'scholarship_link', displayName: 'Scholarship Link', queue: 'outreach', storageType: 'edu', agent: 'verification_agent' },
  { id: 'sponsorship', displayName: 'Sponsorship', queue: 'outreach', storageType: 'sponsorship', agent: 'verification_agent' },
  { id: 'job_board', displayName: 'Job Board', queue: 'directory', storageType: 'directory', agent: 'directory_agent' },
  { id: 'coupon_website', displayName: 'Coupon Website', queue: 'marketplace', storageType: 'directory', agent: 'directory_agent' },
  { id: 'affiliate_listing', displayName: 'Affiliate Listing', queue: 'marketplace', storageType: 'partnership', agent: 'directory_agent' },
  { id: 'saas_directory', displayName: 'SaaS Directory', queue: 'directory', storageType: 'directory', agent: 'directory_agent' },
  { id: 'startup_directory', displayName: 'Startup Directory', queue: 'directory', storageType: 'directory', agent: 'directory_agent' },
  { id: 'ai_tool_directory', displayName: 'AI Tool Directory', queue: 'directory', storageType: 'directory', agent: 'directory_agent' },
  { id: 'software_directory', displayName: 'Software Directory', queue: 'directory', storageType: 'directory', agent: 'directory_agent' },
  { id: 'restaurant_directory', displayName: 'Restaurant Directory', queue: 'directory', storageType: 'directory', agent: 'directory_agent' },
  { id: 'healthcare_directory', displayName: 'Healthcare Directory', queue: 'directory', storageType: 'directory', agent: 'directory_agent' },
  { id: 'real_estate_directory', displayName: 'Real Estate Directory', queue: 'directory', storageType: 'directory', agent: 'directory_agent' },
  { id: 'education_directory', displayName: 'Education Directory', queue: 'directory', storageType: 'edu', agent: 'directory_agent' },
  { id: 'government_directory', displayName: 'Government Directory', queue: 'directory', storageType: 'gov', agent: 'directory_agent' },
  { id: 'niche_directory', displayName: 'Niche Directory', queue: 'directory', storageType: 'directory', agent: 'directory_agent' },
  { id: 'wiki_submission', displayName: 'Wiki Submission', queue: 'community', storageType: 'web2', agent: 'forum_agent' },
  { id: 'broken_link', displayName: 'Broken Link Opportunity', queue: 'outreach', storageType: 'broken_link', agent: 'verification_agent' },
  { id: 'link_exchange', displayName: 'Link Exchange', queue: 'outreach', storageType: 'partnership', agent: 'verification_agent' },
  { id: 'outreach_required', displayName: 'Outreach Required', queue: 'outreach', storageType: 'niche_edit', agent: 'verification_agent' },
  { id: 'unknown', displayName: 'Unknown', queue: 'unknown', storageType: 'resource_page', agent: 'verification_agent' },
] as const;

export type OpportunityClassificationId =
  (typeof OPPORTUNITY_CLASSIFICATION_TYPES)[number]['id'];

export type LearningPattern = {
  fromType?: string;
  toType: OpportunityClassificationId | string;
  domainHint?: string;
  keywords: string[];
  selectors: string[];
  navigation: string[];
  submissionFlow: string[];
  correctedAt: string;
  count: number;
};

export type WebsiteInspectionSignals = {
  title?: string;
  metaDescription?: string;
  metaKeywords?: string;
  h1?: string[];
  navTexts: string[];
  footerTexts: string[];
  buttonTexts: string[];
  formActions: string[];
  formLabels: string[];
  anchorTexts: string[];
  schemaTypes: string[];
  hasWriteForUs: boolean;
  hasSubmitListing: boolean;
  hasAddBusiness: boolean;
  hasCreateProfile: boolean;
  hasUpload: boolean;
  hasForum: boolean;
  hasQa: boolean;
  hasMarketplace: boolean;
  hasVideoUpload: boolean;
  hasImageGallery: boolean;
  hasPodcast: boolean;
  hasPressRoom: boolean;
  hasResourcePage: boolean;
  hasEventSubmit: boolean;
  hasJobBoard: boolean;
  hasCoupon: boolean;
  hasWiki: boolean;
  hasReview: boolean;
  hasScholarship: boolean;
  hasSponsor: boolean;
  robotsAllowsCrawl: boolean;
  sitemapFound: boolean;
  fetchOk: boolean;
  rawSnippet?: string;
};

export type ClassificationDecision = {
  classificationId: OpportunityClassificationId;
  displayName: string;
  backlinkType: BacklinkTypeId;
  confidence: number;
  reason: string;
  evidence: string[];
  workflowQueue: ClassificationQueue;
  assignedAgent: ClassificationAgentId;
  alternatives: Array<{ id: string; confidence: number; displayName: string }>;
};

type SignalRule = {
  id: OpportunityClassificationId;
  weight: number;
  match: (s: WebsiteInspectionSignals, html: string) => { hit: boolean; evidence: string[] };
};

function lowerJoin(parts: string[]): string {
  return parts.join(' | ').toLowerCase();
}

function includesAny(hay: string, needles: string[]): boolean {
  return needles.some((n) => hay.includes(n));
}

const RULES: SignalRule[] = [
  {
    id: 'guest_post',
    weight: 40,
    match: (s) => {
      const hit =
        s.hasWriteForUs ||
        includesAny(lowerJoin([...s.navTexts, ...s.anchorTexts, ...s.buttonTexts]), [
          'write for us',
          'guest post',
          'guest blog',
          'become a contributor',
          'contributor guidelines',
          'submit a guest',
        ]);
      return { hit, evidence: hit ? ['Detected Write for Us / guest contribution path'] : [] };
    },
  },
  {
    id: 'article_submission',
    weight: 32,
    match: (s) => {
      const hit = includesAny(lowerJoin([...s.navTexts, ...s.buttonTexts, ...s.formLabels]), [
        'submit article',
        'article submission',
        'publish article',
        'submit your article',
      ]);
      return { hit, evidence: hit ? ['Detected article submission CTA/form'] : [] };
    },
  },
  {
    id: 'blog_submission',
    weight: 28,
    match: (s) => {
      const hit = includesAny(lowerJoin([...s.navTexts, ...s.buttonTexts]), [
        'submit blog',
        'blog submission',
        'post a blog',
      ]);
      return { hit, evidence: hit ? ['Detected blog submission workflow'] : [] };
    },
  },
  {
    id: 'directory_submission',
    weight: 36,
    match: (s) => {
      const hit =
        s.hasSubmitListing ||
        includesAny(lowerJoin([...s.navTexts, ...s.buttonTexts, ...s.formLabels]), [
          'submit listing',
          'add listing',
          'submit directory',
          'directory submission',
        ]);
      return { hit, evidence: hit ? ['Detected directory listing submission'] : [] };
    },
  },
  {
    id: 'business_directory',
    weight: 38,
    match: (s) => {
      const hit =
        s.hasAddBusiness ||
        includesAny(lowerJoin([...s.navTexts, ...s.buttonTexts]), [
          'add business',
          'add your business',
          'list your business',
          'claim business',
        ]);
      return { hit, evidence: hit ? ['Detected Add Business Listing page/CTA'] : [] };
    },
  },
  {
    id: 'local_citation',
    weight: 34,
    match: (s) => {
      const hit = includesAny(lowerJoin([...s.navTexts, ...s.formLabels, s.metaDescription ?? '']), [
        'local listing',
        'citation',
        'nap',
        'local business directory',
        'yellow pages',
      ]);
      return { hit, evidence: hit ? ['Detected local citation / NAP listing signals'] : [] };
    },
  },
  {
    id: 'company_listing',
    weight: 30,
    match: (s) => {
      const hit = includesAny(lowerJoin([...s.navTexts, ...s.buttonTexts]), [
        'company listing',
        'add company',
        'list your company',
      ]);
      return { hit, evidence: hit ? ['Detected company listing workflow'] : [] };
    },
  },
  {
    id: 'business_profile',
    weight: 30,
    match: (s) => {
      const hit =
        s.hasCreateProfile &&
        includesAny(lowerJoin([...s.navTexts, ...s.buttonTexts]), [
          'business profile',
          'company profile',
          'create business',
        ]);
      return { hit, evidence: hit ? ['Detected business profile creation'] : [] };
    },
  },
  {
    id: 'profile_creation',
    weight: 32,
    match: (s) => {
      const hit =
        s.hasCreateProfile ||
        includesAny(lowerJoin([...s.buttonTexts, ...s.navTexts]), [
          'create profile',
          'sign up profile',
          'join and create profile',
        ]);
      return { hit, evidence: hit ? ['Detected profile creation flow'] : [] };
    },
  },
  {
    id: 'resource_page',
    weight: 30,
    match: (s) => {
      const hit =
        s.hasResourcePage ||
        includesAny(lowerJoin([...s.navTexts, ...(s.h1 ?? []), ...s.anchorTexts]), [
          'resources',
          'useful links',
          'recommended tools',
          'link list',
        ]);
      return { hit, evidence: hit ? ['Detected resource / links page structure'] : [] };
    },
  },
  {
    id: 'link_roundup',
    weight: 28,
    match: (s) => {
      const hit = includesAny(lowerJoin([...(s.h1 ?? []), ...s.navTexts, s.title ?? '']), [
        'roundup',
        'link roundup',
        'weekly links',
        'link digest',
      ]);
      return { hit, evidence: hit ? ['Detected link roundup content pattern'] : [] };
    },
  },
  {
    id: 'press_release',
    weight: 34,
    match: (s) => {
      const hit =
        s.hasPressRoom ||
        includesAny(lowerJoin([...s.navTexts, ...s.buttonTexts]), [
          'press release',
          'submit pr',
          'newswire',
          'press room',
          'media kit',
        ]);
      return { hit, evidence: hit ? ['Detected press release / newswire path'] : [] };
    },
  },
  {
    id: 'forum_posting',
    weight: 36,
    match: (s) => {
      const hit =
        s.hasForum ||
        includesAny(lowerJoin([...s.navTexts, ...s.schemaTypes]), [
          'forum',
          'discussion board',
          'phpbb',
          'discourse',
        ]);
      return { hit, evidence: hit ? ['Detected forum / discussion structure'] : [] };
    },
  },
  {
    id: 'community',
    weight: 28,
    match: (s) => {
      const hit = includesAny(lowerJoin([...s.navTexts, ...s.buttonTexts]), [
        'community',
        'join community',
        'members area',
      ]);
      return { hit, evidence: hit ? ['Detected community membership UI'] : [] };
    },
  },
  {
    id: 'qa_website',
    weight: 38,
    match: (s) => {
      const hit =
        s.hasQa ||
        includesAny(lowerJoin([...s.navTexts, ...s.schemaTypes, ...s.buttonTexts]), [
          'ask a question',
          'q&a',
          'questions and answers',
          'answered questions',
        ]);
      return { hit, evidence: hit ? ['Detected Q&A ask/answer workflow'] : [] };
    },
  },
  {
    id: 'social_bookmark',
    weight: 26,
    match: (s) => {
      const hit = includesAny(lowerJoin([...s.navTexts, ...s.buttonTexts]), [
        'bookmark',
        'save link',
        'social bookmark',
      ]);
      return { hit, evidence: hit ? ['Detected social bookmarking UI'] : [] };
    },
  },
  {
    id: 'document_sharing',
    weight: 30,
    match: (s) => {
      const hit =
        s.hasUpload &&
        includesAny(lowerJoin([...s.navTexts, ...s.buttonTexts, ...s.formLabels]), [
          'upload document',
          'share document',
          'document sharing',
          'upload file',
        ]);
      return { hit, evidence: hit ? ['Detected document upload/share flow'] : [] };
    },
  },
  {
    id: 'pdf_submission',
    weight: 32,
    match: (s) => {
      const hit = includesAny(lowerJoin([...s.buttonTexts, ...s.formLabels, ...s.navTexts]), [
        'upload pdf',
        'submit pdf',
        'pdf submission',
      ]);
      return { hit, evidence: hit ? ['Detected PDF submission workflow'] : [] };
    },
  },
  {
    id: 'ppt_submission',
    weight: 30,
    match: (s) => {
      const hit = includesAny(lowerJoin([...s.buttonTexts, ...s.formLabels]), [
        'powerpoint',
        'upload ppt',
        'slide share',
        'slideshare',
      ]);
      return { hit, evidence: hit ? ['Detected PPT / slides submission'] : [] };
    },
  },
  {
    id: 'image_submission',
    weight: 34,
    match: (s) => {
      const hit =
        s.hasImageGallery ||
        includesAny(lowerJoin([...s.buttonTexts, ...s.navTexts, ...s.formLabels]), [
          'upload image',
          'submit image',
          'image submission',
          'photo upload',
        ]);
      return { hit, evidence: hit ? ['Detected image upload / gallery submission'] : [] };
    },
  },
  {
    id: 'infographic_submission',
    weight: 32,
    match: (s) => {
      const hit = includesAny(lowerJoin([...s.navTexts, ...s.buttonTexts]), [
        'infographic',
        'submit infographic',
        'upload infographic',
      ]);
      return { hit, evidence: hit ? ['Detected infographic submission path'] : [] };
    },
  },
  {
    id: 'video_submission',
    weight: 36,
    match: (s) => {
      const hit =
        s.hasVideoUpload ||
        includesAny(lowerJoin([...s.buttonTexts, ...s.navTexts, ...s.formLabels]), [
          'upload video',
          'submit video',
          'video submission',
          'publish video',
        ]);
      return { hit, evidence: hit ? ['Detected video upload workflow'] : [] };
    },
  },
  {
    id: 'podcast_submission',
    weight: 32,
    match: (s) => {
      const hit =
        s.hasPodcast ||
        includesAny(lowerJoin([...s.navTexts, ...s.buttonTexts]), [
          'submit podcast',
          'podcast guest',
          'be a guest',
          'podcast directory',
        ]);
      return { hit, evidence: hit ? ['Detected podcast submission / guest path'] : [] };
    },
  },
  {
    id: 'marketplace_listing',
    weight: 34,
    match: (s) => {
      const hit =
        s.hasMarketplace ||
        includesAny(lowerJoin([...s.navTexts, ...s.buttonTexts]), [
          'marketplace',
          'sell on',
          'list product',
          'add product',
        ]);
      return { hit, evidence: hit ? ['Detected marketplace listing workflow'] : [] };
    },
  },
  {
    id: 'product_listing',
    weight: 30,
    match: (s) => {
      const hit = includesAny(lowerJoin([...s.navTexts, ...s.buttonTexts]), [
        'product listing',
        'list your product',
        'add product',
      ]);
      return { hit, evidence: hit ? ['Detected product listing CTA'] : [] };
    },
  },
  {
    id: 'classified_submission',
    weight: 30,
    match: (s) => {
      const hit = includesAny(lowerJoin([...s.navTexts, ...s.buttonTexts]), [
        'classified',
        'post a classified',
        'post ad',
        'place an ad',
      ]);
      return { hit, evidence: hit ? ['Detected classifieds submission'] : [] };
    },
  },
  {
    id: 'review_website',
    weight: 30,
    match: (s) => {
      const hit =
        s.hasReview ||
        includesAny(lowerJoin([...s.navTexts, ...s.schemaTypes]), [
          'write a review',
          'product reviews',
          'review site',
          'aggregaterating',
        ]);
      return { hit, evidence: hit ? ['Detected review submission / AggregateRating'] : [] };
    },
  },
  {
    id: 'event_submission',
    weight: 30,
    match: (s) => {
      const hit =
        s.hasEventSubmit ||
        includesAny(lowerJoin([...s.navTexts, ...s.buttonTexts]), [
          'submit event',
          'add event',
          'post event',
          'event listing',
        ]);
      return { hit, evidence: hit ? ['Detected event submission flow'] : [] };
    },
  },
  {
    id: 'scholarship_link',
    weight: 28,
    match: (s) => {
      const hit =
        s.hasScholarship ||
        includesAny(lowerJoin([...s.navTexts, s.title ?? '']), [
          'scholarship',
          'scholarships',
          'financial aid links',
        ]);
      return { hit, evidence: hit ? ['Detected scholarship link opportunity'] : [] };
    },
  },
  {
    id: 'sponsorship',
    weight: 28,
    match: (s) => {
      const hit =
        s.hasSponsor ||
        includesAny(lowerJoin([...s.navTexts, ...s.buttonTexts]), [
          'sponsor',
          'sponsorship',
          'become a sponsor',
        ]);
      return { hit, evidence: hit ? ['Detected sponsorship page'] : [] };
    },
  },
  {
    id: 'job_board',
    weight: 30,
    match: (s) => {
      const hit =
        s.hasJobBoard ||
        includesAny(lowerJoin([...s.navTexts, ...s.buttonTexts]), [
          'post a job',
          'job board',
          'careers listing',
          'submit job',
        ]);
      return { hit, evidence: hit ? ['Detected job board posting flow'] : [] };
    },
  },
  {
    id: 'coupon_website',
    weight: 28,
    match: (s) => {
      const hit =
        s.hasCoupon ||
        includesAny(lowerJoin([...s.navTexts, s.title ?? '']), [
          'coupon',
          'promo code',
          'discount code',
          'deals',
        ]);
      return { hit, evidence: hit ? ['Detected coupon / deals site pattern'] : [] };
    },
  },
  {
    id: 'affiliate_listing',
    weight: 26,
    match: (s) => {
      const hit = includesAny(lowerJoin([...s.navTexts, ...s.buttonTexts]), [
        'affiliate',
        'join affiliate',
        'affiliate program',
      ]);
      return { hit, evidence: hit ? ['Detected affiliate listing signals'] : [] };
    },
  },
  {
    id: 'saas_directory',
    weight: 33,
    match: (_s, html) => {
      const hit =
        includesAny(html, ['saas directory', 'software as a service']) ||
        (includesAny(html, ['saas']) && includesAny(html, ['directory', 'add tool', 'submit tool']));
      return { hit, evidence: hit ? ['Detected SaaS directory structure'] : [] };
    },
  },
  {
    id: 'startup_directory',
    weight: 32,
    match: (_s, html) => {
      const hit = includesAny(html, ['startup directory', 'submit startup', 'add startup']);
      return { hit, evidence: hit ? ['Detected startup directory submission'] : [] };
    },
  },
  {
    id: 'ai_tool_directory',
    weight: 34,
    match: (_s, html) => {
      const hit = includesAny(html, [
        'ai tool',
        'ai directory',
        'submit ai tool',
        'ai tools list',
      ]);
      return { hit, evidence: hit ? ['Detected AI tool directory listing path'] : [] };
    },
  },
  {
    id: 'software_directory',
    weight: 32,
    match: (_s, html) => {
      const hit = includesAny(html, [
        'software directory',
        'submit software',
        'add software',
        'software listing',
      ]);
      return { hit, evidence: hit ? ['Detected software directory submission'] : [] };
    },
  },
  {
    id: 'restaurant_directory',
    weight: 30,
    match: (_s, html) => {
      const hit = includesAny(html, [
        'restaurant directory',
        'add restaurant',
        'list your restaurant',
      ]);
      return { hit, evidence: hit ? ['Detected restaurant directory'] : [] };
    },
  },
  {
    id: 'healthcare_directory',
    weight: 30,
    match: (_s, html) => {
      const hit = includesAny(html, [
        'doctor directory',
        'healthcare directory',
        'find a doctor',
        'medical directory',
      ]);
      return { hit, evidence: hit ? ['Detected healthcare directory'] : [] };
    },
  },
  {
    id: 'real_estate_directory',
    weight: 30,
    match: (_s, html) => {
      const hit = includesAny(html, [
        'real estate directory',
        'list property',
        'realtor directory',
        'agent listing',
      ]);
      return { hit, evidence: hit ? ['Detected real estate directory'] : [] };
    },
  },
  {
    id: 'education_directory',
    weight: 28,
    match: (_s, html) => {
      const hit = includesAny(html, [
        'school directory',
        'university directory',
        'education directory',
        'course directory',
      ]);
      return { hit, evidence: hit ? ['Detected education directory'] : [] };
    },
  },
  {
    id: 'government_directory',
    weight: 28,
    match: (_s, html) => {
      const hit = includesAny(html, ['government directory', '.gov directory', 'agency directory']);
      return { hit, evidence: hit ? ['Detected government directory'] : [] };
    },
  },
  {
    id: 'niche_directory',
    weight: 24,
    match: (s, html) => {
      const hit =
        (s.hasSubmitListing || s.hasAddBusiness) &&
        includesAny(html, ['directory']) &&
        !includesAny(html, ['saas', 'startup', 'ai tool', 'software directory']);
      return { hit, evidence: hit ? ['Detected niche directory listing pattern'] : [] };
    },
  },
  {
    id: 'wiki_submission',
    weight: 30,
    match: (s) => {
      const hit =
        s.hasWiki ||
        includesAny(lowerJoin([...s.navTexts, ...s.buttonTexts]), [
          'wiki',
          'edit this page',
          'mediawiki',
          'contribute to wiki',
        ]);
      return { hit, evidence: hit ? ['Detected wiki contribution UI'] : [] };
    },
  },
  {
    id: 'link_exchange',
    weight: 26,
    match: (_s, html) => {
      const hit = includesAny(html, ['link exchange', 'exchange links', 'link partners']);
      return { hit, evidence: hit ? ['Detected link exchange page'] : [] };
    },
  },
  {
    id: 'broken_link',
    weight: 22,
    match: (_s, html) => {
      const hit = includesAny(html, ['broken link', 'dead link', '404 resource']);
      return { hit, evidence: hit ? ['Detected broken-link opportunity hints'] : [] };
    },
  },
];

function typeMeta(id: string) {
  return OPPORTUNITY_CLASSIFICATION_TYPES.find((t) => t.id === id);
}

/** Extract structural signals from HTML — never classify from domain alone. */
export function extractWebsiteSignals(
  htmlRaw: string,
  opts: { robotsOk?: boolean; sitemapFound?: boolean; fetchOk?: boolean } = {}
): WebsiteInspectionSignals {
  const html = htmlRaw.slice(0, 120_000).toLowerCase();
  const pick = (re: RegExp, limit = 20): string[] => {
    const out: string[] = [];
    let m: RegExpExecArray | null;
    const r = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
    while ((m = r.exec(html)) && out.length < limit) {
      const v = (m[1] ?? m[0]).replace(/\s+/g, ' ').trim();
      if (v.length > 1 && v.length < 120) out.push(v);
    }
    return out;
  };

  const title = html
    .match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
    ?.replace(/<[^>]+>/g, '')
    .trim();
  const metaDescription =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i)?.[1];
  const metaKeywords =
    html.match(/<meta[^>]+name=["']keywords["'][^>]+content=["']([^"']+)["']/i)?.[1];

  const navBlock = html.match(/<nav[\s\S]{0,12000}?<\/nav>/gi)?.join(' ') ?? '';
  const footerBlock = html.match(/<footer[\s\S]{0,12000}?<\/footer>/gi)?.join(' ') ?? '';
  const headerBlock = html.match(/<header[\s\S]{0,8000}?<\/header>/gi)?.join(' ') ?? '';
  const navCombined = `${navBlock} ${headerBlock}`;

  const navTexts = pick(/>([a-z0-9][^<]{2,60})</i, 40).filter((t) =>
    /write|submit|add|join|upload|directory|forum|community|resource|press|job|review|sponsor|profile|business|listing|article|blog|video|image|podcast|marketplace|coupon|event|scholarship|wiki|qa|question/.test(
      t
    )
  );

  const buttonTexts = [
    ...pick(/<button[^>]*>([\s\S]*?)<\/button>/i, 25).map((t) => t.replace(/<[^>]+>/g, '')),
    ...pick(/<a[^>]*class=["'][^"']*btn[^"']*["'][^>]*>([\s\S]*?)<\/a>/i, 20).map((t) =>
      t.replace(/<[^>]+>/g, '')
    ),
    ...pick(/value=["']([^"']{2,60})["']/i, 15),
  ];
  const formActions = pick(/<form[^>]*action=["']([^"']+)["']/i, 15);
  const formLabels = pick(/<label[^>]*>([\s\S]*?)<\/label>/i, 30).map((t) =>
    t.replace(/<[^>]+>/g, '')
  );
  const anchorTexts = pick(/<a[^>]*>([\s\S]*?)<\/a>/i, 50).map((t) => t.replace(/<[^>]+>/g, ''));
  const h1 = pick(/<h1[^>]*>([\s\S]*?)<\/h1>/i, 5).map((t) => t.replace(/<[^>]+>/g, ''));
  const schemaTypes = pick(/"@type"\s*:\s*"([^"]+)"/i, 20);
  const footerTexts = pick(/>([a-z0-9][^<]{2,50})</i, 15);

  const blob = `${html} ${navCombined} ${footerBlock}`;

  return {
    title,
    metaDescription,
    metaKeywords,
    h1,
    navTexts: [
      ...navTexts,
      ...pick(/>([a-z][^<]{3,40})</i, 30).filter((t) => navCombined.includes(t)),
    ].slice(0, 40),
    footerTexts,
    buttonTexts: buttonTexts.map((t) => t.trim()).filter(Boolean).slice(0, 40),
    formActions,
    formLabels: formLabels.map((t) => t.trim()).filter(Boolean).slice(0, 40),
    anchorTexts: anchorTexts.map((t) => t.trim()).filter(Boolean).slice(0, 60),
    schemaTypes,
    hasWriteForUs: includesAny(blob, [
      'write for us',
      'guest post',
      'guest blog',
      'become a writer',
      'contributor guidelines',
    ]),
    hasSubmitListing: includesAny(blob, [
      'submit listing',
      'add listing',
      'submit your listing',
      'directory submission',
    ]),
    hasAddBusiness: includesAny(blob, [
      'add business',
      'add your business',
      'list your business',
      'claim your business',
    ]),
    hasCreateProfile: includesAny(blob, [
      'create profile',
      'create your profile',
      'complete your profile',
    ]),
    hasUpload: includesAny(blob, ['type="file"', 'upload', 'dropzone', 'drag and drop']),
    hasForum: includesAny(blob, ['forum', 'discussion board', 'phpbb', 'discourse']),
    hasQa: includesAny(blob, ['ask a question', 'q&a', 'answered', 'stackoverflow', 'quora']),
    hasMarketplace: includesAny(blob, ['marketplace', 'sell your', 'vendor portal']),
    hasVideoUpload: includesAny(blob, ['upload video', 'submit video', 'video submission']),
    hasImageGallery: includesAny(blob, [
      'upload image',
      'photo gallery',
      'image submission',
      'submit photo',
    ]),
    hasPodcast: includesAny(blob, ['podcast', 'episode submit', 'be a guest on']),
    hasPressRoom: includesAny(blob, ['press release', 'press room', 'newswire', 'media center']),
    hasResourcePage: includesAny(blob, ['resources', 'useful links', 'recommended resources']),
    hasEventSubmit: includesAny(blob, ['submit event', 'add event', 'post an event']),
    hasJobBoard: includesAny(blob, ['post a job', 'job board', 'submit job']),
    hasCoupon: includesAny(blob, ['coupon', 'promo code', 'discount code']),
    hasWiki: includesAny(blob, ['mediawiki', 'edit this page', 'wiki']),
    hasReview: includesAny(blob, ['write a review', 'aggregaterating', 'leave a review']),
    hasScholarship: includesAny(blob, ['scholarship', 'scholarships']),
    hasSponsor: includesAny(blob, ['sponsorship', 'become a sponsor', 'sponsor us']),
    robotsAllowsCrawl: opts.robotsOk !== false,
    sitemapFound: Boolean(opts.sitemapFound),
    fetchOk: opts.fetchOk !== false,
    rawSnippet: html.slice(0, 4000),
  };
}

export function classifyFromWebsiteInspection(
  signals: WebsiteInspectionSignals,
  opts: {
    learning?: LearningPattern[];
    domain?: string;
    fallbackType?: BacklinkTypeId;
  } = {}
): ClassificationDecision {
  const html = (signals.rawSnippet ?? '').toLowerCase();
  const scores = new Map<string, { score: number; evidence: string[] }>();

  for (const rule of RULES) {
    const { hit, evidence } = rule.match(signals, html);
    if (!hit) continue;
    const prev = scores.get(rule.id) ?? { score: 0, evidence: [] };
    prev.score += rule.weight;
    prev.evidence.push(...evidence);
    scores.set(rule.id, prev);
  }

  for (const pattern of opts.learning ?? []) {
    const domainHit =
      pattern.domainHint && opts.domain
        ? opts.domain.includes(pattern.domainHint.replace(/^www\./, ''))
        : false;
    const keywordHit = pattern.keywords.some((k) => html.includes(k.toLowerCase()));
    const navHit = pattern.navigation.some((n) =>
      lowerJoin(signals.navTexts).includes(n.toLowerCase())
    );
    const flowHit = pattern.submissionFlow.some((f) => html.includes(f.toLowerCase()));
    if (domainHit || keywordHit || navHit || flowHit) {
      const prev = scores.get(pattern.toType) ?? { score: 0, evidence: [] };
      prev.score += 18 + Math.min(12, pattern.count * 2);
      prev.evidence.push(
        `Learned correction → ${pattern.toType} (${pattern.count} prior correction${pattern.count === 1 ? '' : 's'})`
      );
      scores.set(pattern.toType, prev);
    }
  }

  if (signals.formActions.length > 0) {
    for (const [id, row] of scores) {
      if (
        ['directory_submission', 'business_directory', 'guest_post', 'profile_creation'].includes(
          id
        )
      ) {
        row.score += 4;
        scores.set(id, row);
      }
    }
  }
  if (signals.schemaTypes.some((t) => /organization|localbusiness|product/i.test(t))) {
    const id = 'business_directory';
    const prev = scores.get(id) ?? { score: 0, evidence: [] };
    prev.score += 6;
    prev.evidence.push(`Schema.org type hint: ${signals.schemaTypes.slice(0, 3).join(', ')}`);
    scores.set(id, prev);
  }

  const ranked = [...scores.entries()]
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.score - a.score);

  if (ranked.length === 0 || ranked[0]!.score < 18) {
    const outreach = !signals.fetchOk
      ? {
          id: 'outreach_required' as const,
          reason: 'Site unreachable or incomplete inspection — manual outreach required.',
        }
      : {
          id: 'unknown' as const,
          reason:
            'No strong submission UI, forms, or navigation patterns detected after page inspection.',
        };
    const meta = typeMeta(outreach.id)!;
    return {
      classificationId: outreach.id,
      displayName: meta.displayName,
      backlinkType: meta.storageType as BacklinkTypeId,
      confidence: signals.fetchOk ? 42 : 35,
      reason: outreach.reason,
      evidence: [
        signals.fetchOk ? 'Homepage inspected' : 'Fetch failed or blocked',
        signals.sitemapFound ? 'Sitemap present' : 'No sitemap confirmed',
      ],
      workflowQueue: meta.queue,
      assignedAgent: meta.agent,
      alternatives: [],
    };
  }

  const top = ranked[0]!;
  const meta = typeMeta(top.id) ?? typeMeta('unknown')!;
  const second = ranked[1]?.score ?? 0;
  const margin = top.score - second;
  const confidence = Math.min(
    99,
    Math.round(55 + Math.min(35, top.score * 0.55) + Math.min(10, margin * 0.4))
  );

  return {
    classificationId: meta.id,
    displayName: meta.displayName,
    backlinkType: meta.storageType as BacklinkTypeId,
    confidence,
    reason: top.evidence[0] ?? `Ranked highest from site structure signals (score ${top.score}).`,
    evidence: top.evidence.slice(0, 6),
    workflowQueue: meta.queue,
    assignedAgent: meta.agent,
    alternatives: ranked.slice(1, 4).map((r) => {
      const m = typeMeta(r.id);
      return {
        id: r.id,
        confidence: Math.min(95, Math.round(40 + r.score * 0.5)),
        displayName: m?.displayName ?? r.id,
      };
    }),
  };
}

export function buildLearningPatternFromCorrection(input: {
  fromType?: string;
  toType: string;
  domain?: string;
  signals?: WebsiteInspectionSignals;
  existing?: LearningPattern | null;
}): LearningPattern {
  const s = input.signals;
  const keywords = [...(s?.buttonTexts ?? []).slice(0, 8), ...(s?.formLabels ?? []).slice(0, 6)]
    .map((k) => k.toLowerCase())
    .filter((k) => k.length > 3);

  return {
    fromType: input.fromType,
    toType: input.toType,
    domainHint: input.domain?.replace(/^www\./, '').toLowerCase(),
    keywords: [...new Set([...(input.existing?.keywords ?? []), ...keywords])].slice(0, 40),
    selectors: input.existing?.selectors ?? [],
    navigation: [...new Set([...(input.existing?.navigation ?? []), ...(s?.navTexts ?? [])])].slice(
      0,
      30
    ),
    submissionFlow: [
      ...new Set([
        ...(input.existing?.submissionFlow ?? []),
        ...(s?.formActions ?? []),
        ...(s?.hasSubmitListing ? ['submit listing'] : []),
        ...(s?.hasWriteForUs ? ['write for us'] : []),
      ]),
    ].slice(0, 30),
    correctedAt: new Date().toISOString(),
    count: (input.existing?.count ?? 0) + 1,
  };
}

export function summarizeClassificationCounts(
  decisions: Array<{ classificationId: string; displayName?: string }>
): Array<{ id: string; label: string; count: number }> {
  const map = new Map<string, { id: string; label: string; count: number }>();
  for (const d of decisions) {
    const meta = typeMeta(d.classificationId);
    const label = d.displayName ?? meta?.displayName ?? d.classificationId;
    const prev = map.get(d.classificationId) ?? { id: d.classificationId, label, count: 0 };
    prev.count += 1;
    map.set(d.classificationId, prev);
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

export function getClassificationLabel(id: string): string {
  return (
    typeMeta(id)?.displayName ??
    getTypeLabel(id) ??
    BACKLINK_TYPES.find((t) => t.id === id)?.displayName ??
    id.replace(/_/g, ' ')
  );
}

export function agentForQueue(queue: ClassificationQueue): ClassificationAgentId {
  const hit = CLASSIFICATION_AGENTS.find((a) => (a.queues as readonly string[]).includes(queue));
  return hit?.id ?? 'verification_agent';
}

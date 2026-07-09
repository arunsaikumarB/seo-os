/** Website profile aggregation — Epic 3 */

import type { BrandProfile, TechFingerprint } from './website-analyzer.js';
import type { PageIntelligence, PageType } from './page-intelligence.js';

export interface WebsiteProfileData {
  domain: string;
  websiteName?: string;
  description?: string;
  category?: string;
  country?: string;
  language?: string;
  cms?: string;
  technologyStack: string[];
  domainAuthority?: number;
  estimatedTraffic?: number;
  contactEmail?: string;
  hasContactForm: boolean;
  authorPages: string[];
  socialLinks: string[];
  submissionGuidelines?: string;
  editorialGuidelines?: string;
  guestPostAvailable: boolean;
  resourcePages: string[];
  brokenLinks: Array<{ url: string; status: number }>;
  opportunityTypes: string[];
  faqPages: string[];
  robotsTxt?: string;
  sitemapUrl?: string;
  confidenceScore: number;
}

function hashDomain(domain: string): number {
  let h = 0;
  for (let i = 0; i < domain.length; i++) h = (h * 31 + domain.charCodeAt(i)) >>> 0;
  return h;
}

function estimateDa(domain: string): number {
  const base = 15 + (hashDomain(domain) % 55);
  if (domain.endsWith('.edu')) return Math.min(85, base + 25);
  if (domain.endsWith('.gov')) return Math.min(90, base + 30);
  return base;
}

function detectCategory(topics: string[], domain: string): string {
  const text = `${topics.join(' ')} ${domain}`.toLowerCase();
  if (/saas|software|tech|dev|cloud|ai/.test(text)) return 'technology';
  if (/food|recipe|chef|restaurant/.test(text)) return 'food';
  if (/marketing|seo|advertis/.test(text)) return 'marketing';
  if (/health|medical|fitness/.test(text)) return 'health';
  return 'general';
}

export function buildWebsiteProfile(
  domain: string,
  pages: Array<{
    url: string;
    meta: { title?: string; metaDescription?: string; h1?: string };
    intelligence: PageIntelligence;
    pageType: PageType;
  }>,
  brand: BrandProfile,
  tech: TechFingerprint,
  opts: { robotsTxt?: string; sitemapUrl?: string } = {}
): WebsiteProfileData {
  const contactEmails = pages.flatMap((p) => p.intelligence.contactEmails);
  const socialLinks = [...new Set(pages.flatMap((p) => p.intelligence.socialLinks))];
  const resourcePages = pages.filter((p) => p.pageType === 'resource').map((p) => p.url);
  const authorPages = pages.filter((p) => p.pageType === 'author').map((p) => p.url);
  const faqPages = pages.filter((p) => p.pageType === 'faq').map((p) => p.url);
  const guestPostAvailable = pages.some((p) => p.pageType === 'guest_post');
  const hasContactForm = pages.some((p) => p.intelligence.hasContactForm);
  const editorial = pages.find((p) => p.intelligence.editorialGuidelines)?.intelligence
    .editorialGuidelines;
  const submission = pages.find((p) => p.intelligence.submissionGuidelines)?.intelligence
    .submissionGuidelines;

  const opportunityTypes: string[] = [];
  if (guestPostAvailable) opportunityTypes.push('guest_post');
  if (resourcePages.length) opportunityTypes.push('resource_page');
  if (pages.some((p) => p.intelligence.brokenLinks.length)) opportunityTypes.push('broken_link');
  if (pages.some((p) => p.pageType === 'contact')) opportunityTypes.push('brand_mention');
  if (!opportunityTypes.length) opportunityTypes.push('resource_page');

  const topics = brand.primaryTopics ?? [];
  const da = estimateDa(domain);

  let confidence = 40;
  if (pages.length >= 5) confidence += 15;
  if (contactEmails.length) confidence += 10;
  if (guestPostAvailable) confidence += 15;
  if (tech.cms) confidence += 10;
  if (socialLinks.length) confidence += 5;

  return {
    domain,
    websiteName: brand.siteName,
    description: brand.tagline,
    category: detectCategory(topics, domain),
    country: 'US',
    language: 'en',
    cms: tech.cms,
    technologyStack: [...(tech.frameworks ?? []), ...(tech.analytics ?? [])],
    domainAuthority: da,
    estimatedTraffic: Math.round((da / 100) * 50000),
    contactEmail: contactEmails[0],
    hasContactForm,
    authorPages,
    socialLinks,
    submissionGuidelines: submission,
    editorialGuidelines: editorial,
    guestPostAvailable,
    resourcePages,
    brokenLinks: pages.flatMap((p) => p.intelligence.brokenLinks),
    opportunityTypes,
    faqPages,
    robotsTxt: opts.robotsTxt,
    sitemapUrl: opts.sitemapUrl,
    confidenceScore: Math.min(95, confidence),
  };
}

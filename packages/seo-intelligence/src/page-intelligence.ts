/** Page-level intelligence extraction — Epic 3 */

import type { PageMetadata } from './website-analyzer.js';

export type PageType =
  | 'homepage'
  | 'contact'
  | 'guest_post'
  | 'resource'
  | 'author'
  | 'faq'
  | 'editorial'
  | 'submission'
  | 'content'
  | 'other';

export interface PageIntelligence {
  pageType: PageType;
  contactEmails: string[];
  hasContactForm: boolean;
  authorNames: string[];
  editorialGuidelines?: string;
  submissionGuidelines?: string;
  externalLinks: string[];
  brokenLinks: Array<{ url: string; status: number }>;
  socialLinks: string[];
}

const CONTACT_PATHS = /contact|get-in-touch|reach-us|support/i;
const GUEST_POST_PATHS = /write-for-us|guest-post|contribute|submit-article|become-a-contributor/i;
const RESOURCE_PATHS = /resources|links|tools|useful-links/i;
const AUTHOR_PATHS = /author|team|about|staff|contributors/i;
const FAQ_PATHS = /faq|frequently-asked|help/i;
const EDITORIAL_PATHS = /editorial|guidelines|submission|policy/i;

export function classifyPageType(url: string, html: string, _meta: PageMetadata): PageType {
  const path = new URL(url).pathname.toLowerCase();
  const text = html.toLowerCase();
  if (path === '/' || path === '') return 'homepage';
  if (CONTACT_PATHS.test(path) || text.includes('contact form')) return 'contact';
  if (GUEST_POST_PATHS.test(path)) return 'guest_post';
  if (RESOURCE_PATHS.test(path)) return 'resource';
  if (AUTHOR_PATHS.test(path)) return 'author';
  if (FAQ_PATHS.test(path)) return 'faq';
  if (EDITORIAL_PATHS.test(path)) return 'editorial';
  if (/submit|submission/i.test(path)) return 'submission';
  return 'content';
}

export function extractEmails(html: string): string[] {
  const matches = html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? [];
  return [...new Set(matches.filter((e) => !e.endsWith('.png') && !e.endsWith('.jpg')))].slice(
    0,
    5
  );
}

export function detectContactForm(html: string): boolean {
  return /<form[^>]*>/i.test(html) && /contact|email|message|submit/i.test(html);
}

export function extractAuthorNames(html: string): string[] {
  const authors: string[] = [];
  const relAuthor = html.matchAll(/rel=["']author["'][^>]*>([^<]+)</gi);
  for (const m of relAuthor) authors.push(m[1].trim());
  const byline = html.match(/(?:by|author)[:\s]+([A-Z][a-z]+ [A-Z][a-z]+)/gi);
  if (byline) authors.push(...byline.map((b) => b.replace(/^(by|author)[:\s]+/i, '').trim()));
  return [...new Set(authors)].slice(0, 5);
}

export function extractExternalLinks(html: string, origin: string): string[] {
  const links: string[] = [];
  const matches = html.matchAll(/href=["']([^"']+)["']/gi);
  for (const m of matches) {
    const href = m[1];
    if (href.startsWith('http') && !href.startsWith(origin)) links.push(href);
  }
  return [...new Set(links)].slice(0, 50);
}

export function extractSocialLinks(html: string): string[] {
  const patterns = [
    /https?:\/\/(?:www\.)?twitter\.com\/[^"'\s]+/gi,
    /https?:\/\/(?:www\.)?linkedin\.com\/[^"'\s]+/gi,
    /https?:\/\/(?:www\.)?facebook\.com\/[^"'\s]+/gi,
    /https?:\/\/(?:www\.)?instagram\.com\/[^"'\s]+/gi,
    /https?:\/\/(?:www\.)?youtube\.com\/[^"'\s]+/gi,
  ];
  const links: string[] = [];
  for (const p of patterns) {
    const m = html.match(p);
    if (m) links.push(...m);
  }
  return [...new Set(links)];
}

export function extractGuidelines(
  html: string,
  type: 'editorial' | 'submission'
): string | undefined {
  const keyword = type === 'editorial' ? 'editorial' : 'submission';
  const section = html.match(
    new RegExp(`<(?:h[1-3]|section)[^>]*>[^<]*${keyword}[^<]*</[^>]+>[\\s\\S]{0,800}`, 'i')
  );
  if (!section) return undefined;
  return section[0]
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

export function analyzePageIntelligence(
  url: string,
  html: string,
  meta: PageMetadata,
  origin: string
): PageIntelligence {
  const pageType = classifyPageType(url, html, meta);
  return {
    pageType,
    contactEmails: extractEmails(html),
    hasContactForm: detectContactForm(html),
    authorNames: extractAuthorNames(html),
    editorialGuidelines: extractGuidelines(html, 'editorial'),
    submissionGuidelines: extractGuidelines(html, 'submission'),
    externalLinks: extractExternalLinks(html, origin),
    brokenLinks: [],
    socialLinks: extractSocialLinks(html),
  };
}

export function simpleContentHash(content: string): string {
  let h = 0;
  for (let i = 0; i < content.length; i++) h = (h * 31 + content.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

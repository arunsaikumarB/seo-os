/** Contact discovery from public page data — Epic 4 */

import type { ContactRole } from './relationship-agent.js';

export interface DiscoveredContact {
  name: string;
  role: ContactRole;
  department?: string;
  publicEmail?: string;
  linkedinUrl?: string;
  twitterUrl?: string;
  githubUrl?: string;
  authorPageUrl?: string;
  bio?: string;
  preferredContactMethod: 'email' | 'form' | 'linkedin' | 'twitter' | 'unknown';
  confidenceScore: number;
}

const ROLE_PATTERNS: Array<{ pattern: RegExp; role: ContactRole }> = [
  { pattern: /\beditor\b/i, role: 'Editor' },
  { pattern: /\bmarketing\b/i, role: 'Marketing Manager' },
  { pattern: /\bseo\b/i, role: 'SEO Manager' },
  { pattern: /\bcontent\b/i, role: 'Content Manager' },
  { pattern: /\bfounder\b|\bceo\b|\bowner\b/i, role: 'Founder' },
  { pattern: /\bpartnership\b/i, role: 'Partnerships' },
  { pattern: /\bauthor\b|\bcontributor\b|\bwriter\b/i, role: 'Contributing Author' },
  { pattern: /\bwebmaster\b/i, role: 'Webmaster' },
];

export function detectRoleFromText(text: string): ContactRole {
  for (const { pattern, role } of ROLE_PATTERNS) {
    if (pattern.test(text)) return role;
  }
  return 'Unknown';
}

export function extractContactsFromPages(
  pages: Array<{
    url: string;
    pageType?: string;
    title?: string;
    html?: string;
    emails?: string[];
    authorNames?: string[];
    socialLinks?: string[];
  }>
): DiscoveredContact[] {
  const contacts: DiscoveredContact[] = [];
  const seen = new Set<string>();

  for (const page of pages) {
    const emails = page.emails ?? [];
    const authors = page.authorNames ?? [];
    const socials = page.socialLinks ?? [];
    const linkedin = socials.find((s) => s.includes('linkedin.com'));
    const twitter = socials.find((s) => s.includes('twitter.com') || s.includes('x.com'));
    const github = socials.find((s) => s.includes('github.com'));

    if (page.pageType === 'contact' && emails.length) {
      const email = emails[0];
      if (!seen.has(email)) {
        seen.add(email);
        contacts.push({
          name: 'Editorial Contact',
          role: detectRoleFromText(page.title ?? 'contact'),
          publicEmail: email,
          linkedinUrl: linkedin,
          twitterUrl: twitter,
          preferredContactMethod: 'email',
          confidenceScore: 75,
        });
      }
    }

    for (const author of authors) {
      const key = author.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      contacts.push({
        name: author,
        role: 'Contributing Author',
        authorPageUrl: page.pageType === 'author' ? page.url : undefined,
        linkedinUrl: linkedin,
        twitterUrl: twitter,
        githubUrl: github,
        preferredContactMethod: linkedin ? 'linkedin' : 'email',
        confidenceScore: 65,
        bio: page.title ? `Contributor at ${page.title}` : undefined,
      });
    }

    if (page.pageType === 'guest_post' || page.pageType === 'editorial') {
      contacts.push({
        name: 'Editorial Team',
        role: 'Editor',
        publicEmail: emails[0],
        preferredContactMethod: emails.length ? 'email' : 'form',
        confidenceScore: 70,
      });
    }
  }

  return contacts.slice(0, 10);
}

export function buildOrganizationFromProfile(profile: {
  domain: string;
  website_name?: string;
  category?: string;
  country?: string;
  language?: string;
  contact_email?: string;
  social_links?: string[];
  author_pages?: string[];
  resource_pages?: string[];
  guest_post_available?: boolean;
  detected_pages?: Record<string, string>;
}): {
  companyName: string;
  domain: string;
  industry?: string;
  country?: string;
  language?: string;
  teamPageUrl?: string;
  contactPageUrl?: string;
  editorialPageUrl?: string;
  submissionPageUrl?: string;
  socialProfiles: Record<string, string>;
} {
  const pages = profile.detected_pages ?? {};
  const socials: Record<string, string> = {};
  for (const link of profile.social_links ?? []) {
    if (link.includes('linkedin')) socials.linkedin = link;
    if (link.includes('twitter') || link.includes('x.com')) socials.twitter = link;
    if (link.includes('facebook')) socials.facebook = link;
  }

  return {
    companyName: profile.website_name ?? profile.domain.replace(/^www\./, '').split('.')[0],
    domain: profile.domain,
    industry: profile.category,
    country: profile.country,
    language: profile.language,
    teamPageUrl: pages.team ?? profile.author_pages?.[0],
    contactPageUrl: pages.contact,
    editorialPageUrl: pages.guestPost,
    submissionPageUrl: pages.submission,
    socialProfiles: socials,
  };
}

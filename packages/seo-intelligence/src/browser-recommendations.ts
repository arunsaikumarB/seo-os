/** AI summary and recommendations — Epic 3 Browser Intelligence */

import type { WebsiteProfileData } from './website-profile.js';

export interface BrowserRecommendations {
  bestStrategy: string;
  estimatedSuccess: number;
  recommendedCampaign?: string;
  suggestedContent: string;
  suggestedAnchor: string;
  suggestedLandingPage: string;
  recommendedContact?: string;
  riskAssessment: string;
  summary: string;
}

export function generateAiSummary(profile: WebsiteProfileData): string {
  const lines: string[] = [];
  lines.push(`This website focuses on ${profile.category ?? 'general'} content.`);
  if (profile.websiteName) lines.push(`Site: ${profile.websiteName}.`);
  if (profile.guestPostAvailable) lines.push('Accepts guest posts.');
  if (profile.resourcePages.length) lines.push('Provides resource pages.');
  if (profile.editorialGuidelines) lines.push('Editorial review likely required.');
  else if (profile.guestPostAvailable) lines.push('Editorial review takes approximately one week.');
  if (profile.contactEmail) lines.push(`Contact: ${profile.contactEmail}.`);
  return lines.join('\n');
}

export function generateRecommendations(
  profile: WebsiteProfileData,
  projectDomain?: string
): BrowserRecommendations {
  const strategy = profile.guestPostAvailable
    ? 'Guest Post'
    : profile.resourcePages.length
      ? 'Resource Page'
      : (profile.opportunityTypes[0]?.replace(/_/g, ' ') ?? 'Outreach');

  let success = profile.confidenceScore;
  if (profile.guestPostAvailable) success = Math.min(95, success + 10);
  if (profile.domainAuthority && profile.domainAuthority >= 50) success = Math.min(95, success + 5);

  const risk =
    profile.confidenceScore < 50
      ? 'Low confidence scan — verify contact details manually before outreach.'
      : profile.hasContactForm
        ? 'Contact form detected — human submission required. Do not auto-submit.'
        : 'Standard outreach risk. Respect editorial guidelines and website terms.';

  const summary = `${generateAiSummary(profile)}\n\nRecommended strategy:\n${strategy}\n\nSuccess probability:\n${success}%`;

  return {
    bestStrategy: strategy,
    estimatedSuccess: success,
    recommendedCampaign: `${profile.category ?? 'General'} Outreach`,
    suggestedContent: profile.guestPostAvailable
      ? 'Custom guest post tailored to their audience with data-backed insights.'
      : 'Personalized outreach email highlighting mutual value.',
    suggestedAnchor: projectDomain ? `${projectDomain.split('.')[0]} guide` : 'brand resource',
    suggestedLandingPage: projectDomain ? `https://${projectDomain}/` : '/',
    recommendedContact: profile.contactEmail,
    riskAssessment: risk,
    summary,
  };
}

/** Backlink type recommendation engine with WHY rationales */

export interface TypeRecommendation {
  type: string;
  score: number;
  rationale: string;
  metricsSource: 'estimated';
}

export function recommendBacklinkTypes(input: {
  industry?: string;
  primaryKeywords?: string[];
  domainAuthorityHint?: number;
}): TypeRecommendation[] {
  const industry = (input.industry ?? 'general').toLowerCase();
  const kws = (input.primaryKeywords ?? []).map((k) => k.toLowerCase());
  const da = input.domainAuthorityHint ?? 40;

  const recs: TypeRecommendation[] = [
    {
      type: 'guest_post',
      score: 78 + (industry === 'marketing' || industry === 'technology' ? 8 : 0),
      rationale: `Guest posts build topical authority for ${industry} brands and support long-form keyword coverage.`,
      metricsSource: 'estimated',
    },
    {
      type: 'directory',
      score: 70,
      rationale: 'Directories provide consistent citation signals and are efficient for assisted submission workflows.',
      metricsSource: 'estimated',
    },
    {
      type: 'resource_page',
      score: 72,
      rationale: 'Resource pages often accept high-quality links when relevance is clear from your primary keywords.',
      metricsSource: 'estimated',
    },
    {
      type: 'qa_site',
      score: 65,
      rationale: 'Q&A platforms capture question-intent keywords and drive referral awareness.',
      metricsSource: 'estimated',
    },
    {
      type: 'forum',
      score: 58,
      rationale: 'Forums help relationship-building; moderation and login steps require human confirmation.',
      metricsSource: 'estimated',
    },
    {
      type: 'broken_link',
      score: 68,
      rationale: 'Broken-link replacements convert editorial goodwill into contextual backlinks.',
      metricsSource: 'estimated',
    },
    {
      type: 'press_release',
      score: da >= 45 ? 62 : 48,
      rationale: 'Press syndication amplifies brand mentions when the project has enough authority to earn pickup.',
      metricsSource: 'estimated',
    },
    {
      type: 'podcast',
      score: 55,
      rationale: 'Podcast guesting expands brand mentions and referral traffic beyond traditional link pages.',
      metricsSource: 'estimated',
    },
    {
      type: 'image_sharing',
      score: 52,
      rationale: 'Image submissions support visual assets prepared in Image Studio (metadata-first in V1.1).',
      metricsSource: 'estimated',
    },
    {
      type: 'video_sharing',
      score: 54,
      rationale: 'Video profiles and descriptions reinforce topical relevance for multimedia-friendly niches.',
      metricsSource: 'estimated',
    },
    {
      type: 'business_citation',
      score: industry.includes('local') || kws.some((k) => k.includes('near me')) ? 75 : 60,
      rationale: 'Business citations strengthen NAP consistency and local/entity signals.',
      metricsSource: 'estimated',
    },
    {
      type: 'brand_mention',
      score: 66,
      rationale: 'Unlinked brand mentions can be converted into links via relationship outreach.',
      metricsSource: 'estimated',
    },
  ];

  return recs.sort((a, b) => b.score - a.score);
}

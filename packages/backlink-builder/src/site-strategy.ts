/**
 * Submission strategy selector — Phase 5 §7.
 */
import type { ClassifiedPage, PageIntent } from './page-intent-detectors.js';

export const SUBMISSION_STRATEGIES = [
  'Direct Submission Form',
  'Guest Post',
  'Comment Posting',
  'Platform Form',
  'Dashboard Submission',
  'Registration Strategy',
  'Contact Form',
  'Email Outreach',
  'Unsupported',
] as const;

export type SubmissionStrategyName = (typeof SUBMISSION_STRATEGIES)[number];

export type ExpectedIntervention = 'Login Required' | 'Registration Required' | 'CAPTCHA';

export type StrategyPlan = {
  chosen: SubmissionStrategyName;
  reasoning: string;
  entryUrl: string | null;
  expectedInterventions: ExpectedIntervention[];
  fallbacks: Array<{
    strategy: SubmissionStrategyName;
    entryUrl: string | null;
    reason: string;
  }>;
  /** Capability 1 */
  wordpressStrategy?: string;
  payloadHints?: {
    fields?: string[];
    skip?: string[];
    emailAddress?: string | null;
    emailSubject?: string | null;
    moveToOutreach?: boolean;
  };
};

function findIntent(
  pages: ClassifiedPage[],
  intents: PageIntent | PageIntent[]
): ClassifiedPage | undefined {
  const set = new Set(Array.isArray(intents) ? intents : [intents]);
  return pages
    .filter((p) => set.has(p.intent) && p.confidence >= 0.55)
    .sort((a, b) => b.confidence - a.confidence)[0];
}

/**
 * Choose ONE primary strategy + ordered fallbacks from evidence-backed classifications.
 */
export function selectSubmissionStrategy(pages: ClassifiedPage[]): StrategyPlan {
  const candidates: Array<{
    strategy: SubmissionStrategyName;
    page: ClassifiedPage;
    expected: ExpectedIntervention[];
    reason: string;
  }> = [];

  const submission = findIntent(pages, 'Submission Form');
  const writeForUs = findIntent(pages, 'Write For Us');
  if (submission) {
    candidates.push({
      strategy: 'Direct Submission Form',
      page: submission,
      expected: [],
      reason: `Verified Submission Form at ${submission.url}`,
    });
  } else if (
    writeForUs &&
    writeForUs.confidence >= 0.85 &&
    /write-for-us|guest-post|contribute|submit-/i.test(writeForUs.url)
  ) {
    candidates.push({
      strategy: 'Direct Submission Form',
      page: writeForUs,
      expected: [],
      reason: `Write For Us page at ${writeForUs.url} (form may load on page)`,
    });
  }

  const google = findIntent(pages, 'Google Form');
  const typeform = findIntent(pages, 'Typeform');
  const platform = google ?? typeform;
  if (platform) {
    candidates.push({
      strategy: 'Platform Form',
      page: platform,
      expected: [],
      reason: `Verified ${platform.intent} at ${platform.url}`,
    });
  }

  const dashboard = findIntent(pages, 'Dashboard');
  const login = findIntent(pages, 'Login');
  const registration = findIntent(pages, 'Registration');
  if (dashboard && (login || registration)) {
    candidates.push({
      strategy: 'Dashboard Submission',
      page: login ?? registration ?? dashboard,
      expected: registration && !login ? ['Registration Required'] : ['Login Required'],
      reason: `Dashboard path requires account (login at ${(login ?? registration)!.url})`,
    });
  }

  const contact = findIntent(pages, 'Contact');
  if (contact) {
    candidates.push({
      strategy: 'Contact Form',
      page: contact,
      expected: [],
      reason: `Verified Contact form at ${contact.url}`,
    });
  }

  const emailPage =
    findIntent(pages, 'Email Only') ??
    pages.find((p) => p.intent === 'Guest Post Guidelines' && p.emailAddress);
  if (emailPage?.emailAddress || findIntent(pages, 'Email Only')) {
    const ep = emailPage ?? findIntent(pages, 'Email Only')!;
    candidates.push({
      strategy: 'Email Outreach',
      page: ep,
      expected: [],
      reason: `Email-only path${ep.emailAddress ? ` (${ep.emailAddress})` : ''}`,
    });
  }

  // Preference order
  const order: SubmissionStrategyName[] = [
    'Guest Post',
    'Direct Submission Form',
    'Platform Form',
    'Comment Posting',
    'Dashboard Submission',
    'Registration Strategy',
    'Contact Form',
    'Email Outreach',
  ];
  candidates.sort(
    (a, b) => order.indexOf(a.strategy) - order.indexOf(b.strategy)
  );

  if (candidates.length === 0) {
    return {
      chosen: 'Unsupported',
      reasoning: 'No evidence-backed submission path found',
      entryUrl: null,
      expectedInterventions: [],
      fallbacks: [],
    };
  }

  const [primary, ...rest] = candidates;
  return {
    chosen: primary!.strategy,
    reasoning: primary!.reason,
    entryUrl: primary!.page.url,
    expectedInterventions: primary!.expected,
    fallbacks: rest.map((c) => ({
      strategy: c.strategy,
      entryUrl: c.page.url,
      reason: c.reason,
    })),
  };
}

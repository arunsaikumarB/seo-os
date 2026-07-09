export interface PageHelpContent {
  title: string;
  purpose: string;
  whyItMatters: string;
  howAiUsesIt: string;
  bestPractices: string[];
  example: string;
}

const DEFAULT_HELP: PageHelpContent = {
  title: 'SEO OS Module',
  purpose: 'This module helps you complete a step in the SEO workflow.',
  whyItMatters: 'Each step builds toward verified backlinks and measurable SEO growth.',
  howAiUsesIt: 'AI agents use your project data, knowledge base, and memory to recommend and execute tasks.',
  bestPractices: ['Complete steps in order when learning', 'Review AI suggestions before publishing'],
  example: 'A restaurant uploads their menu PDF, then AI tailors guest post pitches to food bloggers.',
};

export const PAGE_HELP: Record<string, PageHelpContent> = {
  home: {
    title: 'Project Overview',
    purpose: 'Your command center for workflow progress, next steps, and recent activity.',
    whyItMatters: 'Beginners always know where they are and what to do next.',
    howAiUsesIt: 'AI recommends the next workflow step based on what you have completed.',
    bestPractices: ['Start here after creating a project', 'Check the roadmap before jumping into modules'],
    example: 'After creating ChefGAA, you land here and see Step 3: Analyze Website highlighted.',
  },
  'mission-control': {
    title: 'Mission Control',
    purpose: 'Executive summary of website health, AI workforce, campaigns, and backlink progress.',
    whyItMatters: 'This is your final destination — one view of everything SEO OS has accomplished.',
    howAiUsesIt: 'Aggregates data from all modules into actionable KPIs and timelines.',
    bestPractices: ['Visit after completing major workflow steps', 'Share with stakeholders for reporting'],
    example: 'See 12 won backlinks, 3 active campaigns, and 5 AI agents running research tasks.',
  },
  'intelligence/browser': {
    title: 'Browser Intelligence',
    purpose: 'Crawl and analyze your website like a search engine would.',
    whyItMatters: 'You cannot optimize what you have not mapped. This discovers every page and issue.',
    howAiUsesIt: 'Feeds page structure, metadata, and tech stack into opportunity discovery.',
    bestPractices: ['Run scan after creating a project', 'Re-scan after major site changes'],
    example: 'Discovers 48 pages, contact forms, and schema markup gaps on a catering site.',
  },
  'knowledge/library': {
    title: 'Knowledge Base',
    purpose: 'Store brand documents, menus, FAQs, and policies for AI context.',
    whyItMatters: 'Generic AI content fails. Your documents teach AI your unique voice and offerings.',
    howAiUsesIt: 'Chunks documents for retrieval during content generation and outreach.',
    bestPractices: ['Upload PDFs, menus, and brand guidelines first', 'Keep documents up to date'],
    example: 'Upload a catering menu so AI mentions actual dishes in guest post pitches.',
  },
  'memory/timeline': {
    title: 'AI Memory',
    purpose: 'Persistent brand facts, goals, audience, and approved messaging.',
    whyItMatters: 'Memory ensures every AI agent stays on-brand across sessions.',
    howAiUsesIt: 'Injected into agent prompts for consistent tone and factual accuracy.',
    bestPractices: ['Review and approve memory facts', 'Add USPs and target audience details'],
    example: 'Stores "Premium corporate catering in Austin" as a core brand fact.',
  },
  'backlink-builder': {
    title: 'Backlink Builder',
    purpose: 'End-to-end backlink opportunity pipeline from discovery to verification.',
    whyItMatters: 'Backlinks remain one of the strongest ranking signals in Google.',
    howAiUsesIt: 'Classifies, scores, and drafts outreach for each opportunity type.',
    bestPractices: ['Import targets first', 'Review AI classifications before outreach'],
    example: 'Pipeline shows 32 guest post opportunities ranked by authority and relevance.',
  },
  'backlink-builder/import': {
    title: 'Import Websites',
    purpose: 'Bulk import target URLs from CSV, Excel, or manual entry.',
    whyItMatters: 'Scale outreach beyond manual research.',
    howAiUsesIt: 'Validates, deduplicates, and enriches imported domains automatically.',
    bestPractices: ['Use clean CSV with one URL per row', 'Remove obvious spam domains'],
    example: 'Import 200 food blog URLs from a prospecting spreadsheet.',
  },
  campaigns: {
    title: 'Campaign Planner',
    purpose: 'Group opportunities into coordinated outreach campaigns.',
    whyItMatters: 'Campaigns turn scattered tasks into measurable initiatives with goals.',
    howAiUsesIt: 'Suggests campaign structure based on opportunity types and priorities.',
    bestPractices: ['Set clear goals per campaign', 'Use approval gates for quality control'],
    example: 'Guest Post Q1 campaign targeting 25 food and lifestyle publications.',
  },
  'outreach/inbox': {
    title: 'Outreach Inbox',
    purpose: 'Track sent emails, replies, and negotiation status.',
    whyItMatters: 'Outreach fails without follow-up discipline.',
    howAiUsesIt: 'Drafts personalized emails and follow-ups from opportunity context.',
    bestPractices: ['Personalize every email', 'Follow up within 5 business days'],
    example: 'Thread shows opened → replied → negotiation → won for a guest post placement.',
  },
  'command-center': {
    title: 'AI Chat',
    purpose: 'Conversational interface to your SEO workforce with full project context.',
    whyItMatters: 'Ask questions in plain English instead of hunting through modules.',
    howAiUsesIt: 'Routes queries to specialized agents with knowledge and memory context.',
    bestPractices: ['Ask "what should I do next?" when stuck', 'Use for strategy brainstorming'],
    example: '"What guest post opportunities should I prioritize this week?"',
  },
};

export function getPageHelp(pathKey: string): PageHelpContent {
  if (PAGE_HELP[pathKey]) return PAGE_HELP[pathKey];
  const segment = pathKey.split('/').pop() ?? pathKey;
  if (PAGE_HELP[segment]) return PAGE_HELP[segment];
  return DEFAULT_HELP;
}

export const AI_COACH_QUESTIONS = [
  'What is SEO?',
  'What are backlinks?',
  'What is Domain Authority?',
  'Why should I upload PDFs?',
  'How does AI analyze websites?',
  'How do campaigns work?',
  'What is a guest post opportunity?',
  'How do I verify a backlink?',
];

export const AI_COACH_ANSWERS: Record<string, string> = {
  'What is SEO?':
    'SEO (Search Engine Optimization) helps your website rank higher on Google so more customers find you organically — without paying for ads.',
  'What are backlinks?':
    'Backlinks are links from other websites to yours. Google treats them as votes of confidence, which can improve your rankings.',
  'What is Domain Authority?':
    'Domain Authority is a score (0–100) estimating how likely a site is to rank. Higher authority sites provide more valuable backlinks.',
  'Why should I upload PDFs?':
    'PDFs teach AI your real products, services, and brand voice so generated content is accurate — not generic.',
  'How does AI analyze websites?':
    'Browser Intelligence crawls your site like Googlebot, extracting pages, metadata, schema, and technical issues.',
  'How do campaigns work?':
    'Campaigns group related backlink opportunities with goals, timelines, and approval workflows for organized outreach.',
  'What is a guest post opportunity?':
    'A website that accepts contributed articles. You write valuable content and earn a backlink to your site.',
  'How do I verify a backlink?':
    'Link Verification checks if the backlink is live, uses correct anchor text, and is indexed by Google.',
};

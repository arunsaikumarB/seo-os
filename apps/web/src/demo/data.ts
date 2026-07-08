/** Fixed demo IDs — stable across sessions */
export const DEMO_ORG_ID = 'demo-org-seo-os';
export const DEMO_PROJECT_CHEFGAA = 'demo-project-chefgaa';
export const DEMO_PROJECT_LOGISOFT = 'demo-project-logisoft';

export interface DemoOrganization {
  id: string;
  name: string;
  slug: string;
  industry: string;
  plan: string;
  projectCount: number;
}

export interface DemoProject {
  id: string;
  orgId: string;
  name: string;
  domain: string;
  url: string;
  industry: string;
}

export const DEMO_ORGANIZATIONS: DemoOrganization[] = [
  { id: DEMO_ORG_ID, name: 'SEO OS', slug: 'seo-os', industry: 'AI / SEO Platform', plan: 'Enterprise', projectCount: 4 },
  { id: 'demo-org-chefgaa', name: 'Chefgaa', slug: 'chefgaa', industry: 'Food & Hospitality', plan: 'Pro', projectCount: 2 },
  { id: 'demo-org-logisoft', name: 'Logisoft', slug: 'logisoft', industry: 'B2B SaaS', plan: 'Pro', projectCount: 3 },
  { id: 'demo-org-desi', name: 'Desi Dhamaka', slug: 'desi-dhamaka', industry: 'Entertainment / Events', plan: 'Growth', projectCount: 2 },
  { id: 'demo-org-agency', name: 'Demo Marketing Agency', slug: 'demo-agency', industry: 'Digital Marketing', plan: 'Agency', projectCount: 8 },
];

export const DEMO_PROJECTS: DemoProject[] = [
  { id: DEMO_PROJECT_CHEFGAA, orgId: DEMO_ORG_ID, name: 'Chefgaa', domain: 'chefgaa.com', url: 'https://chefgaa.com', industry: 'Restaurant & Catering' },
  { id: DEMO_PROJECT_LOGISOFT, orgId: DEMO_ORG_ID, name: 'Logisoft', domain: 'logisoft.io', url: 'https://logisoft.io', industry: 'Logistics SaaS' },
  { id: 'demo-project-desi', orgId: DEMO_ORG_ID, name: 'Desi Dhamaka', domain: 'desidhamaka.com', url: 'https://desidhamaka.com', industry: 'Events & Media' },
  { id: 'demo-project-flowtask', orgId: DEMO_ORG_ID, name: 'FlowTask SaaS', domain: 'flowtask.io', url: 'https://flowtask.io', industry: 'B2B SaaS' },
];

export const DEMO_COMPETITORS = [
  { id: 'c1', domain: 'zomato.com', name: 'Zomato', priority: 'high', validated: true },
  { id: 'c2', domain: 'swiggy.com', name: 'Swiggy', priority: 'high', validated: true },
  { id: 'c3', domain: 'ubereats.com', name: 'Uber Eats', priority: 'medium', validated: true },
  { id: 'c4', domain: 'talabat.com', name: 'Talabat', priority: 'medium', validated: false },
];

export const DEMO_KEYWORDS = [
  { id: 'k1', keyword: 'best catering near me', cluster: 'Local SEO', intent: 'commercial', priority: 92, volume: 8100 },
  { id: 'k2', keyword: 'corporate lunch delivery', cluster: 'B2B Catering', intent: 'transactional', priority: 88, volume: 2400 },
  { id: 'k3', keyword: 'indian wedding catering', cluster: 'Events', intent: 'commercial', priority: 85, volume: 5200 },
  { id: 'k4', keyword: 'chef on demand', cluster: 'Brand', intent: 'informational', priority: 78, volume: 1900 },
  { id: 'k5', keyword: 'healthy meal prep delivery', cluster: 'Health', intent: 'transactional', priority: 74, volume: 6700 },
];

export const DEMO_KB_DOCUMENTS = [
  { id: 'doc1', title: 'Brand Guidelines 2026', status: 'ready', chunks: 42, type: 'brand' },
  { id: 'doc2', title: 'Chefgaa Service Menu', status: 'ready', chunks: 28, type: 'product' },
  { id: 'doc3', title: 'Target Customer Personas', status: 'ready', chunks: 19, type: 'strategy' },
  { id: 'doc4', title: 'Competitive Positioning Deck', status: 'ready', chunks: 35, type: 'research' },
  { id: 'doc5', title: 'Outreach Tone & Voice', status: 'ready', chunks: 12, type: 'content' },
];

export const DEMO_CAMPAIGNS = [
  { id: 'camp1', name: 'Guest Post — Food & Lifestyle', campaign_type: 'guest_post', status: 'active', progress: 67 },
  { id: 'camp2', name: 'Resource Page Outreach', campaign_type: 'resource_page', status: 'active', progress: 44 },
  { id: 'camp3', name: 'Local Directory Citations', campaign_type: 'directory', status: 'pending_approval', progress: 0 },
  { id: 'camp4', name: 'Digital PR — Chef Stories', campaign_type: 'digital_pr', status: 'draft', progress: 12 },
];

export const DEMO_OPPORTUNITIES = [
  { id: 'o1', title: 'FoodNetwork.com — Guest post slot', score: 87, opportunity_type: 'guest_post', queue_status: 'pending_review', ai_recommendation: 'Strong fit — approve for campaign' },
  { id: 'o2', title: 'Eater.com — Resource page link', score: 82, opportunity_type: 'resource_page', queue_status: 'pending_review', ai_recommendation: 'Strong fit — approve for campaign' },
  { id: 'o3', title: 'Broken link — catering guide', score: 76, opportunity_type: 'broken_link', queue_status: 'approved', ai_recommendation: 'Moderate fit — review before approving' },
  { id: 'o4', title: 'Yelp Business Directory', score: 71, opportunity_type: 'directory', queue_status: 'pending_review', ai_recommendation: 'Moderate fit — review before approving' },
  { id: 'o5', title: 'Reddit r/food — Q&A mention', score: 68, opportunity_type: 'qa_site', queue_status: 'pending_review', ai_recommendation: 'Low priority — consider rejecting' },
];

export const DEMO_AGENTS = [
  { agentType: 'seo_strategist', displayName: 'SEO Strategist', description: 'Plans campaigns and prioritizes opportunities' },
  { agentType: 'research_manager', displayName: 'Research Manager', description: 'Discovers competitors, keywords, and prospects' },
  { agentType: 'content_strategist', displayName: 'Content Strategist', description: 'Drafts guest posts and outreach content' },
  { agentType: 'qa_agent', displayName: 'QA Agent', description: 'Reviews AI output for accuracy and brand fit' },
  { agentType: 'outreach_coordinator', displayName: 'Outreach Coordinator', description: 'Prepares personalized outreach sequences' },
];

export const DEMO_WORKFORCE_TASKS = [
  { id: 'w1', agent: 'SEO Strategist', task: 'Researching competitors...', progress: 83 },
  { id: 'w2', agent: 'Research Manager', task: 'Finding backlink opportunities...', progress: 61 },
  { id: 'w3', agent: 'Content Strategist', task: 'Writing guest post...', progress: 100 },
  { id: 'w4', agent: 'QA Agent', task: 'Reviewing AI output...', progress: 44 },
];

export const DEMO_THINKING_STEPS = [
  'Reading Knowledge Base...',
  'Finding competitors...',
  'Ranking opportunities...',
  'Building context...',
  'Writing response...',
  'Validating output...',
  'Completed.',
];

export const DEMO_SCAN_STEPS = [
  'Scanning website...',
  'Reading sitemap...',
  'Finding pages...',
  'Reading metadata...',
  'Finding competitors...',
  'Discovering keywords...',
  'Finding opportunities...',
  'Generating campaign...',
  'Completed.',
];

export const DEMO_NOTIFICATIONS = [
  { id: 'n1', title: 'Guest post draft ready for review', type: 'approval', time: '2m ago', unread: true },
  { id: 'n2', title: '12 new opportunities discovered', type: 'discovery', time: '8m ago', unread: true },
  { id: 'n3', title: 'Campaign "Guest Post" reached 67%', type: 'campaign', time: '15m ago', unread: false },
  { id: 'n4', title: 'QA Agent approved content output', type: 'ai', time: '22m ago', unread: false },
  { id: 'n5', title: 'Knowledge Base indexed 3 new documents', type: 'knowledge', time: '1h ago', unread: false },
];

export const DEMO_TIMELINE = [
  { id: 't1', title: 'Discovered 12 backlink opportunities', event_type: 'opportunity.discovered', created_at: new Date(Date.now() - 120_000).toISOString() },
  { id: 't2', title: 'Guest post draft generated', event_type: 'content.generated', created_at: new Date(Date.now() - 300_000).toISOString() },
  { id: 't3', title: 'Competitor analysis completed', event_type: 'research.completed', created_at: new Date(Date.now() - 600_000).toISOString() },
  { id: 't4', title: 'Campaign launched: Guest Post Outreach', event_type: 'campaign.launched', created_at: new Date(Date.now() - 900_000).toISOString() },
  { id: 't5', title: 'Website scan: 47 pages analyzed', event_type: 'scan.completed', created_at: new Date(Date.now() - 1_800_000).toISOString() },
  { id: 't6', title: 'Knowledge Base updated — Brand Guidelines', event_type: 'kb.indexed', created_at: new Date(Date.now() - 3_600_000).toISOString() },
];

export const DEMO_CHAT_PROMPTS = [
  'Analyze Chefgaa.',
  'Find opportunities.',
  'Create campaign.',
  'Generate guest post.',
  'Explain competitors.',
  'Generate report.',
  'Build outreach strategy.',
];

export const DEMO_EXECUTIVE_METRICS = {
  organizations: 5,
  projects: 19,
  aiRuns: 2847,
  campaigns: 12,
  opportunities: 156,
  knowledgeDocuments: 47,
  relationships: 89,
  timeSavedHours: 340,
  campaignSuccessRate: 78,
  productivityScore: 94,
};

export const DEMO_MEMORY = {
  entries: [
    { id: 'm1', title: 'Chefgaa targets corporate catering', type: 'fact', created_at: new Date(Date.now() - 86_400_000).toISOString() },
    { id: 'm2', title: 'Primary competitor: Zomato for delivery', type: 'fact', created_at: new Date(Date.now() - 172_800_000).toISOString() },
    { id: 'm3', title: 'Brand voice: warm, premium, approachable', type: 'preference', created_at: new Date(Date.now() - 259_200_000).toISOString() },
  ],
  facts: 24,
};

export const DEMO_PROSPECT_PIPELINE: Record<string, Array<Record<string, unknown>>> = {
  discovered: [{ id: 'p1', title: 'FoodNetwork.com', domain: 'foodnetwork.com', score: 87, prospect_type: 'guest_post' }],
  qualified: [{ id: 'p2', title: 'Eater.com', domain: 'eater.com', score: 82, prospect_type: 'resource_page' }],
  approved: [{ id: 'p3', title: 'Serious Eats', domain: 'seriouseats.com', score: 79, prospect_type: 'guest_post' }],
  outreach_ready: [{ id: 'p4', title: 'Bon Appétit', domain: 'bonappetit.com', score: 85, prospect_type: 'guest_post' }],
  won: [{ id: 'p5', title: 'Tasting Table', domain: 'tastingtable.com', score: 74, prospect_type: 'resource_page' }],
  lost: [],
};

export const DEMO_BACKLINK_SUMMARY = {
  discovered: 12,
  qualified: 8,
  approved: 5,
  outreach_ready: 3,
  won: 7,
  lost: 1,
  verified: 5,
  pending: 2,
  totalOpportunities: 47,
  activeCampaigns: 2,
};

export const DEMO_BACKLINK_TYPES = [
  { id: 'guest_post', category: 'content_based', display_name: 'Guest Posts' },
  { id: 'press_release', category: 'content_based', display_name: 'Press Releases' },
  { id: 'resource_page', category: 'outreach_based', display_name: 'Resource Pages' },
  { id: 'broken_link', category: 'outreach_based', display_name: 'Broken Links' },
  { id: 'directory', category: 'business_based', display_name: 'Directories' },
  { id: 'digital_pr', category: 'outreach_based', display_name: 'HARO / Digital PR' },
  { id: 'edu', category: 'authority_based', display_name: 'EDU' },
  { id: 'qa_site', category: 'community_based', display_name: 'Q&A' },
];

export const DEMO_BACKLINKS_WON = [
  { id: 'bl1', backlink_type: 'guest_post', source_url: 'https://tastingtable.com/chefgaa-catering', target_url: 'https://chefgaa.com', anchor_text: 'Chefgaa catering', domain: 'tastingtable.com', verification_status: 'verified', won_at: new Date(Date.now() - 604_800_000).toISOString(), verified_at: new Date(Date.now() - 432_000_000).toISOString() },
  { id: 'bl2', backlink_type: 'resource_page', source_url: 'https://eater.com/resources/catering-guide', target_url: 'https://chefgaa.com', anchor_text: 'Chefgaa', domain: 'eater.com', verification_status: 'pending', won_at: new Date(Date.now() - 172_800_000).toISOString() },
  { id: 'bl3', backlink_type: 'directory', source_url: 'https://yelp.com/biz/chefgaa', target_url: 'https://chefgaa.com', anchor_text: 'Chefgaa', domain: 'yelp.com', verification_status: 'verified', won_at: new Date(Date.now() - 1_209_600_000).toISOString(), verified_at: new Date(Date.now() - 1_036_800_000).toISOString() },
];

export const DEMO_BACKLINKS_LOST = [
  { id: 'bl4', backlink_type: 'blog_comment', source_url: 'https://oldblog.example.com/catering-tips', domain: 'oldblog.example.com', verification_status: 'lost' },
];

export const DEMO_BACKLINKS_PENDING = DEMO_BACKLINKS_WON.filter((b) => b.verification_status === 'pending');

export const DEMO_BACKLINK_AUDIT = {
  summary: { total: 4, verified: 2, pending: 1, lost: 1 },
  backlinks: [...DEMO_BACKLINKS_WON, ...DEMO_BACKLINKS_LOST],
  recentChecks: [
    { id: 'chk1', status: 'verified', notes: 'Link live with correct anchor', checked_at: new Date(Date.now() - 86_400_000).toISOString() },
    { id: 'chk2', status: 'pending', notes: 'Awaiting crawl', checked_at: new Date(Date.now() - 43_200_000).toISOString() },
  ],
};

export const DEMO_AI_BACKLINK_SUGGESTIONS = {
  recommendedTypes: ['guest_post', 'resource_page', 'broken_link', 'digital_pr'],
  topOpportunities: DEMO_OPPORTUNITIES,
  insight: 'Focus on guest_post, resource_page, broken_link for chefgaa.com — strong food & lifestyle publication fit.',
};

export const DEMO_APPROVALS = [
  { id: 'a1', title: 'Launch campaign: Digital PR — Chef Stories', approval_type: 'campaign_launch', status: 'pending', summary: 'Request to activate digital_pr campaign' },
  { id: 'a2', title: 'Email draft review: Guest post pitch', approval_type: 'email_draft', status: 'pending', summary: 'Hi editor, I noticed your recent piece on...' },
];

export function getDemoProject(projectId: string) {
  return DEMO_PROJECTS.find((p) => p.id === projectId) ?? DEMO_PROJECTS[0];
}

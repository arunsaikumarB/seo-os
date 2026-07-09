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
  {
    id: DEMO_ORG_ID,
    name: 'SEO OS',
    slug: 'seo-os',
    industry: 'AI / SEO Platform',
    plan: 'Enterprise',
    projectCount: 4,
  },
  {
    id: 'demo-org-chefgaa',
    name: 'Chefgaa',
    slug: 'chefgaa',
    industry: 'Food & Hospitality',
    plan: 'Pro',
    projectCount: 2,
  },
  {
    id: 'demo-org-logisoft',
    name: 'Logisoft',
    slug: 'logisoft',
    industry: 'B2B SaaS',
    plan: 'Pro',
    projectCount: 3,
  },
  {
    id: 'demo-org-desi',
    name: 'Desi Dhamaka',
    slug: 'desi-dhamaka',
    industry: 'Entertainment / Events',
    plan: 'Growth',
    projectCount: 2,
  },
  {
    id: 'demo-org-agency',
    name: 'Demo Marketing Agency',
    slug: 'demo-agency',
    industry: 'Digital Marketing',
    plan: 'Agency',
    projectCount: 8,
  },
];

export const DEMO_PROJECTS: DemoProject[] = [
  {
    id: DEMO_PROJECT_CHEFGAA,
    orgId: DEMO_ORG_ID,
    name: 'Chefgaa',
    domain: 'chefgaa.com',
    url: 'https://chefgaa.com',
    industry: 'Restaurant & Catering',
  },
  {
    id: DEMO_PROJECT_LOGISOFT,
    orgId: DEMO_ORG_ID,
    name: 'Logisoft',
    domain: 'logisoft.io',
    url: 'https://logisoft.io',
    industry: 'Logistics SaaS',
  },
  {
    id: 'demo-project-desi',
    orgId: DEMO_ORG_ID,
    name: 'Desi Dhamaka',
    domain: 'desidhamaka.com',
    url: 'https://desidhamaka.com',
    industry: 'Events & Media',
  },
  {
    id: 'demo-project-flowtask',
    orgId: DEMO_ORG_ID,
    name: 'FlowTask SaaS',
    domain: 'flowtask.io',
    url: 'https://flowtask.io',
    industry: 'B2B SaaS',
  },
];

export const DEMO_COMPETITORS = [
  { id: 'c1', domain: 'zomato.com', name: 'Zomato', priority: 'high', validated: true },
  { id: 'c2', domain: 'swiggy.com', name: 'Swiggy', priority: 'high', validated: true },
  { id: 'c3', domain: 'ubereats.com', name: 'Uber Eats', priority: 'medium', validated: true },
  { id: 'c4', domain: 'talabat.com', name: 'Talabat', priority: 'medium', validated: false },
];

export const DEMO_KEYWORDS = [
  {
    id: 'k1',
    keyword: 'best catering near me',
    cluster: 'Local SEO',
    intent: 'commercial',
    priority: 92,
    volume: 8100,
  },
  {
    id: 'k2',
    keyword: 'corporate lunch delivery',
    cluster: 'B2B Catering',
    intent: 'transactional',
    priority: 88,
    volume: 2400,
  },
  {
    id: 'k3',
    keyword: 'indian wedding catering',
    cluster: 'Events',
    intent: 'commercial',
    priority: 85,
    volume: 5200,
  },
  {
    id: 'k4',
    keyword: 'chef on demand',
    cluster: 'Brand',
    intent: 'informational',
    priority: 78,
    volume: 1900,
  },
  {
    id: 'k5',
    keyword: 'healthy meal prep delivery',
    cluster: 'Health',
    intent: 'transactional',
    priority: 74,
    volume: 6700,
  },
];

export const DEMO_KB_DOCUMENTS = [
  { id: 'doc1', title: 'Brand Guidelines 2026', status: 'ready', chunks: 42, type: 'brand' },
  { id: 'doc2', title: 'Chefgaa Service Menu', status: 'ready', chunks: 28, type: 'product' },
  { id: 'doc3', title: 'Target Customer Personas', status: 'ready', chunks: 19, type: 'strategy' },
  {
    id: 'doc4',
    title: 'Competitive Positioning Deck',
    status: 'ready',
    chunks: 35,
    type: 'research',
  },
  { id: 'doc5', title: 'Outreach Tone & Voice', status: 'ready', chunks: 12, type: 'content' },
];

export const DEMO_CAMPAIGNS = [
  {
    id: 'camp1',
    name: 'Guest Post — Food & Lifestyle',
    campaign_type: 'guest_post',
    status: 'active',
    progress: 67,
  },
  {
    id: 'camp2',
    name: 'Resource Page Outreach',
    campaign_type: 'resource_page',
    status: 'active',
    progress: 44,
  },
  {
    id: 'camp3',
    name: 'Local Directory Citations',
    campaign_type: 'directory',
    status: 'pending_approval',
    progress: 0,
  },
  {
    id: 'camp4',
    name: 'Digital PR — Chef Stories',
    campaign_type: 'digital_pr',
    status: 'draft',
    progress: 12,
  },
];

export const DEMO_OPPORTUNITIES = [
  {
    id: 'o1',
    title: 'FoodNetwork.com — Guest post slot',
    score: 87,
    opportunity_type: 'guest_post',
    queue_status: 'pending_review',
    pipeline_stage: 'qualified',
    website_name: 'Food Network',
    domain: 'foodnetwork.com',
    domain_rating: 82,
    monthly_traffic: 45000000,
    country: 'US',
    language: 'en',
    spam_score: 8,
    success_probability: 78,
    reply_rate_prediction: 24,
    ai_recommendation: 'Strong fit — approve for campaign',
  },
  {
    id: 'o2',
    title: 'Eater.com — Resource page link',
    score: 82,
    opportunity_type: 'resource_page',
    queue_status: 'pending_review',
    pipeline_stage: 'discovered',
    website_name: 'Eater',
    domain: 'eater.com',
    domain_rating: 78,
    monthly_traffic: 12000000,
    country: 'US',
    language: 'en',
    spam_score: 12,
    success_probability: 71,
    reply_rate_prediction: 19,
    ai_recommendation: 'Strong fit — approve for campaign',
  },
  {
    id: 'o3',
    title: 'Broken link — catering guide',
    score: 76,
    opportunity_type: 'broken_link',
    queue_status: 'approved',
    pipeline_stage: 'campaign_ready',
    website_name: 'Serious Eats',
    domain: 'seriouseats.com',
    domain_rating: 75,
    monthly_traffic: 8000000,
    country: 'US',
    language: 'en',
    spam_score: 10,
    success_probability: 68,
    reply_rate_prediction: 32,
    ai_recommendation: 'Moderate fit — review before approving',
  },
  {
    id: 'o4',
    title: 'Yelp Business Directory',
    score: 71,
    opportunity_type: 'directory',
    queue_status: 'pending_review',
    pipeline_stage: 'discovered',
    website_name: 'Yelp',
    domain: 'yelp.com',
    domain_rating: 91,
    monthly_traffic: 90000000,
    country: 'US',
    language: 'en',
    spam_score: 15,
    success_probability: 62,
    reply_rate_prediction: 14,
    ai_recommendation: 'Moderate fit — review before approving',
  },
  {
    id: 'o5',
    title: 'Reddit r/food — Q&A mention',
    score: 68,
    opportunity_type: 'reddit',
    queue_status: 'pending_review',
    pipeline_stage: 'discovered',
    website_name: 'Reddit',
    domain: 'reddit.com',
    domain_rating: 92,
    monthly_traffic: 1800000000,
    country: 'US',
    language: 'en',
    spam_score: 22,
    success_probability: 45,
    reply_rate_prediction: 8,
    ai_recommendation: 'Low priority — consider rejecting',
  },
];

export const DEMO_AGENTS = [
  {
    agentType: 'seo_strategist',
    displayName: 'SEO Strategist',
    description: 'Plans campaigns and prioritizes opportunities',
  },
  {
    agentType: 'research_manager',
    displayName: 'Research Manager',
    description: 'Discovers competitors, keywords, and prospects',
  },
  {
    agentType: 'content_strategist',
    displayName: 'Content Strategist',
    description: 'Drafts guest posts and outreach content',
  },
  {
    agentType: 'qa_agent',
    displayName: 'QA Agent',
    description: 'Reviews AI output for accuracy and brand fit',
  },
  {
    agentType: 'outreach_coordinator',
    displayName: 'Outreach Coordinator',
    description: 'Prepares personalized outreach sequences',
  },
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

export const DEMO_BROWSER_INTELLIGENCE = {
  websitesScanned: 18,
  currentlyScanning: 1,
  pagesRead: 312,
  opportunitiesFound: 47,
  contactPages: 12,
  guestPostPages: 8,
  brokenLinks: 5,
  aiDiscoveries: 63,
  scanQueue: [
    {
      id: 'scan-q1',
      target_url: 'https://seriouseats.com',
      phase: 'reading_content',
      status: 'running',
    },
  ],
  disclaimer:
    'Browser Intelligence analyzes public pages only. It does not submit forms, solve CAPTCHAs, or bypass authentication.',
};

export const DEMO_BROWSER_SCANS = [
  {
    id: 'scan-b1',
    target_url: 'https://foodnetwork.com',
    status: 'completed',
    phase: 'completed',
    pages_read: 42,
    discoveries_count: 12,
    contact_pages_found: 2,
    guest_post_pages_found: 1,
    ai_summary:
      'This website focuses on food content.\nAccepts guest posts.\nRecommended strategy: Guest Post\nSuccess probability: 88%',
    created_at: '2026-07-09T10:00:00Z',
  },
  {
    id: 'scan-b2',
    target_url: 'https://eater.com',
    status: 'completed',
    phase: 'completed',
    pages_read: 35,
    discoveries_count: 9,
    created_at: '2026-07-08T14:00:00Z',
  },
];

export const DEMO_BROWSER_PROFILES = [
  {
    id: 'prof-1',
    domain: 'foodnetwork.com',
    website_name: 'Food Network',
    category: 'food',
    domain_authority: 78,
    guest_post_available: true,
    confidence_score: 88,
    ai_summary: 'Food publication with guest post opportunities. Editorial review required.',
    opportunity_types: ['guest_post', 'resource_page'],
  },
  {
    id: 'prof-2',
    domain: 'seriouseats.com',
    website_name: 'Serious Eats',
    category: 'food',
    domain_authority: 72,
    guest_post_available: false,
    confidence_score: 75,
    opportunity_types: ['resource_page', 'broken_link'],
  },
];

export const DEMO_NOTIFICATIONS = [
  {
    id: 'n1',
    title: 'Guest post draft ready for review',
    type: 'approval',
    time: '2m ago',
    unread: true,
  },
  {
    id: 'n2',
    title: '12 new opportunities discovered',
    type: 'discovery',
    time: '8m ago',
    unread: true,
  },
  {
    id: 'n3',
    title: 'Campaign "Guest Post" reached 67%',
    type: 'campaign',
    time: '15m ago',
    unread: false,
  },
  {
    id: 'n4',
    title: 'QA Agent approved content output',
    type: 'ai',
    time: '22m ago',
    unread: false,
  },
  {
    id: 'n5',
    title: 'Knowledge Base indexed 3 new documents',
    type: 'knowledge',
    time: '1h ago',
    unread: false,
  },
];

export const DEMO_TIMELINE = [
  {
    id: 't1',
    title: 'Discovered 12 backlink opportunities',
    event_type: 'opportunity.discovered',
    created_at: new Date(Date.now() - 120_000).toISOString(),
  },
  {
    id: 't2',
    title: 'Guest post draft generated',
    event_type: 'content.generated',
    created_at: new Date(Date.now() - 300_000).toISOString(),
  },
  {
    id: 't3',
    title: 'Competitor analysis completed',
    event_type: 'research.completed',
    created_at: new Date(Date.now() - 600_000).toISOString(),
  },
  {
    id: 't4',
    title: 'Campaign launched: Guest Post Outreach',
    event_type: 'campaign.launched',
    created_at: new Date(Date.now() - 900_000).toISOString(),
  },
  {
    id: 't5',
    title: 'Website scan: 47 pages analyzed',
    event_type: 'scan.completed',
    created_at: new Date(Date.now() - 1_800_000).toISOString(),
  },
  {
    id: 't6',
    title: 'Knowledge Base updated — Brand Guidelines',
    event_type: 'kb.indexed',
    created_at: new Date(Date.now() - 3_600_000).toISOString(),
  },
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
    {
      id: 'm1',
      title: 'Chefgaa targets corporate catering',
      type: 'fact',
      created_at: new Date(Date.now() - 86_400_000).toISOString(),
    },
    {
      id: 'm2',
      title: 'Primary competitor: Zomato for delivery',
      type: 'fact',
      created_at: new Date(Date.now() - 172_800_000).toISOString(),
    },
    {
      id: 'm3',
      title: 'Brand voice: warm, premium, approachable',
      type: 'preference',
      created_at: new Date(Date.now() - 259_200_000).toISOString(),
    },
  ],
  facts: 24,
};

export const DEMO_PROSPECT_PIPELINE: Record<string, Array<Record<string, unknown>>> = {
  discovered: [
    {
      id: 'p1',
      title: 'FoodNetwork.com',
      domain: 'foodnetwork.com',
      score: 87,
      prospect_type: 'guest_post',
    },
  ],
  qualified: [
    {
      id: 'p2',
      title: 'Eater.com',
      domain: 'eater.com',
      score: 82,
      prospect_type: 'resource_page',
    },
  ],
  approved: [
    {
      id: 'p3',
      title: 'Serious Eats',
      domain: 'seriouseats.com',
      score: 79,
      prospect_type: 'guest_post',
    },
  ],
  outreach_ready: [
    {
      id: 'p4',
      title: 'Bon Appétit',
      domain: 'bonappetit.com',
      score: 85,
      prospect_type: 'guest_post',
    },
  ],
  won: [
    {
      id: 'p5',
      title: 'Tasting Table',
      domain: 'tastingtable.com',
      score: 74,
      prospect_type: 'resource_page',
    },
  ],
  lost: [],
};

export const DEMO_BACKLINK_SUMMARY = {
  totalOpportunities: 47,
  discovered: 12,
  qualified: 8,
  approved: 5,
  campaign_ready: 3,
  outreach_running: 4,
  won: 7,
  lost: 1,
  verified: 5,
  pending: 2,
  avgDomainRating: 68,
  successRate: 72,
  activeCampaigns: 2,
  outreach_ready: 3,
  aiActivity: [
    {
      agent: 'Opportunity Scorer',
      agentType: 'opportunity_scorer',
      task: 'Scoring 12 new opportunities',
      progress: 78,
    },
    {
      agent: 'Research Manager',
      agentType: 'research_manager',
      task: 'Discovering food publications',
      progress: 61,
    },
    {
      agent: 'Guest Post Writer',
      agentType: 'guest_post_writer',
      task: 'Drafting guest post',
      progress: 44,
    },
  ],
};

export const DEMO_AUTOMATION_SUMMARY = {
  importedWebsites: 24,
  totalImports: 3,
  analyzedWebsites: 22,
  qualifiedOpportunities: 18,
  contentGenerated: 36,
  pendingApproval: 8,
  submitted: 6,
  published: 4,
  verified: 3,
  rejected: 2,
  waiting: 3,
  accepted: 5,
  disclaimer:
    'SEO OS automates preparation, classification, and tracking. Third-party websites control publication — backlinks are never guaranteed.',
  recentRuns: [
    {
      id: 'run-demo-1',
      status: 'completed',
      current_step: 'store',
      progress: 100,
      steps_completed: ['import', 'validate', 'analyze', 'classify', 'score', 'generate', 'queue'],
      created_at: new Date().toISOString(),
    },
  ],
  pipelineSteps: [
    { id: 'import', label: 'Import URLs', order: 1 },
    { id: 'validate', label: 'Validate', order: 2 },
    { id: 'analyze', label: 'Analyze Domains', order: 3 },
    { id: 'classify', label: 'AI Classification', order: 4 },
    { id: 'generate', label: 'Generate Content', order: 5 },
    { id: 'verify', label: 'Verify Backlinks', order: 10 },
  ],
};

export const DEMO_IMPORTS = [
  {
    id: 'imp-demo-1',
    source_type: 'csv',
    file_name: 'food-publications.csv',
    status: 'completed',
    total_rows: 12,
    valid_rows: 11,
    duplicate_rows: 1,
    invalid_rows: 0,
    opportunities_created: 11,
    content_generated: 22,
    created_at: '2026-07-08T10:00:00Z',
  },
  {
    id: 'imp-demo-2',
    source_type: 'url_list',
    file_name: null,
    status: 'validated',
    total_rows: 8,
    valid_rows: 8,
    duplicate_rows: 0,
    invalid_rows: 0,
    opportunities_created: 0,
    content_generated: 0,
    created_at: '2026-07-09T08:30:00Z',
  },
];

export const DEMO_TRACKING = DEMO_OPPORTUNITIES.slice(0, 5).map((o, i) => ({
  ...o,
  automation_status:
    ['analyzed', 'prepared', 'submitted', 'published', 'verified'][i] ?? 'analyzed',
  priority: ['high', 'urgent', 'medium', 'high', 'low'][i],
  recommended_action: 'Generate guest post draft and queue for approval.',
  import_id: 'imp-demo-1',
}));

export const DEMO_SUBMISSIONS = [
  {
    id: 'sub-1',
    status: 'prepared',
    assisted_mode: 'directory',
    opportunities: {
      id: DEMO_OPPORTUNITIES[0].id,
      title: DEMO_OPPORTUNITIES[0].title,
      domain: DEMO_OPPORTUNITIES[0].domain,
    },
  },
  {
    id: 'sub-2',
    status: 'submitted',
    assisted_mode: 'manual',
    opportunities: {
      id: DEMO_OPPORTUNITIES[1].id,
      title: DEMO_OPPORTUNITIES[1].title,
      domain: DEMO_OPPORTUNITIES[1].domain,
    },
  },
];

export const DEMO_BACKLINK_PIPELINE: Record<string, typeof DEMO_OPPORTUNITIES> = {
  discovered: [DEMO_OPPORTUNITIES[1], DEMO_OPPORTUNITIES[3], DEMO_OPPORTUNITIES[4]],
  qualified: [DEMO_OPPORTUNITIES[0]],
  approved: [],
  campaign_ready: [DEMO_OPPORTUNITIES[2]],
  outreach: [],
  negotiation: [],
  won: [],
  lost: [],
  verified: [],
};

export const DEMO_RELATIONSHIPS = [
  {
    id: 'rel1',
    domain: 'foodnetwork.com',
    contact_name: 'Editorial Team',
    contact_email: 'partnerships@foodnetwork.com',
    warmth: 'warm',
    opportunity_count: 3,
    won_count: 1,
  },
  {
    id: 'rel2',
    domain: 'eater.com',
    contact_name: 'Content Desk',
    warmth: 'cold',
    opportunity_count: 2,
    won_count: 0,
  },
  {
    id: 'rel3',
    domain: 'seriouseats.com',
    contact_name: 'Partnerships',
    warmth: 'hot',
    opportunity_count: 4,
    won_count: 2,
  },
];

export const DEMO_RELATIONSHIP_SUMMARY = {
  contactsDiscovered: 24,
  organizations: 12,
  warmRelationships: 8,
  hotLeads: 3,
  partners: 2,
  pendingFollowUps: 5,
  topPartners: [
    {
      company_name: 'Serious Eats',
      domain: 'seriouseats.com',
      relationship_score: 82,
      warmth: 'hot',
    },
    {
      company_name: 'Food Network',
      domain: 'foodnetwork.com',
      relationship_score: 71,
      warmth: 'warm',
    },
  ],
  relationshipHealth: 68,
  warmthBreakdown: { cold: 4, warm: 5, hot: 3, partner: 2 },
  disclaimer: 'Relationship Intelligence uses publicly available information only.',
};

export const DEMO_RELATIONSHIP_ORGANIZATIONS = [
  {
    id: 'org1',
    company_name: 'Serious Eats',
    domain: 'seriouseats.com',
    warmth: 'hot',
    relationship_score: 82,
    priority_score: 78,
    response_probability: 65,
    relationship_contacts: [{ count: 3 }],
  },
  {
    id: 'org2',
    company_name: 'Food Network',
    domain: 'foodnetwork.com',
    warmth: 'warm',
    relationship_score: 71,
    priority_score: 62,
    response_probability: 55,
    relationship_contacts: [{ count: 2 }],
  },
  {
    id: 'org3',
    company_name: 'Eater',
    domain: 'eater.com',
    warmth: 'cold',
    relationship_score: 38,
    priority_score: 41,
    response_probability: 25,
    relationship_contacts: [{ count: 1 }],
  },
];

export const DEMO_RELATIONSHIP_CONTACTS = [
  {
    id: 'c1',
    name: 'Sarah Chen',
    role: 'Editor',
    public_email: 'editorial@seriouseats.com',
    confidence_score: 88,
    is_recommended_outreach: true,
    relationship_organizations: {
      company_name: 'Serious Eats',
      domain: 'seriouseats.com',
      warmth: 'hot',
    },
  },
  {
    id: 'c2',
    name: 'Editorial Team',
    role: 'Partnerships',
    public_email: 'partnerships@foodnetwork.com',
    confidence_score: 75,
    is_recommended_outreach: true,
    relationship_organizations: {
      company_name: 'Food Network',
      domain: 'foodnetwork.com',
      warmth: 'warm',
    },
  },
  {
    id: 'c3',
    name: 'Content Desk',
    role: 'Editor',
    confidence_score: 45,
    is_recommended_outreach: false,
    relationship_organizations: { company_name: 'Eater', domain: 'eater.com', warmth: 'cold' },
  },
];

export const DEMO_RELATIONSHIP_TIMELINE = [
  {
    id: 'rt1',
    event_type: 'contact_discovered',
    title: 'Discovered Sarah Chen (Editor)',
    created_at: new Date(Date.now() - 86_400_000).toISOString(),
    relationship_organizations: { company_name: 'Serious Eats', domain: 'seriouseats.com' },
  },
  {
    id: 'rt2',
    event_type: 'campaign_created',
    title: 'Campaign created: Guest Post Outreach Q3',
    created_at: new Date(Date.now() - 172_800_000).toISOString(),
    relationship_organizations: { company_name: 'Serious Eats', domain: 'seriouseats.com' },
  },
  {
    id: 'rt3',
    event_type: 'content_generated',
    title: 'Guest post draft generated',
    created_at: new Date(Date.now() - 259_200_000).toISOString(),
    relationship_organizations: { company_name: 'Food Network', domain: 'foodnetwork.com' },
  },
  {
    id: 'rt4',
    event_type: 'backlink_verified',
    title: 'Backlink verified on seriouseats.com',
    created_at: new Date(Date.now() - 345_600_000).toISOString(),
    relationship_organizations: { company_name: 'Serious Eats', domain: 'seriouseats.com' },
  },
];

export const DEMO_RELATIONSHIP_ORG_DETAIL = {
  id: 'org1',
  company_name: 'Serious Eats',
  domain: 'seriouseats.com',
  website: 'https://seriouseats.com',
  industry: 'Food & Media',
  country: 'US',
  warmth: 'hot',
  relationship_score: 82,
  response_probability: 65,
  campaign_suitability: 78,
  collaboration_potential: 72,
  priority_score: 78,
  risk_score: 18,
  team_page_url: 'https://seriouseats.com/about',
  contact_page_url: 'https://seriouseats.com/contact',
  editorial_page_url: 'https://seriouseats.com/write-for-us',
  notes: 'Prioritize personalized outreach to recommended contact.',
  contacts: DEMO_RELATIONSHIP_CONTACTS.filter(
    (c) => c.relationship_organizations?.domain === 'seriouseats.com'
  ),
  timeline: DEMO_RELATIONSHIP_TIMELINE.filter(
    (t) => t.relationship_organizations?.domain === 'seriouseats.com'
  ),
};

export const DEMO_OUTREACH_SUMMARY = {
  emailsSent: 47,
  replies: 12,
  openRate: 62,
  replyRate: 26,
  pendingFollowUps: 5,
  inboxHealth: 'good',
  aiDraftQueue: 3,
  disclaimer: 'Every outbound email requires human approval before sending.',
};

export const DEMO_OUTREACH_THREADS = [
  {
    id: 'th1',
    subject: 'Guest post idea for Serious Eats',
    status: 'active',
    last_message_at: new Date(Date.now() - 86_400_000).toISOString(),
    relationship_contacts: {
      name: 'Sarah Chen',
      role: 'Editor',
      public_email: 'editorial@seriouseats.com',
    },
    relationship_organizations: {
      company_name: 'Serious Eats',
      domain: 'seriouseats.com',
      warmth: 'hot',
    },
  },
  {
    id: 'th2',
    subject: 'Following up — Food Network',
    status: 'active',
    last_message_at: new Date(Date.now() - 172_800_000).toISOString(),
    relationship_contacts: {
      name: 'Editorial Team',
      role: 'Partnerships',
      public_email: 'partnerships@foodnetwork.com',
    },
    relationship_organizations: {
      company_name: 'Food Network',
      domain: 'foodnetwork.com',
      warmth: 'warm',
    },
  },
];

export const DEMO_OUTREACH_THREAD_DETAIL = {
  ...DEMO_OUTREACH_THREADS[0],
  messages: [
    {
      id: 'm1',
      direction: 'outbound',
      subject: 'Guest post idea for Serious Eats',
      body_html:
        '<p>Hi Sarah,</p><p>I would love to contribute an original article to Serious Eats.</p>',
      status: 'sent',
      created_at: new Date(Date.now() - 172_800_000).toISOString(),
    },
    {
      id: 'm2',
      direction: 'inbound',
      subject: 'Re: Guest post idea',
      body_html: '<p>Thanks for reaching out! Please send an outline.</p>',
      status: 'sent',
      created_at: new Date(Date.now() - 86_400_000).toISOString(),
    },
  ],
  tasks: [
    {
      id: 't1',
      title: 'Send guest post outline',
      due_at: new Date(Date.now() + 86_400_000).toISOString(),
      status: 'pending',
    },
  ],
  relationshipTimeline: DEMO_RELATIONSHIP_TIMELINE.filter(
    (t) => t.relationship_organizations?.domain === 'seriouseats.com'
  ),
};

export const DEMO_OUTREACH_TEMPLATES = [
  {
    id: 'tpl1',
    name: 'Guest Post Introduction',
    category: 'guest_post',
    subject: 'Guest post idea for {{domain}}',
    body_html: '<p>Hi {{contact_name}},</p><p>I would love to contribute to {{company_name}}.</p>',
    tone: 'professional',
  },
  {
    id: 'tpl2',
    name: 'Follow-up',
    category: 'follow_up',
    subject: 'Following up — {{company_name}}',
    body_html: '<p>Hi {{contact_name}},</p><p>Checking in on my previous note.</p>',
    tone: 'friendly',
  },
];

export const DEMO_OUTREACH_SEQUENCES = [
  {
    id: 'seq1',
    name: 'Guest Post Outreach Q3',
    status: 'active',
    current_step: 2,
    outreach_sequence_steps: [{ count: 8 }],
  },
];

export const DEMO_OUTREACH_SEQUENCE_DETAIL = {
  id: 'seq1',
  name: 'Guest Post Outreach Q3',
  status: 'active',
  current_step: 2,
  steps: [
    {
      id: 's1',
      step_order: 1,
      step_type: 'initial_email',
      delay_days: 0,
      subject: 'Collaboration idea',
    },
    { id: 's2', step_order: 2, step_type: 'wait', delay_days: 5 },
    { id: 's3', step_order: 3, step_type: 'follow_up', delay_days: 0 },
    { id: 's4', step_order: 4, step_type: 'wait', delay_days: 5 },
    { id: 's5', step_order: 5, step_type: 'reminder', delay_days: 0 },
    { id: 's6', step_order: 6, step_type: 'wait', delay_days: 7 },
    { id: 's7', step_order: 7, step_type: 'final_follow_up', delay_days: 0 },
    { id: 's8', step_order: 8, step_type: 'close', delay_days: 0 },
  ],
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
  {
    id: 'bl1',
    backlink_type: 'guest_post',
    source_url: 'https://tastingtable.com/chefgaa-catering',
    target_url: 'https://chefgaa.com',
    anchor_text: 'Chefgaa catering',
    domain: 'tastingtable.com',
    verification_status: 'verified',
    won_at: new Date(Date.now() - 604_800_000).toISOString(),
    verified_at: new Date(Date.now() - 432_000_000).toISOString(),
  },
  {
    id: 'bl2',
    backlink_type: 'resource_page',
    source_url: 'https://eater.com/resources/catering-guide',
    target_url: 'https://chefgaa.com',
    anchor_text: 'Chefgaa',
    domain: 'eater.com',
    verification_status: 'pending',
    won_at: new Date(Date.now() - 172_800_000).toISOString(),
  },
  {
    id: 'bl3',
    backlink_type: 'directory',
    source_url: 'https://yelp.com/biz/chefgaa',
    target_url: 'https://chefgaa.com',
    anchor_text: 'Chefgaa',
    domain: 'yelp.com',
    verification_status: 'verified',
    won_at: new Date(Date.now() - 1_209_600_000).toISOString(),
    verified_at: new Date(Date.now() - 1_036_800_000).toISOString(),
  },
];

export const DEMO_BACKLINKS_LOST = [
  {
    id: 'bl4',
    backlink_type: 'blog_comment',
    source_url: 'https://oldblog.example.com/catering-tips',
    domain: 'oldblog.example.com',
    verification_status: 'lost',
  },
];

export const DEMO_BACKLINKS_PENDING = DEMO_BACKLINKS_WON.filter(
  (b) => b.verification_status === 'pending'
);

export const DEMO_BACKLINK_AUDIT = {
  summary: { total: 4, verified: 2, pending: 1, lost: 1 },
  backlinks: [...DEMO_BACKLINKS_WON, ...DEMO_BACKLINKS_LOST],
  recentChecks: [
    {
      id: 'chk1',
      status: 'verified',
      notes: 'Link live with correct anchor',
      checked_at: new Date(Date.now() - 86_400_000).toISOString(),
    },
    {
      id: 'chk2',
      status: 'pending',
      notes: 'Awaiting crawl',
      checked_at: new Date(Date.now() - 43_200_000).toISOString(),
    },
  ],
};

export const DEMO_AI_BACKLINK_SUGGESTIONS = {
  recommendedTypes: ['guest_post', 'resource_page', 'broken_link', 'digital_pr'],
  topOpportunities: DEMO_OPPORTUNITIES,
  agents: [
    { id: 'seo_strategist', displayName: 'SEO Strategist', role: 'Strategy & prioritization' },
    { id: 'opportunity_scorer', displayName: 'Opportunity Scorer', role: 'Scoring & probability' },
    { id: 'guest_post_writer', displayName: 'Guest Post Writer', role: 'Content generation' },
    { id: 'verification_agent', displayName: 'Verification Agent', role: 'Link verification' },
  ],
  insight:
    'Focus on guest_post, resource_page, broken_link for chefgaa.com — strong food & lifestyle publication fit.',
};

export const DEMO_APPROVALS = [
  {
    id: 'a1',
    title: 'Launch campaign: Digital PR — Chef Stories',
    approval_type: 'campaign_launch',
    status: 'pending',
    summary: 'Request to activate digital_pr campaign',
  },
  {
    id: 'a2',
    title: 'Email draft review: Guest post pitch',
    approval_type: 'email_draft',
    status: 'pending',
    summary: 'Hi editor, I noticed your recent piece on...',
  },
];

export function getDemoProject(projectId: string) {
  return DEMO_PROJECTS.find((p) => p.id === projectId) ?? DEMO_PROJECTS[0];
}

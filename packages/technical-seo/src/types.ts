/** AI Technical SEO Engine — types (v0.97) */

export const TECHNICAL_SEO_MODULES = [
  'website_health',
  'site_audit',
  'core_web_vitals',
  'indexability',
  'crawlability',
  'internal_linking',
  'redirects',
  'broken_links',
  'canonical_tags',
  'duplicate_content',
  'structured_data',
  'meta_data',
  'open_graph',
  'twitter_cards',
  'xml_sitemap',
  'robots_txt',
  'image_optimization',
  'javascript_seo',
  'accessibility',
  'performance',
  'security_headers',
  'https',
  'mobile_friendliness',
] as const;

export type TechnicalSeoModule = (typeof TECHNICAL_SEO_MODULES)[number];

export const ISSUE_SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'] as const;
export type IssueSeverity = (typeof ISSUE_SEVERITIES)[number];

export const TECHNICAL_AGENTS = [
  {
    id: 'technical_seo',
    displayName: 'Technical SEO Agent',
    description: 'Detects and prioritizes site-wide technical SEO issues',
  },
  {
    id: 'performance',
    displayName: 'Performance Agent',
    description: 'Analyzes Core Web Vitals and page speed opportunities',
  },
  {
    id: 'accessibility',
    displayName: 'Accessibility Agent',
    description: 'Flags a11y gaps that also affect SEO and UX',
  },
  {
    id: 'schema',
    displayName: 'Schema Agent',
    description: 'Validates structured data and JSON-LD coverage',
  },
  {
    id: 'security',
    displayName: 'Security Agent',
    description: 'Checks HTTPS and security headers',
  },
  {
    id: 'crawl',
    displayName: 'Crawl Agent',
    description: 'Manages crawl queue, robots, and sitemap health',
  },
] as const;

export interface TechnicalIssueDraft {
  module: TechnicalSeoModule | string;
  issueCode: string;
  title: string;
  pageUrl?: string;
  severity: IssueSeverity;
  businessImpact: string;
  seoImpact: string;
  explanation: string;
  recommendedFix: string;
  estimatedFixMinutes: number;
  confidenceScore: number;
  suggestedFix?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface HealthScores {
  overall: number;
  performance: number;
  seo: number;
  accessibility: number;
  content: number;
  security: number;
  technical: number;
}

export interface AuditContext {
  targetUrl: string;
  domain: string;
  pagesAnalyzed?: number;
  hasRobots?: boolean;
  hasSitemap?: boolean;
  https?: boolean;
  discoveries?: Array<{ type?: string; url?: string }>;
  brokenLinks?: number;
  contactPages?: number;
}

/** Reports & Executive Intelligence — types (v0.96) */

export const REPORT_TYPES = [
  'executive',
  'client_seo',
  'campaign',
  'backlink',
  'outreach',
  'workflow',
  'ai_productivity',
  'organization_summary',
  'monthly',
  'quarterly',
] as const;

export type ReportType = (typeof REPORT_TYPES)[number];

export const REPORT_SCHEDULES = [
  'manual',
  'on_demand',
  'weekly',
  'monthly',
  'quarterly',
] as const;

export type ReportSchedule = (typeof REPORT_SCHEDULES)[number];

export const REPORT_EXPORT_FORMATS = ['pdf', 'pptx', 'csv', 'xlsx', 'json'] as const;
export type ReportExportFormat = (typeof REPORT_EXPORT_FORMATS)[number];

export interface ReportBrandConfig {
  name: string;
  logoUrl?: string | null;
  primaryColor: string;
  secondaryColor: string;
  footerText?: string | null;
  coverTitle?: string | null;
  agencyName?: string | null;
  agencyEmail?: string | null;
  agencyWebsite?: string | null;
}

export interface ExecutiveSummaryBlock {
  highlights: string[];
  keyWins: string[];
  risks: string[];
  recommendations: string[];
  nextActions: string[];
  projectedGrowth: string[];
  narrative: string;
}

export interface ReportSection {
  id: string;
  title: string;
  body: string;
  chartHint?: 'line' | 'area' | 'bar' | 'pie' | 'donut' | 'funnel' | 'leaderboard';
  metrics?: Record<string, number | string>;
  rows?: Array<{ label: string; value: number | string }>;
}

export interface GeneratedReportDocument {
  reportType: ReportType;
  title: string;
  generatedAt: string;
  periodLabel: string;
  brand: ReportBrandConfig;
  executiveSummary: ExecutiveSummaryBlock;
  sections: ReportSection[];
  metrics: Record<string, number>;
  insights: Array<{ title: string; body: string; severity?: string }>;
  forecasts: Array<{ metric: string; current: number; projected30d: number; projected90d: number }>;
}

export const REPORT_TYPE_META: Record<
  ReportType,
  { label: string; description: string; analyticsKey: string }
> = {
  executive: {
    label: 'Executive Report',
    description: 'Board-ready overview of SEO, campaigns, and AI productivity',
    analyticsKey: 'executive',
  },
  client_seo: {
    label: 'Client SEO Report',
    description: 'Client-facing SEO performance and opportunity growth',
    analyticsKey: 'seo',
  },
  campaign: {
    label: 'Campaign Report',
    description: 'Campaign success, approvals, and ROI',
    analyticsKey: 'campaigns',
  },
  backlink: {
    label: 'Backlink Report',
    description: 'Won, lost, verified links and authority trends',
    analyticsKey: 'backlinks',
  },
  outreach: {
    label: 'Outreach Report',
    description: 'Send, open, reply, and conversion performance',
    analyticsKey: 'outreach',
  },
  workflow: {
    label: 'Workflow Report',
    description: 'Automation runtime, success, and time saved',
    analyticsKey: 'workflows',
  },
  ai_productivity: {
    label: 'AI Productivity Report',
    description: 'Agent utilization, tokens, and hours saved',
    analyticsKey: 'ai',
  },
  organization_summary: {
    label: 'Organization Summary',
    description: 'Relationship health and partner growth',
    analyticsKey: 'relationships',
  },
  monthly: {
    label: 'Monthly Report',
    description: 'Month-over-month executive rollup',
    analyticsKey: 'executive',
  },
  quarterly: {
    label: 'Quarterly Report',
    description: 'Quarterly business outcomes and forecasts',
    analyticsKey: 'executive',
  },
};

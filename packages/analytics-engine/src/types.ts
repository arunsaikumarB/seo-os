/** Analytics & Insights Engine — core types (Epic 7) */

export const ANALYTICS_DASHBOARD_KEYS = [
  'executive',
  'seo',
  'backlinks',
  'campaigns',
  'workflows',
  'relationships',
  'outreach',
  'ai',
  'team',
  'system',
] as const;

export type AnalyticsDashboardKey = (typeof ANALYTICS_DASHBOARD_KEYS)[number];

export const INSIGHT_SEVERITIES = ['info', 'positive', 'warning', 'critical'] as const;
export type InsightSeverity = (typeof INSIGHT_SEVERITIES)[number];

export interface AnalyticsInsight {
  id: string;
  category: AnalyticsDashboardKey | 'cross';
  severity: InsightSeverity;
  title: string;
  body: string;
  recommendation?: string;
  metricDeltaPct?: number;
  createdAt: string;
}

export interface AnalyticsForecast {
  metric: string;
  current: number;
  projected30d: number;
  projected90d: number;
  confidence: number;
  unit?: string;
}

export interface TrendPoint {
  date: string;
  value: number;
  label?: string;
}

export interface NamedCount {
  name: string;
  value: number;
  pct?: number;
}

export interface FunnelStep {
  name: string;
  value: number;
  rate?: number;
}

export interface KpiCard {
  key: string;
  label: string;
  value: number;
  deltaPct?: number;
  unit?: string;
  trend?: 'up' | 'down' | 'flat';
}

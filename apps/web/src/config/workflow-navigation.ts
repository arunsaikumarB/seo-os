import {
  LayoutDashboard,
  Building2,
  FolderKanban,
  UsersRound,
  Settings,
  Globe,
  ScanSearch,
  BookOpen,
  Brain,
  Search,
  Trophy,
  Hash,
  Link2,
  Upload,
  Sparkles,
  ListTree,
  PenLine,
  ShieldCheck,
  Handshake,
  Contact,
  Mail,
  Send,
  BarChart3,
  LineChart,
  FileBarChart,
  MessageSquare,
  Bot,
  Target,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Workflow,
} from 'lucide-react';
import type { NavItem } from './navigation';

export interface WorkflowNavSection {
  id: string;
  label: string;
  emoji: string;
  items: WorkflowNavItem[];
}

export interface WorkflowNavItem extends NavItem {
  /** Absolute path (org/global). When false, href is relative to /projects/:id */
  absolute?: boolean;
}

export const workflowNavSections: WorkflowNavSection[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    emoji: '🏠',
    items: [{ label: 'Project Overview', href: 'home', icon: LayoutDashboard }],
  },
  {
    id: 'workspace',
    label: 'Workspace',
    emoji: '🏢',
    items: [
      { label: 'Organizations', href: '/projects', icon: Building2, absolute: true },
      { label: 'Projects', href: '/projects', icon: FolderKanban, absolute: true },
      { label: 'Team', href: '/org/team', icon: UsersRound, absolute: true },
      { label: 'Settings', href: 'settings/general', icon: Settings },
    ],
  },
  {
    id: 'website-analysis',
    label: 'Website Analysis',
    emoji: '🌐',
    items: [
      { label: 'Browser Intelligence', href: 'intelligence/browser', icon: ScanSearch },
      { label: 'Website Scanner', href: 'intelligence/website', icon: Globe },
      {
        label: 'Knowledge Base',
        href: 'knowledge/library',
        icon: BookOpen,
        featureFlag: 'knowledge_base',
      },
      { label: 'AI Memory', href: 'memory/timeline', icon: Brain, featureFlag: 'ai_memory' },
    ],
  },
  {
    id: 'seo-research',
    label: 'SEO Research',
    emoji: '🔍',
    items: [
      { label: 'Website SEO Audit', href: 'backlink-builder/audit', icon: Search },
      { label: 'Competitor Intelligence', href: 'competitors', icon: Trophy },
      { label: 'Keyword Intelligence', href: 'intelligence/keywords', icon: Hash },
      {
        label: 'Opportunity Discovery',
        href: 'prospects/pipeline',
        icon: Target,
        featureFlag: 'backlink_builder',
      },
    ],
  },
  {
    id: 'backlink-builder',
    label: 'Backlink Builder',
    emoji: '🔗',
    items: [
      {
        label: 'Dashboard',
        href: 'backlink-builder',
        icon: Link2,
        featureFlag: 'backlink_builder',
        badge: 'Flagship',
      },
      { label: 'Import Websites', href: 'backlink-builder/import', icon: Upload, featureFlag: 'backlink_builder' },
      { label: 'Website Analyzer', href: 'intelligence/website', icon: Globe },
      { label: 'Opportunity Explorer', href: 'backlink-builder/explorer', icon: Search, featureFlag: 'backlink_builder' },
      { label: 'AI Classification', href: 'backlink-builder/automation', icon: Sparkles, featureFlag: 'backlink_builder' },
      { label: 'AI Recommendations', href: 'backlink-builder/recommendations', icon: ListTree, featureFlag: 'backlink_builder' },
      { label: 'Pipeline', href: 'backlink-builder/pipeline', icon: ListTree, featureFlag: 'backlink_builder' },
      { label: 'Content Generator', href: 'outreach/studio', icon: PenLine, featureFlag: 'outreach' },
      { label: 'Link Verification', href: 'backlink-builder/pending', icon: CheckCircle2, featureFlag: 'backlink_builder' },
      { label: 'Won Links', href: 'backlink-builder/won', icon: TrendingUp, featureFlag: 'backlink_builder' },
      { label: 'Lost Links', href: 'backlink-builder/lost', icon: TrendingDown, featureFlag: 'backlink_builder' },
    ],
  },
  {
    id: 'campaigns-outreach',
    label: 'Campaigns & Outreach',
    emoji: '📢',
    items: [
      { label: 'Campaign Planner', href: 'campaigns', icon: Target, featureFlag: 'backlink_builder' },
      { label: 'Approval Center', href: 'campaigns/approvals', icon: ShieldCheck, featureFlag: 'backlink_builder' },
      { label: 'Relationship Hub', href: 'relationships', icon: Handshake },
      { label: 'Contacts', href: 'relationships', icon: Contact },
      { label: 'Email Drafts', href: 'outreach/studio', icon: PenLine, featureFlag: 'outreach' },
      { label: 'Outreach', href: 'outreach/inbox', icon: Mail, featureFlag: 'outreach' },
      { label: 'Sequences', href: 'outreach/sequences', icon: Send, featureFlag: 'outreach' },
    ],
  },
  {
    id: 'automation',
    label: 'Automation',
    emoji: '⚡',
    items: [
      {
        label: 'Workflows',
        href: 'workflows',
        icon: Workflow,
        featureFlag: 'workflows',
        badge: 'Epic 6',
      },
      {
        label: 'Templates',
        href: 'workflows/templates',
        icon: LayoutDashboard,
        featureFlag: 'workflows',
      },
      {
        label: 'Runs & Approvals',
        href: 'workflows/runs',
        icon: ShieldCheck,
        featureFlag: 'workflows',
      },
    ],
  },
  {
    id: 'results',
    label: 'Results',
    emoji: '📊',
    items: [
      { label: 'Reports', href: 'reports/library', icon: FileBarChart, featureFlag: 'reports' },
      { label: 'Analytics', href: 'analytics/overview', icon: LineChart, featureFlag: 'analytics' },
      { label: 'Executive Dashboard', href: '/org/executive', icon: BarChart3, absolute: true },
    ],
  },
  {
    id: 'ai',
    label: 'AI',
    emoji: '🤖',
    items: [
      { label: 'AI Chat', href: 'command-center', icon: MessageSquare, featureFlag: 'ai_workforce' },
      { label: 'AI Workforce', href: 'agents/catalog', icon: Bot, featureFlag: 'ai_workforce' },
    ],
  },
  {
    id: 'mission-control',
    label: 'Mission Control',
    emoji: '🎯',
    items: [
      {
        label: 'Mission Control',
        href: 'mission-control',
        icon: LayoutDashboard,
        featureFlag: 'mission_control',
      },
    ],
  },
];

/** Flat lookup for breadcrumbs and help */
export function findWorkflowNavLabel(pathSegment: string): string | undefined {
  for (const section of workflowNavSections) {
    const item = section.items.find((i) => i.href === pathSegment || i.href.endsWith(pathSegment));
    if (item) return item.label;
  }
  return undefined;
}

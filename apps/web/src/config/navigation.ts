import type { LucideIcon } from 'lucide-react';
import type { FeatureFlag } from '@seo-os/shared';
import {
  LayoutDashboard,
  Bot,
  BookOpen,
  Brain,
  Target,
  FileText,
  Mail,
  Link2,
  Wrench,
  Users,
  BarChart3,
  FileBarChart,
  Settings,
  MessageSquare,
  UsersRound,
  Bell,
  Plug,
  ScrollText,
  Building2,
  Globe,
  Hash,
  ListChecks,
  ShieldCheck,
  Workflow,
  FlaskConical,
} from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  disabled?: boolean;
  badge?: string;
  sprint?: string;
  featureFlag?: FeatureFlag;
}

export const orgNav: NavItem[] = [
  { label: 'Team', href: '/org/team', icon: UsersRound },
  { label: 'Settings', href: '/org/settings/general', icon: Settings },
  { label: 'Notifications', href: '/org/settings/notifications', icon: Bell },
  { label: 'Executive', href: '/org/executive', icon: Building2 },
  { label: 'Audit Log', href: '/org/audit-log', icon: ScrollText },
  { label: 'Integrations', href: '/org/integrations', icon: Plug, featureFlag: 'integrations' },
  { label: 'Help', href: '/org/help', icon: BookOpen },
  { label: 'Feedback', href: '/org/feedback', icon: MessageSquare, featureFlag: 'feedback_center' },
  { label: 'Closed Beta', href: '/org/beta', icon: FlaskConical, featureFlag: 'closed_beta' },
];

export const projectNav: NavItem[] = [
  {
    label: 'Mission Control',
    href: 'mission-control',
    icon: LayoutDashboard,
    featureFlag: 'mission_control',
  },
  {
    label: 'Backlink Builder',
    href: 'backlink-builder',
    icon: Link2,
    featureFlag: 'backlink_builder',
    badge: 'Flagship',
  },
  {
    label: 'AI Command Center',
    href: 'command-center',
    icon: MessageSquare,
    featureFlag: 'ai_workforce',
  },
  {
    label: 'AI Agents',
    href: 'agents/catalog',
    icon: Bot,
    featureFlag: 'ai_workforce',
  },
  {
    label: 'Knowledge Base',
    href: 'knowledge/library',
    icon: BookOpen,
    featureFlag: 'knowledge_base',
  },
  { label: 'AI Memory', href: 'memory/timeline', icon: Brain, featureFlag: 'ai_memory' },
  { label: 'Website Analyzer', href: 'intelligence/website', icon: Globe },
  { label: 'Competitors', href: 'competitors', icon: Users },
  { label: 'Keywords', href: 'intelligence/keywords', icon: Hash },
  { label: 'Prospects', href: 'prospects/pipeline', icon: Target, featureFlag: 'backlink_builder' },
  { label: 'Campaigns', href: 'campaigns', icon: Link2, featureFlag: 'backlink_builder' },
  {
    label: 'Opportunity Queue',
    href: 'campaigns/queue',
    icon: ListChecks,
    featureFlag: 'backlink_builder',
  },
  {
    label: 'Approval Center',
    href: 'campaigns/approvals',
    icon: ShieldCheck,
    featureFlag: 'backlink_builder',
  },
  { label: 'Content Studio', href: 'content/library', icon: FileText },
  { label: 'Outreach', href: 'outreach/inbox', icon: Mail, featureFlag: 'outreach' },
  {
    label: 'Workflows',
    href: 'workflows',
    icon: Workflow,
    featureFlag: 'workflows',
  },
  {
    label: 'Technical SEO',
    href: 'technical/overview',
    icon: Wrench,
    featureFlag: 'technical_seo',
  },
  {
    label: 'Integrations',
    href: 'integrations/hub',
    icon: Plug,
    featureFlag: 'integrations',
  },
  { label: 'Analytics', href: 'analytics/overview', icon: BarChart3, featureFlag: 'analytics' },
  {
    label: 'Reports',
    href: 'reports/library',
    icon: FileBarChart,
    featureFlag: 'reports',
  },
  { label: 'Settings', href: 'settings/general', icon: Settings },
];

export const mobileNavItems = (projectId: string): NavItem[] => [
  { label: 'Home', href: `/projects/${projectId}/mission-control`, icon: LayoutDashboard },
  { label: 'Projects', href: '/projects', icon: Building2 },
  { label: 'Search', href: `/projects/${projectId}/search`, icon: MessageSquare },
  { label: 'Team', href: '/org/team', icon: UsersRound },
  { label: 'Settings', href: `/projects/${projectId}/settings/general`, icon: Settings },
];

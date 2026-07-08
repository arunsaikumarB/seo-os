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
  Shield,
  Bell,
  Plug,
  CreditCard,
  ScrollText,
  Building2,
  Globe,
  Hash,
  ListChecks,
  ShieldCheck,
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
  { label: 'Notifications', href: '/org/settings/notifications', icon: Bell, sprint: 'Sprint 2' },
  { label: 'Security', href: '/org/settings/security', icon: Shield, sprint: 'Sprint 2' },
  { label: 'Executive', href: '/org/executive', icon: Building2 },
  { label: 'Audit Log', href: '/org/audit-log', icon: ScrollText, sprint: 'Sprint 6' },
  { label: 'Integrations', href: '/org/integrations', icon: Plug, sprint: 'Sprint 6' },
  { label: 'Billing', href: '/org/billing', icon: CreditCard, sprint: 'Future' },
];

export const projectNav: NavItem[] = [
  { label: 'Mission Control', href: 'mission-control', icon: LayoutDashboard, featureFlag: 'mission_control' },
  { label: 'Backlink Builder', href: 'backlink-builder', icon: Link2, featureFlag: 'backlink_builder', badge: 'Flagship' },
  { label: 'AI Command Center', href: 'command-center', icon: MessageSquare, featureFlag: 'ai_workforce' },
  { label: 'AI Agents', href: 'agents/catalog', icon: Bot, sprint: 'Sprint 4', featureFlag: 'ai_workforce' },
  { label: 'Knowledge Base', href: 'knowledge/library', icon: BookOpen, featureFlag: 'knowledge_base' },
  { label: 'AI Memory', href: 'memory/timeline', icon: Brain, featureFlag: 'ai_memory' },
  { label: 'Website Analyzer', href: 'intelligence/website', icon: Globe },
  { label: 'Competitors', href: 'competitors', icon: Users },
  { label: 'Keywords', href: 'intelligence/keywords', icon: Hash },
  { label: 'Prospects', href: 'prospects/pipeline', icon: Target, featureFlag: 'backlink_builder' },
  { label: 'Campaigns', href: 'campaigns', icon: Link2, featureFlag: 'backlink_builder' },
  { label: 'Opportunity Queue', href: 'campaigns/queue', icon: ListChecks, featureFlag: 'backlink_builder' },
  { label: 'Approval Center', href: 'campaigns/approvals', icon: ShieldCheck, featureFlag: 'backlink_builder' },
  { label: 'Content Studio', href: 'content/library', icon: FileText, sprint: 'Sprint 7' },
  { label: 'Outreach', href: 'outreach/inbox', icon: Mail, sprint: 'Sprint 7', featureFlag: 'outreach' },
  { label: 'Technical SEO', href: 'technical/overview', icon: Wrench, sprint: 'Sprint 7', featureFlag: 'technical_seo' },
  { label: 'Analytics', href: 'analytics/overview', icon: BarChart3, sprint: 'Sprint 7' },
  { label: 'Reports', href: 'reports/library', icon: FileBarChart, sprint: 'Sprint 8', featureFlag: 'reports' },
  { label: 'Settings', href: 'settings/general', icon: Settings },
];

export const mobileNavItems = (projectId: string): NavItem[] => [
  { label: 'Home', href: `/projects/${projectId}/mission-control`, icon: LayoutDashboard },
  { label: 'Projects', href: '/projects', icon: Building2 },
  { label: 'Search', href: `/projects/${projectId}/search`, icon: MessageSquare },
  { label: 'Team', href: '/org/team', icon: UsersRound },
  { label: 'Settings', href: `/projects/${projectId}/settings/general`, icon: Settings },
];

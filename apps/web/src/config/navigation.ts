import type { LucideIcon } from 'lucide-react';
import type { FeatureFlag } from '@seo-os/shared';
import {
  LayoutDashboard,
  Settings,
  MessageSquare,
  UsersRound,
  Bell,
  Plug,
  BookOpen,
  Building2,
  FlaskConical,
  ScrollText,
  Link2,
  Upload,
  Search,
  Sparkles,
  ListChecks,
  Target,
  FileText,
  ClipboardList,
  Handshake,
  CheckCircle2,
  FileBarChart,
  Radar,
  HeartPulse,
  MonitorSmartphone,
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
  { label: 'Integrations', href: '/org/integrations', icon: Plug, featureFlag: 'integrations' },
  { label: 'Help', href: '/org/help', icon: BookOpen },
  { label: 'Feedback', href: '/org/feedback', icon: MessageSquare, featureFlag: 'feedback_center' },
  { label: 'Audit Log', href: '/org/audit-log', icon: ScrollText },
  { label: 'Diagnostics', href: '/org/diagnostics', icon: HeartPulse },
  { label: 'Executive', href: '/org/executive', icon: Building2 },
  { label: 'Closed Beta', href: '/org/beta', icon: FlaskConical, featureFlag: 'closed_beta' },
];

/** Flat project nav — aligned with Backlink Builder V1.0 IA */
export const projectNav: NavItem[] = [
  {
    label: 'Dashboard',
    href: 'mission-control',
    icon: LayoutDashboard,
    featureFlag: 'mission_control',
  },
  {
    label: 'Backlink Dashboard',
    href: 'backlink-builder',
    icon: Link2,
    featureFlag: 'backlink_builder',
  },
  {
    label: 'Import Websites',
    href: 'backlink-builder/import',
    icon: Upload,
    featureFlag: 'backlink_builder',
  },
  {
    label: 'Discover Websites',
    href: 'backlink-builder/discover',
    icon: Radar,
    featureFlag: 'backlink_builder',
  },
  {
    label: 'Explorer',
    href: 'backlink-builder/explorer',
    icon: Search,
    featureFlag: 'backlink_builder',
  },
  {
    label: 'AI Analysis',
    href: 'backlink-builder/automation',
    icon: Sparkles,
    featureFlag: 'backlink_builder',
  },
  {
    label: 'Opportunity Queue',
    href: 'campaigns/queue',
    icon: ListChecks,
    featureFlag: 'backlink_builder',
  },
  {
    label: 'Campaigns',
    href: 'campaigns',
    icon: Target,
    featureFlag: 'backlink_builder',
  },
  { label: 'Content Studio', href: 'content/library', icon: FileText },
  { label: 'Providers', href: 'providers', icon: Plug, featureFlag: 'integrations' },
  { label: 'Diagnostics', href: 'diagnostics', icon: HeartPulse },
  {
    label: 'Browser Runtime',
    href: 'settings/browser-runtime',
    icon: MonitorSmartphone,
    featureFlag: 'backlink_builder',
  },
  {
    label: 'Submission Center',
    href: 'backlink-builder/tracking',
    icon: ClipboardList,
    featureFlag: 'backlink_builder',
  },
  { label: 'Relationship Hub', href: 'relationships', icon: Handshake },
  {
    label: 'Verification',
    href: 'backlink-builder/pending',
    icon: CheckCircle2,
    featureFlag: 'backlink_builder',
  },
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
  { label: 'Builder', href: `/projects/${projectId}/backlink-builder`, icon: Link2 },
  { label: 'Projects', href: '/projects', icon: Building2 },
  { label: 'Queue', href: `/projects/${projectId}/campaigns/queue`, icon: ListChecks },
  { label: 'Settings', href: `/projects/${projectId}/settings/general`, icon: Settings },
];

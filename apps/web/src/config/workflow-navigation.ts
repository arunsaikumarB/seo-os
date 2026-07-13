import {
  LayoutDashboard,
  Building2,
  FolderKanban,
  UsersRound,
  Settings,
  Link2,
  Upload,
  Search,
  Sparkles,
  ListChecks,
  ListTree,
  Target,
  Mail,
  Handshake,
  CheckCircle2,
  FileBarChart,
  MessageSquare,
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

/**
 * Backlink-first primary navigation for Version 1.0.
 * Secondary engines (Browser Intelligence, Knowledge, Memory, etc.) stay on API routes
 * but are intentionally omitted from the sidebar.
 */
export const workflowNavSections: WorkflowNavSection[] = [
  {
    id: 'home',
    label: 'Home',
    emoji: '🎯',
    items: [
      {
        label: 'Mission Control',
        href: 'mission-control',
        icon: LayoutDashboard,
        featureFlag: 'mission_control',
      },
      {
        label: 'SEO AI Assistant',
        href: 'command-center',
        icon: MessageSquare,
        featureFlag: 'ai_workforce',
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
      },
      {
        label: 'Import Websites',
        href: 'backlink-builder/import',
        icon: Upload,
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
        label: 'Pipeline',
        href: 'backlink-builder/pipeline',
        icon: ListTree,
        featureFlag: 'backlink_builder',
      },
      {
        label: 'Campaigns',
        href: 'campaigns',
        icon: Target,
        featureFlag: 'backlink_builder',
      },
      {
        label: 'Outreach',
        href: 'outreach/inbox',
        icon: Mail,
        featureFlag: 'outreach',
      },
      {
        label: 'Relationships',
        href: 'relationships',
        icon: Handshake,
      },
      {
        label: 'Link Verification',
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
    ],
  },
  {
    id: 'workspace',
    label: 'Workspace',
    emoji: '🏢',
    items: [
      { label: 'Projects', href: '/projects', icon: FolderKanban, absolute: true },
      { label: 'Team', href: '/org/team', icon: UsersRound, absolute: true },
      { label: 'Organizations', href: '/projects', icon: Building2, absolute: true },
      { label: 'Settings', href: 'settings/general', icon: Settings },
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

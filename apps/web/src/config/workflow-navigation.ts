import {
  LayoutDashboard,
  Settings,
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
} from 'lucide-react';
import type { NavItem } from './navigation';

export interface WorkflowNavSection {
  id: string;
  label: string;
  emoji: string;
  items: WorkflowNavItem[];
}

export interface WorkflowNavItem extends NavItem {
  absolute?: boolean;
}

/**
 * V1.0 Backlink Operations — single product surface.
 * Secondary engines remain on API routes but are omitted from the sidebar.
 */
export const workflowNavSections: WorkflowNavSection[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    emoji: '📊',
    items: [
      {
        label: 'Dashboard',
        href: 'mission-control',
        icon: LayoutDashboard,
        featureFlag: 'mission_control',
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
      {
        label: 'Content Studio',
        href: 'content/library',
        icon: FileText,
      },
      {
        label: 'Submission Center',
        href: 'backlink-builder/tracking',
        icon: ClipboardList,
        featureFlag: 'backlink_builder',
      },
      {
        label: 'Relationship Hub',
        href: 'relationships',
        icon: Handshake,
      },
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
    ],
  },
  {
    id: 'workspace',
    label: 'Workspace',
    emoji: '⚙️',
    items: [{ label: 'Settings', href: 'settings/general', icon: Settings }],
  },
];

export function findWorkflowNavLabel(pathSegment: string): string | undefined {
  for (const section of workflowNavSections) {
    const item = section.items.find((i) => i.href === pathSegment || i.href.endsWith(pathSegment));
    if (item) return item.label;
  }
  return undefined;
}

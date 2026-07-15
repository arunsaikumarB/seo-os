import {
  LayoutDashboard,
  Settings,
  Link2,
  Upload,
  Sparkles,
  ListChecks,
  Target,
  FileText,
  ClipboardList,
  Handshake,
  CheckCircle2,
  FileBarChart,
  Radar,
  Image,
  Video,
  Globe,
  Lightbulb,
  Layers,
  HeartPulse,
  MonitorSmartphone,
  Plug,
  GraduationCap,
  Search,
  FolderPlus,
} from 'lucide-react';
import type { NavItem } from './navigation';

export interface WorkflowNavSection {
  id: string;
  label: string;
  emoji?: string;
  /** When true, section starts collapsed and is labeled Advanced */
  advanced?: boolean;
  /** When true, render items without a collapsible header (primary pipeline) */
  flat?: boolean;
  items: WorkflowNavItem[];
}

export interface WorkflowNavItem extends NavItem {
  absolute?: boolean;
  /** Shown as ①…⑧ in primary pipeline */
  stepNumber?: number;
  dividerBefore?: boolean;
}

/** V2 guided IA — primary pipeline + collapsible Advanced */
export const workflowNavSections: WorkflowNavSection[] = [
  {
    id: 'primary',
    label: 'Backlink Builder',
    flat: true,
    items: [
      {
        label: 'Dashboard',
        href: 'home',
        icon: LayoutDashboard,
      },
      {
        label: 'Create Project',
        href: 'settings/general',
        icon: FolderPlus,
        stepNumber: 1,
        dividerBefore: true,
      },
      {
        label: 'Import Websites',
        href: 'backlink-builder/import',
        icon: Upload,
        featureFlag: 'backlink_builder',
        stepNumber: 2,
      },
      {
        label: 'AI Discovery & Qualification',
        href: 'backlink-builder/classification',
        icon: Sparkles,
        featureFlag: 'backlink_builder',
        stepNumber: 3,
      },
      {
        label: 'Opportunity Review',
        href: 'campaigns/queue',
        icon: ListChecks,
        featureFlag: 'backlink_builder',
        stepNumber: 4,
      },
      {
        label: 'Content Studio',
        href: 'content/library',
        icon: FileText,
        featureFlag: 'v11_content_studio_v2',
        stepNumber: 5,
      },
      {
        label: 'Browser Execution',
        href: 'backlink-builder/execution',
        icon: Link2,
        featureFlag: 'bee_enabled',
        stepNumber: 6,
      },
      {
        label: 'Verification',
        href: 'backlink-builder/pending',
        icon: CheckCircle2,
        featureFlag: 'backlink_builder',
        stepNumber: 7,
      },
      {
        label: 'Reports',
        href: 'reports/library',
        icon: FileBarChart,
        featureFlag: 'reports',
        stepNumber: 8,
      },
    ],
  },
  {
    id: 'advanced',
    label: 'Advanced',
    advanced: true,
    items: [
      { label: 'Campaigns', href: 'campaigns', icon: Target, featureFlag: 'backlink_builder' },
      { label: 'Relationship Hub', href: 'relationships', icon: Handshake },
      {
        label: 'Image Studio',
        href: 'backlink-builder/image-studio',
        icon: Image,
        featureFlag: 'v11_media_studios',
      },
      {
        label: 'Video Studio',
        href: 'backlink-builder/video-studio',
        icon: Video,
        featureFlag: 'v11_media_studios',
      },
      {
        label: 'Browser Assistant',
        href: 'backlink-builder/browser-assistant',
        icon: Globe,
        featureFlag: 'v11_browser_assistant',
      },
      {
        label: 'Recommendations',
        href: 'backlink-builder/recommendations',
        icon: Lightbulb,
        featureFlag: 'v11_recommendations',
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
        label: 'Submission Center',
        href: 'backlink-builder/tracking',
        icon: ClipboardList,
        featureFlag: 'v11_submission_assistant',
      },
      {
        label: 'AI Analysis',
        href: 'backlink-builder/automation',
        icon: Layers,
        featureFlag: 'backlink_builder',
      },
      { label: 'Provider Settings', href: 'providers', icon: Plug, featureFlag: 'integrations' },
      { label: 'Runtime Diagnostics', href: 'diagnostics', icon: HeartPulse },
      {
        label: 'Browser Runtime',
        href: 'settings/browser-runtime',
        icon: MonitorSmartphone,
        featureFlag: 'backlink_builder',
      },
      {
        label: 'Mission Control',
        href: 'mission-control',
        icon: LayoutDashboard,
        featureFlag: 'mission_control',
      },
      {
        label: 'Learning',
        href: 'command-center',
        icon: GraduationCap,
      },
      { label: 'Settings', href: 'settings/general', icon: Settings },
    ],
  },
];

export function findWorkflowNavLabel(pathSegment: string): string | undefined {
  for (const section of workflowNavSections) {
    const item = section.items.find((i) => i.href === pathSegment || i.href.endsWith(pathSegment));
    if (item) return item.label;
  }
  return undefined;
}

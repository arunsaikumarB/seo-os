import {
  LayoutDashboard,
  Settings,
  Upload,
  Sparkles,
  Target,
  FileText,
  Handshake,
  CheckCircle2,
  FileBarChart,
  Image,
  Video,
  Globe,
  HeartPulse,
  MonitorSmartphone,
  Plug,
  GraduationCap,
  FolderPlus,
  ClipboardList,
  Bot,
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
  /** Shown as ①…⑦ in primary pipeline */
  stepNumber?: number;
  dividerBefore?: boolean;
}

/** Guided IA — 7-step primary pipeline + Advanced (browser auto-submit lives here) */
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
        label: 'AI Review',
        href: 'backlink-builder/classification',
        icon: Sparkles,
        featureFlag: 'backlink_builder',
        stepNumber: 3,
      },
      {
        label: 'Generate Content',
        href: 'content/library',
        icon: FileText,
        featureFlag: 'v11_content_studio_v2',
        stepNumber: 4,
      },
      {
        label: 'Submit Backlinks',
        href: 'backlink-builder/assisted-manual',
        icon: ClipboardList,
        featureFlag: 'backlink_builder',
        stepNumber: 5,
      },
      {
        label: 'Track Results',
        href: 'backlink-builder/track-results',
        icon: CheckCircle2,
        featureFlag: 'backlink_builder',
        stepNumber: 6,
      },
      {
        label: 'Reports',
        href: 'reports/library',
        icon: FileBarChart,
        featureFlag: 'reports',
        stepNumber: 7,
      },
    ],
  },
  {
    id: 'advanced',
    label: 'Advanced Tools',
    advanced: true,
    items: [
      {
        label: 'Browser Auto-Submit',
        href: 'backlink-builder/execution',
        icon: Bot,
        featureFlag: 'bee_enabled',
      },
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
        label: 'Intervention Window',
        href: 'backlink-builder/browser-assistant',
        icon: Globe,
        featureFlag: 'v11_browser_assistant',
      },
      {
        label: 'Mission Control',
        href: 'mission-control',
        icon: MonitorSmartphone,
        featureFlag: 'mission_control',
      },
      { label: 'Provider Settings', href: 'providers', icon: Plug, featureFlag: 'integrations' },
      { label: 'Diagnostics', href: 'diagnostics', icon: HeartPulse },
      {
        label: 'Learning',
        href: 'command-center',
        icon: GraduationCap,
      },
      {
        label: 'System Health',
        href: 'settings/browser-runtime',
        icon: MonitorSmartphone,
        featureFlag: 'backlink_builder',
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

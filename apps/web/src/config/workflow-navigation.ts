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
  Kanban,
  Image,
  Video,
  Globe,
  Lightbulb,
  Mail,
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

/** V1.1 Backlink Operations — additive IA over V1.0 */
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
      { label: 'Dashboard', href: 'backlink-builder', icon: Link2, featureFlag: 'backlink_builder' },
      { label: 'Import Websites', href: 'backlink-builder/import', icon: Upload, featureFlag: 'backlink_builder' },
      { label: 'Discover Websites', href: 'backlink-builder/discover', icon: Radar, featureFlag: 'backlink_builder' },
      { label: 'Explorer', href: 'backlink-builder/explorer', icon: Search, featureFlag: 'backlink_builder' },
      { label: 'AI Analysis', href: 'backlink-builder/automation', icon: Sparkles, featureFlag: 'backlink_builder' },
      {
        label: 'Submission Queue',
        href: 'backlink-builder/queue',
        icon: Kanban,
        featureFlag: 'v11_submission_queue',
      },
      { label: 'Opportunity Queue', href: 'campaigns/queue', icon: ListChecks, featureFlag: 'backlink_builder' },
      { label: 'Campaigns', href: 'campaigns', icon: Target, featureFlag: 'backlink_builder' },
      { label: 'Content Studio', href: 'content/library', icon: FileText, featureFlag: 'v11_content_studio_v2' },
      { label: 'Image Studio', href: 'backlink-builder/image-studio', icon: Image, featureFlag: 'v11_media_studios' },
      { label: 'Video Studio', href: 'backlink-builder/video-studio', icon: Video, featureFlag: 'v11_media_studios' },
      {
        label: 'Submission Center',
        href: 'backlink-builder/tracking',
        icon: ClipboardList,
        featureFlag: 'v11_submission_assistant',
      },
      {
        label: 'Browser Assistant',
        href: 'backlink-builder/browser-assistant',
        icon: Globe,
        featureFlag: 'v11_browser_assistant',
      },
      {
        label: 'Execution Center',
        href: 'backlink-builder/execution',
        icon: Kanban,
        featureFlag: 'bee_enabled',
      },
      {
        label: 'Recommendations',
        href: 'backlink-builder/recommendations',
        icon: Lightbulb,
        featureFlag: 'v11_recommendations',
      },
      { label: 'Relationship Hub', href: 'relationships', icon: Handshake },
      { label: 'Verification', href: 'backlink-builder/pending', icon: CheckCircle2, featureFlag: 'backlink_builder' },
      { label: 'Reports', href: 'reports/library', icon: FileBarChart, featureFlag: 'reports' },
    ],
  },
  {
    id: 'workspace',
    label: 'Workspace',
    emoji: '⚙️',
    items: [
      { label: 'Unified Inbox', href: 'outreach/inbox', icon: Mail, featureFlag: 'outreach' },
      { label: 'Integrations', href: 'integrations/hub', icon: Settings, featureFlag: 'integrations' },
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

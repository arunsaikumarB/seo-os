/** Platform event catalog — Epic 6.1 */

export const PLATFORM_EVENT_TYPES = [
  'website_scan_completed',
  'opportunity_discovery_started',
  'opportunity_discovered',
  'campaign_created',
  'workflow_created',
  'workflow_started',
  'workflow_completed',
  'workflow_failed',
  'outreach_draft_generated',
  'approval_granted',
  'approval_rejected',
  'email_sent',
  'reply_received',
  'backlink_verified',
  'backlink_won',
  'dashboard_updated',
  'timeline_updated',
  'notification_created',
  'agent_run_completed',
  'agent_run_failed',
  'knowledge_document_ready',
  'memory_fact_approved',
] as const;

export type PlatformEventType = (typeof PLATFORM_EVENT_TYPES)[number];

export type PlatformEventSeverity =
  | 'info'
  | 'success'
  | 'warning'
  | 'failure'
  | 'approval'
  | 'recommendation'
  | 'system';

export type PlatformSourceModule =
  | 'browser_intelligence'
  | 'seo_intelligence'
  | 'campaigns'
  | 'backlink_builder'
  | 'backlink_automation'
  | 'relationships'
  | 'outreach'
  | 'workflows'
  | 'knowledge'
  | 'memory'
  | 'ai'
  | 'mission_control'
  | 'system';

/** Workflow trigger types that can be auto-started from platform events */
export const WORKFLOW_TRIGGERABLE_EVENTS = new Set([
  'website_scan_completed',
  'opportunity_discovered',
  'campaign_created',
  'approval_granted',
  'reply_received',
  'backlink_verified',
]);

export interface PublishPlatformEventInput {
  workspaceId?: string | null;
  orgId?: string | null;
  sourceModule: PlatformSourceModule;
  eventType: PlatformEventType | string;
  title: string;
  summary?: string;
  severity?: PlatformEventSeverity;
  entityType?: string;
  entityId?: string;
  payload?: Record<string, unknown>;
  actorId?: string | null;
  /** Also create a user notification when set */
  notifyUserId?: string | null;
  href?: string;
  /** Write audit log entry */
  audit?: {
    action: string;
    resourceType?: string;
    resourceId?: string;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  };
}

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
  'technical_audit_completed',
  'critical_seo_issue_detected',
  'integration_connected',
  'integration_disconnected',
  'integration_sync_completed',
  'integration_sync_failed',
  'integration_token_refreshed',
  'beta_org_enabled',
  'beta_feedback_submitted',
  // Automation pipeline (real execution)
  'website_imported',
  'website_validated',
  'website_analyzed',
  'opportunity_created',
  'draft_generated',
  'submission_created',
  'relationship_created',
  'analytics_updated',
  'mission_control_updated',
  'report_updated',
  'automation_pipeline_completed',
  'automation_pipeline_failed',
  // Stage completion notifications (pipeline milestones)
  'stage_import_completed',
  'stage_ai_review_completed',
  'stage_content_generation_completed',
  'stage_assisted_manual_prepared',
  'stage_auto_submit_batch_completed',
  'stage_report_ready',
  'stage_campaign_finished',
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
  | 'technical_seo'
  | 'integrations'
  | 'system';

/** Workflow trigger types that can be auto-started from platform events */
export const WORKFLOW_TRIGGERABLE_EVENTS = new Set([
  'website_scan_completed',
  'opportunity_discovered',
  'campaign_created',
  'approval_granted',
  'reply_received',
  'backlink_verified',
  'critical_seo_issue_detected',
  'technical_audit_completed',
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

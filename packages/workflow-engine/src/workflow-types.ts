/** Workflow Automation Engine — core types (Epic 6) */

export const WORKFLOW_NODE_TYPES = [
  'trigger',
  'condition',
  'delay',
  'ai_task',
  'approval',
  'campaign',
  'outreach',
  'verification',
  'notification',
  'update_status',
  'end',
] as const;

export type WorkflowNodeType = (typeof WORKFLOW_NODE_TYPES)[number];

export const WORKFLOW_TRIGGER_TYPES = [
  'manual',
  'scheduled',
  'website_scan_completed',
  'opportunity_discovered',
  'campaign_created',
  'approval_granted',
  'reply_received',
  'backlink_verified',
  'critical_seo_issue_detected',
  'technical_audit_completed',
] as const;

export type WorkflowTriggerType = (typeof WORKFLOW_TRIGGER_TYPES)[number];

export const WORKFLOW_ACTION_TYPES = [
  'generate_ai_content',
  'create_campaign',
  'assign_relationship',
  'prepare_outreach_draft',
  'request_approval',
  'update_pipeline',
  'create_timeline_event',
  'notify_user',
  'verify_backlink',
] as const;

export type WorkflowActionType = (typeof WORKFLOW_ACTION_TYPES)[number];

export const WORKFLOW_STATUSES = ['draft', 'active', 'paused', 'archived'] as const;
export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

export const WORKFLOW_RUN_STATUSES = [
  'queued',
  'running',
  'waiting_approval',
  'waiting_delay',
  'completed',
  'failed',
  'cancelled',
] as const;
export type WorkflowRunStatus = (typeof WORKFLOW_RUN_STATUSES)[number];

export interface WorkflowNodePosition {
  x: number;
  y: number;
}

export interface WorkflowConditionRule {
  field: string;
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq' | 'contains' | 'exists';
  value?: string | number | boolean;
}

export interface WorkflowNodeData {
  label: string;
  description?: string;
  /** For trigger nodes */
  triggerType?: WorkflowTriggerType;
  /** For condition nodes */
  condition?: WorkflowConditionRule;
  /** For delay nodes — minutes */
  delayMinutes?: number;
  /** For AI / campaign / outreach / etc. */
  action?: WorkflowActionType;
  actionConfig?: Record<string, unknown>;
  /** Requires human approval before continuing (external actions default true) */
  requiresApproval?: boolean;
  /** Branch keys for condition edges: true | false | default */
  branch?: string;
}

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  data: WorkflowNodeData;
  position: WorkflowNodePosition;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  /** Condition branch label: true, false, or default */
  label?: string;
}

export interface WorkflowDefinition {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export interface WorkflowTemplate {
  key: string;
  name: string;
  description: string;
  category: string;
  triggerType: WorkflowTriggerType;
  definition: WorkflowDefinition;
  estimatedMinutes: number;
}

export function createNodeId(prefix = 'node'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createEdgeId(source: string, target: string): string {
  return `e_${source}_${target}`;
}

export function emptyDefinition(): WorkflowDefinition {
  return { nodes: [], edges: [] };
}

export function findTriggerNode(definition: WorkflowDefinition): WorkflowNode | undefined {
  return definition.nodes.find((n) => n.type === 'trigger');
}

export function getOutgoingEdges(
  definition: WorkflowDefinition,
  nodeId: string,
  branch?: string
): WorkflowEdge[] {
  return definition.edges.filter((e) => {
    if (e.source !== nodeId) return false;
    if (!branch) return true;
    return (e.label ?? 'default') === branch || (!e.label && branch === 'default');
  });
}

export function getNode(definition: WorkflowDefinition, nodeId: string): WorkflowNode | undefined {
  return definition.nodes.find((n) => n.id === nodeId);
}

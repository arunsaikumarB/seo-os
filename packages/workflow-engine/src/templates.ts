import {
  createEdgeId,
  createNodeId,
  type WorkflowDefinition,
  type WorkflowNode,
  type WorkflowTemplate,
} from './workflow-types.js';

function node(
  type: WorkflowNode['type'],
  label: string,
  x: number,
  y: number,
  data: Partial<WorkflowNode['data']> = {}
): WorkflowNode {
  return {
    id: createNodeId(type),
    type,
    position: { x, y },
    data: { label, ...data },
  };
}

function chain(nodes: WorkflowNode[]): WorkflowDefinition {
  const edges = nodes.slice(0, -1).map((n, i) => ({
    id: createEdgeId(n.id, nodes[i + 1].id),
    source: n.id,
    target: nodes[i + 1].id,
    label: 'default' as const,
  }));
  return { nodes, edges };
}

function campaignTemplate(
  key: string,
  name: string,
  description: string,
  category: string,
  opportunityType: string
): WorkflowTemplate {
  const nodes = [
    node('trigger', 'Opportunity discovered', 40, 120, {
      triggerType: 'opportunity_discovered',
      description: `Fires when a ${opportunityType} opportunity is discovered`,
    }),
    node('condition', 'Score > 70?', 200, 120, {
      condition: { field: 'opportunity.score', operator: 'gt', value: 70 },
    }),
    node('ai_task', 'Generate AI content', 360, 120, {
      action: 'generate_ai_content',
      actionConfig: { opportunityType },
    }),
    node('campaign', 'Create campaign', 520, 120, {
      action: 'create_campaign',
      actionConfig: { name: `${name} batch` },
    }),
    node('outreach', 'Prepare outreach draft', 680, 120, {
      action: 'prepare_outreach_draft',
      requiresApproval: true,
    }),
    node('approval', 'Request approval', 840, 120, {
      action: 'request_approval',
      requiresApproval: true,
    }),
    node('verification', 'Verify backlink', 1000, 120, {
      action: 'verify_backlink',
    }),
    node('notification', 'Notify user', 1160, 120, {
      action: 'notify_user',
    }),
    node('update_status', 'Update pipeline', 1320, 120, {
      action: 'update_pipeline',
      actionConfig: { status: 'won_or_queued' },
    }),
    node('end', 'End', 1480, 120, {}),
  ];

  // Condition true/false both continue the happy path for v1 templates;
  // false still proceeds but marks lower priority in context via rule evaluation.
  const definition = chain(nodes);
  const condition = nodes[1];
  const ai = nodes[2];
  definition.edges = definition.edges.filter((e) => e.source !== condition.id);
  definition.edges.push(
    {
      id: createEdgeId(condition.id, ai.id) + '_t',
      source: condition.id,
      target: ai.id,
      label: 'true',
    },
    {
      id: createEdgeId(condition.id, ai.id) + '_f',
      source: condition.id,
      target: ai.id,
      label: 'false',
    }
  );

  return {
    key,
    name,
    description,
    category,
    triggerType: 'opportunity_discovered',
    estimatedMinutes: 15,
    definition,
  };
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  campaignTemplate(
    'guest_post_campaign',
    'Guest Post Campaign',
    'Discover guest post opportunities, generate pitches, and prepare approved outreach.',
    'Backlink Acquisition',
    'guest_post'
  ),
  campaignTemplate(
    'broken_link_campaign',
    'Broken Link Campaign',
    'Find broken links, draft replacement suggestions, and request approval before outreach.',
    'Backlink Acquisition',
    'broken_link'
  ),
  campaignTemplate(
    'directory_submission_campaign',
    'Directory Submission Campaign',
    'Qualify directories, generate listings copy, and route through approval.',
    'Citations',
    'directory'
  ),
  campaignTemplate(
    'resource_page_campaign',
    'Resource Page Campaign',
    'Target resource pages with relevance scoring and personalized outreach drafts.',
    'Backlink Acquisition',
    'resource_page'
  ),
  campaignTemplate(
    'brand_mention_campaign',
    'Brand Mention Campaign',
    'Convert unlinked brand mentions into link requests with relationship context.',
    'Brand',
    'brand_mention'
  ),
  campaignTemplate(
    'digital_pr_campaign',
    'Digital PR Campaign',
    'Coordinate digital PR opportunities with campaigns, drafts, and approvals.',
    'PR',
    'digital_pr'
  ),
  campaignTemplate(
    'podcast_outreach_campaign',
    'Podcast Outreach Campaign',
    'Qualify podcasts, draft guest pitches, and pause for human approval.',
    'PR',
    'podcast'
  ),
  campaignTemplate(
    'qa_campaign',
    'Q&A Campaign',
    'Surface Q&A opportunities and prepare helpful answers for approval.',
    'Community',
    'qa'
  ),
  campaignTemplate(
    'forum_campaign',
    'Forum Campaign',
    'Find forum threads, draft value-first replies, and require approval before posting.',
    'Community',
    'forum'
  ),
  {
    key: 'critical_seo_issue_workflow',
    name: 'Critical SEO Issue Response',
    description:
      'When a critical technical SEO issue is detected: notify, generate a fix, request approval, then export the recommendation.',
    category: 'Technical SEO',
    triggerType: 'critical_seo_issue_detected',
    estimatedMinutes: 10,
    definition: chain([
      node('trigger', 'Critical SEO issue detected', 40, 120, {
        triggerType: 'critical_seo_issue_detected',
        description: 'Fires when Technical SEO Engine finds a critical issue',
      }),
      node('notification', 'Notify user', 220, 120, {
        action: 'notify_user',
      }),
      node('ai_task', 'Generate fix', 400, 120, {
        action: 'generate_ai_content',
        actionConfig: { opportunityType: 'technical_seo_fix' },
      }),
      node('approval', 'Approval', 580, 120, {
        action: 'request_approval',
        requiresApproval: true,
      }),
      node('notification', 'Export recommendation', 760, 120, {
        action: 'notify_user',
        actionConfig: { message: 'Export Technical SEO recommendation (CSV/JSON/PDF)' },
      }),
      node('end', 'End', 940, 120, {}),
    ]),
  },
];

export function getWorkflowTemplate(key: string): WorkflowTemplate | undefined {
  return WORKFLOW_TEMPLATES.find((t) => t.key === key);
}

export function listWorkflowTemplates(): WorkflowTemplate[] {
  return WORKFLOW_TEMPLATES;
}

export function createBlankWorkflowDefinition(): WorkflowDefinition {
  return chain([
    node('trigger', 'Manual trigger', 80, 120, { triggerType: 'manual' }),
    node('ai_task', 'AI task', 280, 120, { action: 'generate_ai_content' }),
    node('approval', 'Approval gate', 480, 120, {
      action: 'request_approval',
      requiresApproval: true,
    }),
    node('end', 'End', 680, 120, {}),
  ]);
}

import {
  getNode,
  getOutgoingEdges,
  type WorkflowConditionRule,
  type WorkflowDefinition,
  type WorkflowNode,
} from './workflow-types.js';

export type StepExecutionResult =
  | { status: 'completed'; output: Record<string, unknown>; nextBranch?: string }
  | { status: 'waiting_approval'; output: Record<string, unknown>; summary: string }
  | { status: 'waiting_delay'; output: Record<string, unknown>; delayMinutes: number }
  | { status: 'failed'; error: string };

function readPath(ctx: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, ctx);
}

export function evaluateCondition(
  rule: WorkflowConditionRule,
  context: Record<string, unknown>
): boolean {
  const left = readPath(context, rule.field);
  const right = rule.value;

  switch (rule.operator) {
    case 'exists':
      return left !== undefined && left !== null;
    case 'eq':
      return left === right;
    case 'neq':
      return left !== right;
    case 'gt':
      return Number(left) > Number(right);
    case 'gte':
      return Number(left) >= Number(right);
    case 'lt':
      return Number(left) < Number(right);
    case 'lte':
      return Number(left) <= Number(right);
    case 'contains':
      return String(left ?? '').toLowerCase().includes(String(right ?? '').toLowerCase());
    default:
      return false;
  }
}

/** Pure node executor — orchestrates intents; API layer performs side effects. */
export function executeNode(
  node: WorkflowNode,
  context: Record<string, unknown>,
  options: { requireApprovalForExternal: boolean }
): StepExecutionResult {
  switch (node.type) {
    case 'trigger':
      return {
        status: 'completed',
        output: { triggered: true, triggerType: node.data.triggerType ?? 'manual' },
      };

    case 'condition': {
      if (!node.data.condition) {
        return { status: 'failed', error: 'Condition node missing rule' };
      }
      const passed = evaluateCondition(node.data.condition, context);
      return {
        status: 'completed',
        output: { passed, rule: node.data.condition },
        nextBranch: passed ? 'true' : 'false',
      };
    }

    case 'delay': {
      const delayMinutes = node.data.delayMinutes ?? 60;
      return {
        status: 'waiting_delay',
        output: { delayMinutes },
        delayMinutes,
      };
    }

    case 'approval':
      return {
        status: 'waiting_approval',
        output: { action: node.data.action ?? 'request_approval' },
        summary: node.data.label || 'Workflow approval required',
      };

    case 'outreach':
    case 'campaign':
    case 'verification': {
      const requires =
        node.data.requiresApproval ??
        (options.requireApprovalForExternal && node.type === 'outreach');
      if (requires) {
        return {
          status: 'waiting_approval',
          output: {
            action: node.data.action,
            actionConfig: node.data.actionConfig ?? {},
            nodeType: node.type,
          },
          summary: `${node.data.label}: external action requires approval`,
        };
      }
      return {
        status: 'completed',
        output: {
          action: node.data.action,
          actionConfig: node.data.actionConfig ?? {},
          planned: true,
        },
      };
    }

    case 'ai_task':
    case 'notification':
    case 'update_status':
      return {
        status: 'completed',
        output: {
          action: node.data.action,
          actionConfig: node.data.actionConfig ?? {},
          planned: true,
        },
      };

    case 'end':
      return { status: 'completed', output: { finished: true } };

    default:
      return { status: 'failed', error: `Unsupported node type: ${node.type}` };
  }
}

export function resolveNextNodeId(
  definition: WorkflowDefinition,
  currentNodeId: string,
  branch = 'default'
): string | null {
  const edges = getOutgoingEdges(definition, currentNodeId, branch);
  if (edges.length > 0) return edges[0].target;
  const fallback = getOutgoingEdges(definition, currentNodeId, 'default');
  return fallback[0]?.target ?? null;
}

export function validateDefinition(definition: WorkflowDefinition): string[] {
  const errors: string[] = [];
  if (!definition.nodes.length) errors.push('Workflow has no nodes');
  const triggers = definition.nodes.filter((n) => n.type === 'trigger');
  if (triggers.length !== 1) errors.push('Workflow must have exactly one trigger node');
  const ends = definition.nodes.filter((n) => n.type === 'end');
  if (ends.length < 1) errors.push('Workflow must have at least one end node');

  const ids = new Set(definition.nodes.map((n) => n.id));
  for (const edge of definition.edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) {
      errors.push(`Edge ${edge.id} references missing nodes`);
    }
  }

  for (const n of definition.nodes) {
    if (n.type !== 'end' && n.type !== 'trigger') {
      const outgoing = definition.edges.filter((e) => e.source === n.id);
      if (outgoing.length === 0) errors.push(`Node "${n.data.label}" has no outgoing edge`);
    }
  }

  return errors;
}

export function getStartNodeId(definition: WorkflowDefinition): string | null {
  const trigger = definition.nodes.find((n) => n.type === 'trigger');
  return trigger?.id ?? null;
}

export function peekNode(
  definition: WorkflowDefinition,
  nodeId: string
): WorkflowNode | undefined {
  return getNode(definition, nodeId);
}

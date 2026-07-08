import type { AgentRunStatus } from '@seo-os/agent-contracts';

const VALID_TRANSITIONS: Record<AgentRunStatus, AgentRunStatus[]> = {
  pending: ['queued', 'running', 'cancelled'],
  queued: ['running', 'cancelled', 'failed'],
  running: ['completed', 'failed', 'cancelled'],
  completed: [],
  failed: [],
  cancelled: [],
};

export function canTransition(from: AgentRunStatus, to: AgentRunStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: AgentRunStatus, to: AgentRunStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid agent run transition: ${from} → ${to}`);
  }
}

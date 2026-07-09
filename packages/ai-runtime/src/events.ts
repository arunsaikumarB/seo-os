import type { AIEvent, AIEventType } from '@seo-os/shared';
import { randomUUID } from 'node:crypto';

export type AIEventHandler = (event: AIEvent) => void | Promise<void>;

export class AIEventBus {
  private handlers = new Map<AIEventType | '*', Set<AIEventHandler>>();
  private history: AIEvent[] = [];
  private maxHistory: number;

  constructor(maxHistory = 500) {
    this.maxHistory = maxHistory;
  }

  on(type: AIEventType | '*', handler: AIEventHandler): () => void {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(handler);
    return () => this.handlers.get(type)?.delete(handler);
  }

  async emit(
    type: AIEventType,
    payload: Record<string, unknown>,
    meta?: { workspaceId?: string; agentRunId?: string }
  ): Promise<AIEvent> {
    const event: AIEvent = {
      id: randomUUID(),
      type,
      workspaceId: meta?.workspaceId,
      agentRunId: meta?.agentRunId,
      payload,
      createdAt: new Date().toISOString(),
    };
    this.history.unshift(event);
    if (this.history.length > this.maxHistory) this.history.pop();

    const targets = [...(this.handlers.get(type) ?? []), ...(this.handlers.get('*') ?? [])];
    await Promise.all([...targets].map((h) => h(event)));
    return event;
  }

  getRecent(workspaceId?: string, limit = 50): AIEvent[] {
    let events = this.history;
    if (workspaceId) {
      events = events.filter((e) => e.workspaceId === workspaceId);
    }
    return events.slice(0, limit);
  }
}

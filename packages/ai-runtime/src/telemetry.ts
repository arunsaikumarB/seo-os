import type { TokenUsage } from '@seo-os/shared';

export interface UsageRecord extends TokenUsage {
  workspaceId: string;
  agentType: string;
  agentRunId: string;
  recordedAt: string;
}

export class TelemetryCollector {
  private records: UsageRecord[] = [];

  record(entry: Omit<UsageRecord, 'recordedAt' | 'totalTokens'>): UsageRecord {
    const record: UsageRecord = {
      ...entry,
      totalTokens: entry.inputTokens + entry.outputTokens,
      recordedAt: new Date().toISOString(),
    };
    this.records.push(record);
    return record;
  }

  getWorkspaceSummary(workspaceId: string): {
    totalInputTokens: number;
    totalOutputTokens: number;
    runCount: number;
  } {
    const filtered = this.records.filter((r) => r.workspaceId === workspaceId);
    return {
      totalInputTokens: filtered.reduce((s, r) => s + r.inputTokens, 0),
      totalOutputTokens: filtered.reduce((s, r) => s + r.outputTokens, 0),
      runCount: filtered.length,
    };
  }

  getRecent(limit = 20): UsageRecord[] {
    return this.records.slice(-limit).reverse();
  }
}

import {
  AGENT_DEFINITIONS,
  SPRINT2_AGENT_TYPES,
  type AgentDefinition,
  type AgentType,
} from '@seo-os/agent-contracts';

export type AgentHandler = (ctx: AgentExecutionContext) => Promise<Record<string, unknown>>;

export interface AgentExecutionContext {
  workspaceId: string;
  agentType: AgentType;
  input: Record<string, unknown>;
  runId: string;
}

export class AgentRegistry {
  private handlers = new Map<AgentType, AgentHandler>();
  private definitions = new Map<AgentType, AgentDefinition>();

  constructor() {
    for (const def of AGENT_DEFINITIONS) {
      this.definitions.set(def.agentType, def);
    }
  }

  register(agentType: AgentType, handler: AgentHandler): void {
    this.handlers.set(agentType, handler);
  }

  getDefinition(agentType: AgentType): AgentDefinition | undefined {
    return this.definitions.get(agentType);
  }

  listDefinitions(): AgentDefinition[] {
    return [...this.definitions.values()];
  }

  listSprint2Agents(): AgentDefinition[] {
    return SPRINT2_AGENT_TYPES.map((t) => this.definitions.get(t)).filter(
      (d): d is AgentDefinition => !!d
    );
  }

  getHandler(agentType: AgentType): AgentHandler | undefined {
    return this.handlers.get(agentType);
  }

  hasHandler(agentType: AgentType): boolean {
    return this.handlers.has(agentType);
  }
}

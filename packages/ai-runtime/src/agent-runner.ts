import type { AgentRunStatus, AgentType } from '@seo-os/agent-contracts';
import type { AIProviderRouter } from '@seo-os/providers';
import { assertTransition } from './lifecycle.js';
import { validateAgentOutput } from './output-validator.js';
import { PromptTemplateStore } from './prompt-templates.js';
import type { AgentRegistry } from './agent-registry.js';
import type { AIEventBus } from './events.js';
import type { TelemetryCollector } from './telemetry.js';
import { createStreamCollector } from './streaming.js';
import type { AIConfig } from './config.js';

export interface AgentRunResult {
  runId: string;
  agentType: AgentType;
  status: AgentRunStatus;
  output?: Record<string, unknown>;
  provider?: string;
  inputTokens?: number;
  outputTokens?: number;
  error?: string;
}

export interface AgentRunnerDeps {
  registry: AgentRegistry;
  providerRouter: AIProviderRouter;
  events: AIEventBus;
  telemetry: TelemetryCollector;
  prompts: PromptTemplateStore;
  config: AIConfig;
}

export class AgentRunner {
  constructor(private deps: AgentRunnerDeps) {}

  async run(params: {
    runId: string;
    workspaceId: string;
    agentType: AgentType;
    input?: Record<string, unknown>;
    useAI?: boolean;
  }): Promise<AgentRunResult> {
    const { runId, workspaceId, agentType, input = {}, useAI = false } = params;
    const def = this.deps.registry.getDefinition(agentType);
    if (!def) {
      return { runId, agentType, status: 'failed', error: `Unknown agent: ${agentType}` };
    }

    let status: AgentRunStatus = 'pending';
    let started = false;
    const transition = (to: AgentRunStatus) => {
      assertTransition(status, to);
      status = to;
    };

    try {
      transition('running');
      started = true;
      await this.deps.events.emit(
        'agent.run.started',
        { agentType, runId },
        { workspaceId, agentRunId: runId }
      );

      const handler = this.deps.registry.getHandler(agentType);
      let output: Record<string, unknown>;

      if (handler) {
        output = await handler({ workspaceId, agentType, input, runId });
      } else if (useAI) {
        const template = this.deps.prompts.get(agentType);
        const rendered = template
          ? this.deps.prompts.render(template, {
              context: JSON.stringify(input),
              task: String(input.task ?? 'Execute agent task'),
            })
          : { system: `You are the ${def.displayName}.`, user: JSON.stringify(input) };

        const stream = createStreamCollector();
        const result = await this.deps.providerRouter.completeWithFailover(
          [
            { role: 'system', content: rendered.system },
            { role: 'user', content: rendered.user },
          ],
          {
            temperature: this.deps.config.defaultTemperature,
            maxTokens: this.deps.config.defaultMaxTokens,
          }
        );

        for await (const chunk of (async function* (text: string) {
          for (let i = 0; i < text.length; i += 64) {
            yield { type: 'text' as const, content: text.slice(i, i + 64) };
          }
        })(result.text)) {
          stream.emit(chunk);
        }

        output = {
          agentType,
          summary: result.text.slice(0, 500),
          status: 'stub',
          raw: result.text,
        };

        this.deps.telemetry.record({
          workspaceId,
          agentType,
          agentRunId: runId,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          provider: result.provider,
        });
      } else {
        output = {
          agentType,
          summary: `${def.displayName} framework stub — business logic in future sprints`,
          status: 'stub',
        };
      }

      const validation = validateAgentOutput(def.outputSchemaId, output);
      if (!validation.valid) {
        throw new Error(`Output validation failed: ${validation.errors.join(', ')}`);
      }

      transition('completed');
      await this.deps.events.emit(
        'agent.run.completed',
        { agentType, runId, output },
        { workspaceId, agentRunId: runId }
      );

      return {
        runId,
        agentType,
        status: 'completed',
        output,
        provider: useAI ? this.deps.providerRouter.primary : undefined,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Agent run failed';
      if (started) {
        transition('failed');
      }
      await this.deps.events.emit(
        'agent.run.failed',
        { agentType, runId, error: message },
        { workspaceId, agentRunId: runId }
      );
      return { runId, agentType, status: 'failed', error: message };
    }
  }
}

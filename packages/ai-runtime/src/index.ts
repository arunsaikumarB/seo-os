import { AgentRegistry } from './agent-registry.js';
import { AgentRunner } from './agent-runner.js';
import { AgentOrchestrator } from './orchestrator.js';
import { AIEventBus } from './events.js';
import { TelemetryCollector } from './telemetry.js';
import { PromptTemplateStore } from './prompt-templates.js';
import { DEFAULT_AI_CONFIG } from './config.js';
import { registerSprint2Agents } from './agents/sprint2-stubs.js';
import { registerV11WorkforceAgents } from './agents/v11-workforce.js';
import { createProviderRegistry } from '@seo-os/providers';
import type { ProviderRegistryConfig } from '@seo-os/providers';

export interface AIRuntime {
  registry: AgentRegistry;
  runner: AgentRunner;
  orchestrator: AgentOrchestrator;
  events: AIEventBus;
  telemetry: TelemetryCollector;
  prompts: PromptTemplateStore;
  providers: ReturnType<typeof createProviderRegistry>;
}

export function createAIRuntime(providerConfig: ProviderRegistryConfig): AIRuntime {
  const registry = new AgentRegistry();
  registerSprint2Agents((type, handler) => registry.register(type, handler));
  registerV11WorkforceAgents((type, handler) => registry.register(type, handler));

  const providers = createProviderRegistry(providerConfig);
  const events = new AIEventBus();
  const telemetry = new TelemetryCollector();
  const prompts = new PromptTemplateStore();
  const config = DEFAULT_AI_CONFIG;

  const runner = new AgentRunner({
    registry,
    providerRouter: providers.getAIProviderRouter(),
    events,
    telemetry,
    prompts,
    config,
  });

  const orchestrator = new AgentOrchestrator(runner);

  return { registry, runner, orchestrator, events, telemetry, prompts, providers };
}

export * from './agent-registry.js';
export * from './agent-runner.js';
export * from './orchestrator.js';
export * from './lifecycle.js';
export * from './prompt-templates.js';
export * from './output-validator.js';
export * from './streaming.js';
export * from './events.js';
export * from './telemetry.js';
export * from './config.js';

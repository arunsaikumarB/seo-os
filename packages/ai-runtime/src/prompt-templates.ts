import type { AgentType } from '@seo-os/agent-contracts';

export interface PromptTemplate {
  id: string;
  agentType: AgentType;
  version: number;
  systemPrompt: string;
  userPromptTemplate: string;
}

const DEFAULT_TEMPLATES: PromptTemplate[] = [
  {
    id: 'ceo_v1',
    agentType: 'ceo',
    version: 1,
    systemPrompt: 'You are the CEO Agent for an SEO workforce platform. Provide strategic oversight.',
    userPromptTemplate: 'Workspace context: {{context}}\nTask: {{task}}',
  },
  {
    id: 'qa_v1',
    agentType: 'qa',
    version: 1,
    systemPrompt: 'You are the QA Agent. Validate agent outputs for quality and completeness.',
    userPromptTemplate: 'Review output: {{output}}',
  },
];

export class PromptTemplateStore {
  private templates: Map<string, PromptTemplate>;

  constructor(seed: PromptTemplate[] = DEFAULT_TEMPLATES) {
    this.templates = new Map(seed.map((t) => [`${t.agentType}:v${t.version}`, t]));
  }

  get(agentType: AgentType, version = 1): PromptTemplate | undefined {
    return this.templates.get(`${agentType}:v${version}`);
  }

  render(template: PromptTemplate, vars: Record<string, string>): { system: string; user: string } {
    let user = template.userPromptTemplate;
    for (const [key, value] of Object.entries(vars)) {
      user = user.replaceAll(`{{${key}}}`, value);
    }
    return { system: template.systemPrompt, user };
  }
}

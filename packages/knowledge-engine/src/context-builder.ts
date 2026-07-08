export interface WorkspaceContextInput {
  project: {
    name: string;
    domain: string;
    industry?: string | null;
    description?: string | null;
    targetAudience?: string | null;
  };
  organization: {
    name: string;
    industry?: string | null;
  };
  brandVoice: Record<string, unknown>;
  seoGoals: Record<string, unknown>;
  keywords: string[];
  competitors: Array<{ domain: string; name?: string | null }>;
  aiSettings: {
    primaryProvider: string;
    temperature: number;
    maxTokens: number;
  };
  memory: {
    brand: string[];
    project: string[];
    approvedPrompts: string[];
    conversation: string[];
    episodic: string[];
  };
  documents: Array<{ title: string; excerpt: string }>;
  retrievalContext?: string;
}

export interface BuiltContext {
  systemPrompt: string;
  contextBlock: string;
  sections: Record<string, string>;
}

export function buildWorkspaceContext(input: WorkspaceContextInput): BuiltContext {
  const sections: Record<string, string> = {};

  sections.project = [
    `Project: ${input.project.name}`,
    `Domain: ${input.project.domain}`,
    input.project.industry ? `Industry: ${input.project.industry}` : '',
    input.project.description ? `Description: ${input.project.description}` : '',
    input.project.targetAudience ? `Audience: ${input.project.targetAudience}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  sections.organization = [
    `Organization: ${input.organization.name}`,
    input.organization.industry ? `Industry: ${input.organization.industry}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  if (Object.keys(input.brandVoice).length > 0) {
    sections.brandVoice = `Brand voice: ${JSON.stringify(input.brandVoice)}`;
  }

  if (input.keywords.length > 0) {
    sections.keywords = `Target keywords: ${input.keywords.join(', ')}`;
  }

  if (input.competitors.length > 0) {
    sections.competitors = `Competitors: ${input.competitors.map((c) => c.domain).join(', ')}`;
  }

  if (input.memory.brand.length > 0) {
    sections.brandMemory = `Brand memory:\n${input.memory.brand.map((m) => `- ${m}`).join('\n')}`;
  }

  if (input.memory.project.length > 0) {
    sections.projectMemory = `Project memory:\n${input.memory.project.map((m) => `- ${m}`).join('\n')}`;
  }

  if (input.memory.approvedPrompts.length > 0) {
    sections.promptMemory = `Approved prompts:\n${input.memory.approvedPrompts.map((m) => `- ${m}`).join('\n')}`;
  }

  if (input.memory.conversation.length > 0) {
    sections.conversationMemory = `Recent context:\n${input.memory.conversation.map((m) => `- ${m}`).join('\n')}`;
  }

  if (input.documents.length > 0) {
    sections.documents = `Uploaded documents:\n${input.documents.map((d) => `- ${d.title}`).join('\n')}`;
  }

  if (input.retrievalContext) {
    sections.retrieval = `Retrieved knowledge:\n${input.retrievalContext}`;
  }

  const contextBlock = Object.entries(sections)
    .map(([key, value]) => `## ${key}\n${value}`)
    .join('\n\n');

  const systemPrompt = `You are the SEO OS AI assistant for ${input.project.name}. Use the workspace context below to answer questions. Cite sources when using retrieved knowledge. Do not invent facts not supported by context.

${contextBlock}`;

  return { systemPrompt, contextBlock, sections };
}

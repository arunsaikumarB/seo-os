import { randomUUID } from 'node:crypto';
import type { Response } from 'express';
import {
  classifyIntent,
  chunksToCitations,
  validateRetrieval,
  SUGGESTED_PROMPTS,
} from '@seo-os/knowledge-engine';
import type { AgentType } from '@seo-os/agent-contracts';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { getAIRuntime } from '../ai/runtime.js';
import { createAgentRun } from '../ai/agent.service.js';
import { buildChatContext } from '../context/workspace-context.service.js';
import { recordConversationMemory } from '../memory/memory.service.js';

export { SUGGESTED_PROMPTS };

export async function listConversations(workspaceId: string, userId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from('ai_conversations')
    .select('id, title, mode, created_at, updated_at')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function createConversation(workspaceId: string, userId: string, title?: string) {
  const id = randomUUID();
  const { data, error } = await getSupabaseAdmin()
    .from('ai_conversations')
    .insert({
      id,
      workspace_id: workspaceId,
      user_id: userId,
      title: title ?? 'New conversation',
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getConversationMessages(conversationId: string, workspaceId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from('ai_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function sendMessage(params: {
  conversationId: string;
  workspaceId: string;
  orgId: string;
  userId: string;
  content: string;
  res?: Response;
  stream?: boolean;
}) {
  const supabase = getSupabaseAdmin();
  const userMsgId = randomUUID();

  await supabase.from('ai_messages').insert({
    id: userMsgId,
    conversation_id: params.conversationId,
    workspace_id: params.workspaceId,
    role: 'user',
    content: params.content,
  });

  await supabase
    .from('ai_conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', params.conversationId);

  const intent = classifyIntent(params.content);
  const { built, retrievalChunks } = await buildChatContext(
    params.workspaceId,
    params.orgId,
    params.content
  );

  const validation = validateRetrieval(retrievalChunks);
  const citations = chunksToCitations(retrievalChunks);
  const assistantMsgId = randomUUID();

  if (intent && intent.confidence >= 0.75) {
    const agentResult = await createAgentRun({
      workspaceId: params.workspaceId,
      agentType: intent.agentType as AgentType,
      input: { task: params.content, context: built.contextBlock },
      userId: params.userId,
      async: false,
      useAI: false,
    });

    const delegationText = `Delegated to **${intent.agentType}** agent (run \`${agentResult.runId}\`).\n\nStatus: ${agentResult.status}${agentResult.output ? `\n\n${JSON.stringify(agentResult.output, null, 2)}` : ''}`;

    await supabase.from('ai_messages').insert({
      id: assistantMsgId,
      conversation_id: params.conversationId,
      workspace_id: params.workspaceId,
      role: 'assistant',
      content: delegationText,
      agent_type: intent.agentType,
      agent_run_id: agentResult.runId,
      citations,
    });

    if (params.stream && params.res) {
      streamText(params.res, delegationText, { done: { agentRunId: agentResult.runId } });
      return { streamed: true };
    }

    return {
      message: {
        id: assistantMsgId,
        content: delegationText,
        agentType: intent.agentType,
        agentRunId: agentResult.runId,
        citations,
      },
    };
  }

  const rt = getAIRuntime();
  const history = await getConversationMessages(params.conversationId, params.workspaceId);
  const messages = [
    { role: 'system', content: built.systemPrompt },
    ...history.slice(-10).map((m) => ({
      role: m.role as string,
      content: m.content as string,
    })),
    { role: 'user', content: params.content },
  ];

  let responseText: string;
  try {
    const result = await rt.providers.getAIProviderRouter().completeWithFailover(messages, {
      temperature: 0.7,
      maxTokens: 2048,
    });
    responseText = result.text;
  } catch {
    responseText = validation.valid
      ? `Based on your knowledge base:\n\n${retrievalChunks.map((c) => c.content).join('\n\n')}`
      : 'I could not reach an AI provider. Upload documents to your knowledge base or configure GEMINI_API_KEY / OLLAMA_BASE_URL.';
  }

  if (!validation.valid && retrievalChunks.length === 0) {
    responseText +=
      '\n\n_Note: No high-confidence knowledge base matches were found for this query._';
  }

  await supabase.from('ai_messages').insert({
    id: assistantMsgId,
    conversation_id: params.conversationId,
    workspace_id: params.workspaceId,
    role: 'assistant',
    content: responseText,
    citations,
  });

  await recordConversationMemory(params.workspaceId, params.userId, params.content);

  if (params.stream && params.res) {
    streamText(params.res, responseText, { done: { citations } });
    return { streamed: true };
  }

  return {
    message: {
      id: assistantMsgId,
      content: responseText,
      citations,
      validation,
    },
  };
}

function streamText(res: Response, text: string, meta?: { done?: Record<string, unknown> }): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const chunkSize = 48;
  for (let i = 0; i < text.length; i += chunkSize) {
    const chunk = text.slice(i, i + chunkSize);
    res.write(`data: ${JSON.stringify({ type: 'text', content: chunk })}\n\n`);
  }
  res.write(`data: ${JSON.stringify({ type: 'done', ...meta?.done })}\n\n`);
  res.end();
}

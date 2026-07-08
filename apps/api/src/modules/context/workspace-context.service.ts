import { getSupabaseAdmin } from '../../lib/supabase.js';
import { getProjectById } from '../projects/project.service.js';
import { listDocuments } from '../knowledge/document.service.js';
import { retrieveContext } from '../knowledge/search.service.js';
import { loadMemoryForContext } from '../memory/memory.service.js';
import { buildWorkspaceContext, buildRetrievalContext } from '@seo-os/knowledge-engine';
import { getEnv } from '../../config/env.js';

export async function buildChatContext(workspaceId: string, orgId: string, userQuery: string) {
  const supabase = getSupabaseAdmin();
  const project = await getProjectById(workspaceId, orgId);
  if (!project) throw new Error('Project not found');

  const { data: org } = await supabase
    .from('organizations')
    .select('name, industry')
    .eq('id', orgId)
    .single();

  const { data: settings } = await supabase
    .from('workspace_settings')
    .select('brand_voice, seo_goals')
    .eq('workspace_id', workspaceId)
    .single();

  const { data: aiSettings } = await supabase
    .from('ai_settings')
    .select('primary_provider, temperature, max_tokens')
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  const [{ data: keywords }, { data: competitors }, documents, memory, retrievalChunks] =
    await Promise.all([
      supabase.from('keywords').select('keyword').eq('workspace_id', workspaceId).limit(20),
      supabase.from('competitors').select('domain, name').eq('workspace_id', workspaceId).limit(10),
      listDocuments(workspaceId),
      loadMemoryForContext(workspaceId),
      retrieveContext(workspaceId, userQuery),
    ]);

  const retrievalContext = buildRetrievalContext(retrievalChunks);

  return {
    built: buildWorkspaceContext({
      project: {
        name: project.name,
        domain: project.domain,
        industry: project.industry,
        description: project.description,
        targetAudience: null,
      },
      organization: {
        name: org?.name ?? 'Organization',
        industry: org?.industry,
      },
      brandVoice: (settings?.brand_voice as Record<string, unknown>) ?? {},
      seoGoals: (settings?.seo_goals as Record<string, unknown>) ?? {},
      keywords: (keywords ?? []).map((k) => k.keyword),
      competitors: competitors ?? [],
      aiSettings: {
        primaryProvider: aiSettings?.primary_provider ?? 'gemini',
        temperature: Number(aiSettings?.temperature ?? 0.7),
        maxTokens: aiSettings?.max_tokens ?? 2048,
      },
      memory,
      documents: documents
        .filter((d) => d.status === 'ready')
        .slice(0, 10)
        .map((d) => ({ title: d.title, excerpt: `${d.chunk_count} chunks` })),
      retrievalContext,
    }),
    retrievalChunks,
    env: getEnv(),
  };
}

import { randomUUID } from 'node:crypto';
import {
  clusterKeywords,
  defaultKeywordDiscovery,
  parseKeywordsFromAiResponse,
} from '@seo-os/seo-intelligence';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { getAIRuntime } from '../ai/runtime.js';
import { logResearchEvent } from './research.service.js';
import { getEnv } from '../../config/env.js';

export async function listKeywords(workspaceId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from('keywords')
    .select('*, keyword_clusters(name, topic, primary_intent)')
    .eq('workspace_id', workspaceId)
    .order('priority_score', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function listKeywordClusters(workspaceId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from('keyword_clusters')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('priority_score', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function discoverKeywords(workspaceId: string, context: {
  domain: string;
  industry?: string;
  brandTopics?: string[];
}) {
  let candidates = defaultKeywordDiscovery(context);

  if (getEnv().GEMINI_API_KEY || getEnv().OLLAMA_BASE_URL) {
    try {
      const rt = getAIRuntime();
      const result = await rt.providers.getAIProviderRouter().completeWithFailover([
        {
          role: 'user',
          content: `Generate 15 SEO keyword phrases for ${context.domain} (${context.industry ?? 'general'}). One per line.`,
        },
      ]);
      const parsed = parseKeywordsFromAiResponse(result.text);
      if (parsed.length > 0) candidates = parsed;
    } catch {
      /* heuristic fallback */
    }
  }

  const clusters = clusterKeywords(candidates.map((c) => c.keyword));
  const clusterIdMap = new Map<string, string>();

  for (const [topic, kws] of clusters) {
    const clusterId = randomUUID();
    const avgPriority =
      candidates.filter((c) => kws.includes(c.keyword)).reduce((s, c) => s + c.priorityScore, 0) /
      kws.length;
    const primaryIntent =
      candidates.find((c) => kws.includes(c.keyword))?.intent ?? 'informational';

    await getSupabaseAdmin().from('keyword_clusters').insert({
      id: clusterId,
      workspace_id: workspaceId,
      name: topic,
      topic,
      primary_intent: primaryIntent,
      priority_score: avgPriority,
      keyword_count: kws.length,
    });
    clusterIdMap.set(topic, clusterId);
  }

  for (const c of candidates) {
    await getSupabaseAdmin().from('keywords').upsert(
      {
        id: randomUUID(),
        workspace_id: workspaceId,
        keyword: c.keyword,
        search_intent: c.intent,
        topic_group: c.topicGroup,
        cluster_id: clusterIdMap.get(c.topicGroup),
        priority_score: c.priorityScore,
        discovery_source: 'ai',
      },
      { onConflict: 'workspace_id,keyword' }
    );
  }

  await logResearchEvent(workspaceId, {
    eventType: 'keyword.discovery',
    phase: 'keyword_intelligence',
    title: `Discovered ${candidates.length} keywords in ${clusters.size} clusters`,
    payload: { keywords: candidates.length, clusters: clusters.size },
  });

  return { keywords: candidates.length, clusters: clusters.size };
}

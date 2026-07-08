import { randomUUID } from 'node:crypto';
import {
  defaultCompetitorSuggestions,
  parseCompetitorsFromAiResponse,
  scoreCompetitorConfidence,
} from '@seo-os/seo-intelligence';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { getAIRuntime } from '../ai/runtime.js';
import { logResearchEvent } from './research.service.js';
import { getEnv } from '../../config/env.js';

export async function listCompetitorSuggestions(workspaceId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from('competitor_suggestions')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('confidence_score', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function listCompetitors(workspaceId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from('competitors')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('confidence_score', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function discoverCompetitors(workspaceId: string, context: {
  domain: string;
  industry?: string;
  brandTopics?: string[];
}) {
  let suggestions = defaultCompetitorSuggestions(context);

  if (getEnv().GEMINI_API_KEY || getEnv().OLLAMA_BASE_URL) {
    try {
      const rt = getAIRuntime();
      const prompt = `List 5 SEO competitors for the website ${context.domain} in industry ${context.industry ?? 'general'}. Topics: ${context.brandTopics?.join(', ') ?? 'N/A'}. One per line with domain.`;
      const result = await rt.providers.getAIProviderRouter().completeWithFailover([
        { role: 'user', content: prompt },
      ]);
      const parsed = parseCompetitorsFromAiResponse(result.text);
      if (parsed.length > 0) suggestions = parsed;
    } catch {
      /* fallback to heuristics */
    }
  }

  const rows = suggestions.map((s) => ({
    id: randomUUID(),
    workspace_id: workspaceId,
    domain: s.domain,
    name: s.name,
    confidence_score: scoreCompetitorConfidence({
      domain: s.domain,
      industryMatch: !!context.industry,
      aiConfidence: s.confidenceScore,
    }),
    reason: s.reason,
    status: 'pending',
  }));

  for (const row of rows) {
    await getSupabaseAdmin().from('competitor_suggestions').upsert(row, {
      onConflict: 'workspace_id,domain',
    });
  }

  await logResearchEvent(workspaceId, {
    eventType: 'competitor.discovery',
    phase: 'competitor_discovery',
    title: `Discovered ${rows.length} competitor suggestions`,
    payload: { count: rows.length },
  });

  return rows;
}

export async function validateCompetitor(
  suggestionId: string,
  workspaceId: string,
  userId: string,
  action: 'validate' | 'reject'
) {
  const supabase = getSupabaseAdmin();
  const { data: suggestion } = await supabase
    .from('competitor_suggestions')
    .select('*')
    .eq('id', suggestionId)
    .eq('workspace_id', workspaceId)
    .single();

  if (!suggestion) throw new Error('Suggestion not found');

  if (action === 'validate') {
    await supabase.from('competitors').upsert(
      {
        id: randomUUID(),
        workspace_id: workspaceId,
        domain: suggestion.domain,
        name: suggestion.name,
        confidence_score: suggestion.confidence_score,
        status: 'validated',
        discovery_source: 'ai',
        profile: suggestion.metadata ?? {},
        validated_at: new Date().toISOString(),
        validated_by: userId,
      },
      { onConflict: 'workspace_id,domain' }
    );
  }

  await supabase
    .from('competitor_suggestions')
    .update({ status: action === 'validate' ? 'validated' : 'rejected' })
    .eq('id', suggestionId);

  return { action, domain: suggestion.domain };
}

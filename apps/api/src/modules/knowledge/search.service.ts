import {
  createGeminiEmbeddingProvider,
  formatEmbeddingForPg,
  TOP_K,
  MIN_SCORE,
  type RetrievalChunk,
} from '@seo-os/knowledge-engine';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { getEnv } from '../../config/env.js';

export async function searchKnowledge(
  workspaceId: string,
  query: string,
  limit = TOP_K
): Promise<RetrievalChunk[]> {
  const env = getEnv();
  const supabase = getSupabaseAdmin();

  if (env.GEMINI_API_KEY) {
    const embedder = createGeminiEmbeddingProvider(env.GEMINI_API_KEY);
    const vector = await embedder.embed(query);
    const embeddingStr = formatEmbeddingForPg(vector);

    const { data, error } = await supabase.rpc('kb_hybrid_search', {
      p_workspace_id: workspaceId,
      p_query: query,
      p_query_embedding: embeddingStr,
      p_limit: limit,
      p_min_score: 0,
    });

    if (!error && data?.length) {
      return (data as Array<Record<string, unknown>>).map((row) => ({
        chunkId: String(row.chunk_id),
        documentId: String(row.document_id),
        content: String(row.content),
        score: Number(row.score),
        documentTitle: String(row.document_title),
      }));
    }
  }

  const { data: textResults } = await supabase
    .from('kb_chunks')
    .select('id, document_id, content, kb_documents!inner(title, status)')
    .eq('workspace_id', workspaceId)
    .eq('kb_documents.status', 'ready')
    .textSearch('search_vector', query, { type: 'plain', config: 'english' })
    .limit(limit);

  return (textResults ?? []).map((row) => {
    const doc = row.kb_documents as unknown as { title: string } | { title: string }[];
    const title = Array.isArray(doc) ? doc[0]?.title : doc?.title;
    return {
      chunkId: row.id,
      documentId: row.document_id,
      content: row.content,
      score: 0.5,
      documentTitle: title ?? 'Document',
    };
  });
}

export async function retrieveContext(workspaceId: string, query: string) {
  const chunks = await searchKnowledge(workspaceId, query);
  const filtered = chunks.filter((c) => c.score >= MIN_SCORE || chunks.length <= 2);
  return filtered.length > 0 ? filtered : chunks.slice(0, TOP_K);
}

import { randomUUID } from 'node:crypto';
import { chunkText } from '@seo-os/knowledge-engine';
import {
  createGeminiEmbeddingProvider,
  formatEmbeddingForPg,
} from '@seo-os/knowledge-engine';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { getEnv } from '../../config/env.js';
import { logger } from '../../lib/logger.js';

export async function ingestDocument(documentId: string, workspaceId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const env = getEnv();

  const { data: doc, error: docError } = await supabase
    .from('kb_documents')
    .select('*')
    .eq('id', documentId)
    .eq('workspace_id', workspaceId)
    .single();

  if (docError || !doc?.content_text) {
    throw new Error('Document not found or has no content');
  }

  await supabase
    .from('kb_documents')
    .update({ status: 'processing' })
    .eq('id', documentId);

  const jobId = randomUUID();
  await supabase.from('kb_ingestion_jobs').insert({
    id: jobId,
    document_id: documentId,
    workspace_id: workspaceId,
    status: 'running',
    started_at: new Date().toISOString(),
  });

  try {
    await supabase.from('kb_chunks').delete().eq('document_id', documentId);

    const chunks = chunkText(doc.content_text);
    const chunkRows = chunks.map((c) => ({
      id: randomUUID(),
      document_id: documentId,
      workspace_id: workspaceId,
      chunk_index: c.index,
      content: c.content,
      token_count: c.tokenCount,
    }));

    if (chunkRows.length > 0) {
      const { error: chunkError } = await supabase.from('kb_chunks').insert(chunkRows);
      if (chunkError) throw chunkError;
    }

    if (env.GEMINI_API_KEY && chunkRows.length > 0) {
      const embedder = createGeminiEmbeddingProvider(env.GEMINI_API_KEY);
      const vectors = await embedder.embedBatch(chunkRows.map((c) => c.content));

      const embeddingRows = chunkRows.map((c, i) => ({
        id: randomUUID(),
        chunk_id: c.id,
        workspace_id: workspaceId,
        embedding: formatEmbeddingForPg(vectors[i] ?? []),
        model: 'text-embedding-004',
      }));

      for (const row of embeddingRows) {
        const { error } = await supabase.from('kb_embeddings').insert(row);
        if (error) {
          logger.warn({ error, chunkId: row.chunk_id }, 'Embedding insert failed — using text search only');
        }
      }
    }

    await supabase
      .from('kb_documents')
      .update({
        status: 'ready',
        chunk_count: chunks.length,
        error: null,
      })
      .eq('id', documentId);

    await supabase
      .from('kb_ingestion_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Ingestion failed';
    await supabase
      .from('kb_documents')
      .update({ status: 'failed', error: message })
      .eq('id', documentId);
    await supabase
      .from('kb_ingestion_jobs')
      .update({
        status: 'failed',
        error: message,
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId);
    throw err;
  }
}

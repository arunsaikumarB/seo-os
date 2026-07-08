import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { ingestDocument } from './ingestion.service.js';
import { enqueueJob, QUEUES } from '../../jobs/boss.js';
import { getEnv } from '../../config/env.js';

const MAX_DOC_BYTES = 25 * 1024 * 1024;
const MAX_DOCS_PER_PROJECT = 100;

export async function listDocuments(workspaceId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from('kb_documents')
    .select('id, title, filename, mime_type, status, byte_size, chunk_count, created_at, updated_at')
    .eq('workspace_id', workspaceId)
    .neq('status', 'archived')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getDocument(documentId: string, workspaceId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from('kb_documents')
    .select('*')
    .eq('id', documentId)
    .eq('workspace_id', workspaceId)
    .single();

  if (error) return null;
  return data;
}

export async function uploadDocument(
  workspaceId: string,
  userId: string,
  input: { title: string; content: string; filename?: string; mimeType: string }
) {
  const byteSize = Buffer.byteLength(input.content, 'utf8');
  if (byteSize > MAX_DOC_BYTES) {
    throw new Error(`Document exceeds maximum size of ${MAX_DOC_BYTES} bytes`);
  }

  const { count } = await getSupabaseAdmin()
    .from('kb_documents')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .neq('status', 'archived');

  if ((count ?? 0) >= MAX_DOCS_PER_PROJECT) {
    throw new Error(`Maximum ${MAX_DOCS_PER_PROJECT} documents per project`);
  }

  const id = randomUUID();
  const { data, error } = await getSupabaseAdmin()
    .from('kb_documents')
    .insert({
      id,
      workspace_id: workspaceId,
      title: input.title,
      filename: input.filename ?? `${input.title}.txt`,
      mime_type: input.mimeType,
      content_text: input.content,
      byte_size: byteSize,
      status: 'pending',
      created_by: userId,
    })
    .select()
    .single();

  if (error) throw error;

  if (getEnv().ENABLE_WORKERS) {
    await enqueueJob(QUEUES.INGEST, 'kb.ingest', { documentId: id, workspaceId });
  } else {
    await ingestDocument(id, workspaceId);
  }

  return data;
}

export async function deleteDocument(documentId: string, workspaceId: string) {
  const { error } = await getSupabaseAdmin()
    .from('kb_documents')
    .update({ status: 'archived' })
    .eq('id', documentId)
    .eq('workspace_id', workspaceId);

  if (error) throw error;
  return { archived: true };
}

export async function reingestDocument(documentId: string, workspaceId: string) {
  if (getEnv().ENABLE_WORKERS) {
    await enqueueJob(QUEUES.INGEST, 'kb.ingest', { documentId, workspaceId });
    return { queued: true };
  }
  await ingestDocument(documentId, workspaceId);
  return { queued: false, completed: true };
}

export async function getKnowledgeStats(workspaceId: string) {
  const supabase = getSupabaseAdmin();
  const [docs, chunks, jobs] = await Promise.all([
    supabase
      .from('kb_documents')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('status', 'ready'),
    supabase
      .from('kb_chunks')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId),
    supabase
      .from('kb_ingestion_jobs')
      .select('status')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  return {
    readyDocuments: docs.count ?? 0,
    totalChunks: chunks.count ?? 0,
    recentJobs: jobs.data ?? [],
  };
}

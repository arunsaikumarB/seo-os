import type { RetrievalChunk } from './retrieval.js';

export interface Citation {
  index: number;
  chunkId: string;
  documentId: string;
  documentTitle: string;
  score: number;
  excerpt: string;
}

export function chunksToCitations(chunks: RetrievalChunk[]): Citation[] {
  return chunks.map((c, i) => ({
    index: i + 1,
    chunkId: c.chunkId,
    documentId: c.documentId,
    documentTitle: c.documentTitle,
    score: c.score,
    excerpt: c.content.slice(0, 200),
  }));
}

export function formatCitationsForPrompt(citations: Citation[]): string {
  if (citations.length === 0) return 'No sources cited.';
  return citations
    .map((c) => `[${c.index}] ${c.documentTitle} — "${c.excerpt}..."`)
    .join('\n');
}

export interface RetrievalChunk {
  chunkId: string;
  documentId: string;
  content: string;
  score: number;
  documentTitle: string;
}

export interface RetrievalResult {
  chunks: RetrievalChunk[];
  query: string;
  validated: boolean;
  validationNotes: string[];
}

const MIN_SCORE = 0.7;
const TOP_K = 5;

export function validateRetrieval(chunks: RetrievalChunk[]): {
  valid: boolean;
  notes: string[];
} {
  const notes: string[] = [];
  if (chunks.length === 0) {
    notes.push('No relevant chunks found');
    return { valid: false, notes };
  }

  const aboveThreshold = chunks.filter((c) => c.score >= MIN_SCORE);
  if (aboveThreshold.length === 0) {
    notes.push(`No chunks above minimum score ${MIN_SCORE}`);
    return { valid: false, notes };
  }

  notes.push(`${aboveThreshold.length} chunks passed retrieval validation`);
  return { valid: true, notes };
}

export function buildRetrievalContext(chunks: RetrievalChunk[]): string {
  return chunks
    .map(
      (c, i) => `[Source ${i + 1}: ${c.documentTitle} (score: ${c.score.toFixed(2)})]\n${c.content}`
    )
    .join('\n\n---\n\n');
}

export { MIN_SCORE, TOP_K };

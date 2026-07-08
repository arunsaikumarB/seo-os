/** Frozen: 800 tokens, 100 overlap — approximated as 3200 chars / 400 overlap */
export const CHUNK_SIZE_CHARS = 3200;
export const CHUNK_OVERLAP_CHARS = 400;

export interface TextChunk {
  index: number;
  content: string;
  tokenCount: number;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function chunkText(text: string): TextChunk[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const chunks: TextChunk[] = [];
  let start = 0;
  let index = 0;

  while (start < normalized.length) {
    const end = Math.min(start + CHUNK_SIZE_CHARS, normalized.length);
    const content = normalized.slice(start, end).trim();
    if (content) {
      chunks.push({ index, content, tokenCount: estimateTokens(content) });
      index += 1;
    }
    if (end >= normalized.length) break;
    start = end - CHUNK_OVERLAP_CHARS;
    if (start < 0) start = 0;
  }

  return chunks;
}

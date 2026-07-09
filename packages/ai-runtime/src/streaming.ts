export interface StreamChunk {
  type: 'text' | 'metadata' | 'done' | 'error';
  content?: string;
  metadata?: Record<string, unknown>;
  error?: string;
}

export type StreamEmitter = (chunk: StreamChunk) => void;

/** Sprint 2 streaming foundation — wraps provider text into chunks */
export async function* streamFromText(text: string, chunkSize = 64): AsyncGenerator<StreamChunk> {
  for (let i = 0; i < text.length; i += chunkSize) {
    yield { type: 'text', content: text.slice(i, i + chunkSize) };
  }
  yield { type: 'done' };
}

export function createStreamCollector(): {
  chunks: StreamChunk[];
  emit: StreamEmitter;
  getText: () => string;
} {
  const chunks: StreamChunk[] = [];
  return {
    chunks,
    emit(chunk) {
      chunks.push(chunk);
    },
    getText() {
      return chunks
        .filter((c) => c.type === 'text')
        .map((c) => c.content ?? '')
        .join('');
    },
  };
}

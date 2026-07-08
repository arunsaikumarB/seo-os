const EMBEDDING_MODEL = 'text-embedding-004';
const EMBEDDING_DIM = 768;

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

export function createGeminiEmbeddingProvider(apiKey: string): EmbeddingProvider {
  return {
    async embed(text) {
      const results = await this.embedBatch([text]);
      return results[0] ?? [];
    },

    async embedBatch(texts) {
      const results: number[][] = [];
      const batchSize = 20;

      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map(async (text) => {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${apiKey}`;
            const res = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model: `models/${EMBEDDING_MODEL}`,
                content: { parts: [{ text }] },
              }),
              signal: AbortSignal.timeout(30_000),
            });

            if (!res.ok) {
              const err = await res.text();
              throw new Error(`Embedding API error ${res.status}: ${err.slice(0, 200)}`);
            }

            const data = (await res.json()) as {
              embedding?: { values?: number[] };
            };
            const values = data.embedding?.values ?? [];
            return truncateToDim(values, EMBEDDING_DIM);
          })
        );
        results.push(...batchResults);
      }

      return results;
    },
  };
}

function truncateToDim(values: number[], dim: number): number[] {
  if (values.length === dim) return values;
  if (values.length > dim) return values.slice(0, dim);
  return [...values, ...new Array(dim - values.length).fill(0)];
}

export function formatEmbeddingForPg(vector: number[]): string {
  return `[${vector.join(',')}]`;
}

export { EMBEDDING_MODEL, EMBEDDING_DIM };

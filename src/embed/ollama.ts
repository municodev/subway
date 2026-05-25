/**
 * Ollama embedding provider.
 *
 * Uses the Ollama native API: POST /api/embeddings
 * No API key required. Runs locally.
 *
 * Supports concurrent requests via a simple pool.
 */
import type { EmbedConfig } from './config.js';

export class OllamaProvider {
  readonly name = 'ollama';
  private baseUrl: string;
  private model: string;
  private concurrency: number;
  private pool: number;

  constructor(config: EmbedConfig) {
    this.baseUrl = config.baseUrl ?? 'http://localhost:11434';
    this.model = config.model ?? 'nomic-embed-text:latest';
    this.concurrency = config.concurrency ?? 4;
    this.pool = 0;
  }

  /** Check if Ollama is reachable and the model is available */
  async isAvailable(): Promise<boolean> {
    try {
      const r = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!r.ok) return false;

      const data = (await r.json()) as { models?: Array<{ name: string }> };
      const models = data.models ?? [];

      // Check if the requested model (or a prefix match) is pulled
      const modelBase = this.model.replace(/:latest$/, '');
      return models.some(
        m => m.name === this.model || m.name.startsWith(modelBase)
      );
    } catch {
      return false;
    }
  }

  /** Generate embeddings for a list of texts */
  async embed(texts: string[]): Promise<number[][]> {
    const results: number[][] = new Array(texts.length);

    // Process with concurrency limit
    let idx = 0;
    const workers: Promise<void>[] = [];

    const worker = async () => {
      while (idx < texts.length) {
        const i = idx++;
        if (i >= texts.length) break;

        const prompt = texts[i];
        try {
          const r = await fetch(`${this.baseUrl}/api/embeddings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: this.model, prompt }),
            signal: AbortSignal.timeout(30000),
          });

          if (!r.ok) {
            const err = await r.text();
            throw new Error(`Ollama API error ${r.status}: ${err}`);
          }

          const data = (await r.json()) as { embedding: number[] };
          results[i] = data.embedding;
        } catch (err) {
          console.warn(`  ⚠  Embedding failed for text #${i}: ${err instanceof Error ? err.message : String(err)}`);
          results[i] = []; // empty = failed
        }
      }
    };

    // Start concurrent workers
    for (let w = 0; w < this.concurrency; w++) {
      workers.push(worker());
    }

    await Promise.all(workers);

    // Filter out failed embeddings
    const valid = results.filter(e => e.length > 0);
    if (valid.length === 0) {
      throw new Error('All embedding requests failed');
    }

    return results;
  }
}

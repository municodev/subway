/**
 * OpenAI-compatible embedding provider.
 *
 * Uses the OpenAI API standard: POST /v1/embeddings
 * Compatible with:
 *   - OpenAI (api.openai.com)
 *   - Azure OpenAI (*.openai.azure.com)
 *   - Together AI (api.together.xyz)
 *   - Anyscale (api.endpoints.anyscale.com)
 *   - Local LLM Studio / LocalAI
 *   - Ollama with OpenAI-compatible endpoint
 *
 * Supports batching: up to 2048 texts per request (OpenAI limit),
 * configurable via config.batchSize.
 */
import type { EmbedConfig } from './config.js';

export class OpenAIProvider {
  readonly name = 'openai';
  private baseUrl: string;
  private model: string;
  private apiKey: string;
  private batchSize: number;

  constructor(config: EmbedConfig) {
    this.baseUrl = config.baseUrl ?? 'https://api.openai.com';
    this.model = config.model ?? 'text-embedding-3-small';
    this.apiKey = config.apiKey ?? process.env.OPENAI_API_KEY ?? '';
    this.batchSize = Math.min(config.batchSize ?? 100, 2048);
  }

  /** Check if the API is reachable and configured */
  async isAvailable(): Promise<boolean> {
    if (!this.apiKey) return false;
    try {
      const r = await fetch(`${this.baseUrl}/v1/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(5000),
      });
      return r.ok;
    } catch {
      return false;
    }
  }

  /** Generate embeddings for a list of texts, using batch requests */
  async embed(texts: string[]): Promise<number[][]> {
    if (!this.apiKey) {
      throw new Error(
        'OpenAI API key required.\n' +
        '  Set SUBWAY_EMBED_API_KEY or OPENAI_API_KEY environment variable.\n' +
        '  Or pass --embed-api-key on the command line.'
      );
    }

    const allResults: number[][] = new Array(texts.length);

    // Process in batches
    for (let start = 0; start < texts.length; start += this.batchSize) {
      const batch = texts.slice(start, start + this.batchSize);

      try {
        const r = await fetch(`${this.baseUrl}/v1/embeddings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: this.model,
            input: batch,
            encoding_format: 'float',
          }),
          signal: AbortSignal.timeout(60000),
        });

        if (!r.ok) {
          const err = await r.text();
          let errMsg = `OpenAI API error ${r.status}: ${err}`;
          if (r.status === 401) {
            errMsg = 'Invalid API key. Set SUBWAY_EMBED_API_KEY or OPENAI_API_KEY.';
          } else if (r.status === 429) {
            errMsg = 'Rate limited. Reduce batch size or wait.';
          }
          throw new Error(errMsg);
        }

        const data = (await r.json()) as {
          data: Array<{ embedding: number[]; index: number }>;
          usage?: { total_tokens: number };
        };

        // Map results back by index
        for (const item of data.data) {
          allResults[start + item.index] = item.embedding;
        }
      } catch (err) {
        if (err instanceof Error && err.message.includes('API error')) throw err;
        throw new Error(
          `Embedding request failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    return allResults;
  }
}

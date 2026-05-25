import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';

/**
 * Embedding provider types and configuration.
 *
 * Supports:
 * - Ollama (local, no API key): POST /api/embeddings
 * - OpenAI-compatible (remote, API key required): POST /v1/embeddings
 *
 * Configuration precedence: CLI flags > env vars > .env file > defaults
 */

export type EmbedProvider = 'ollama' | 'openai';

export interface EmbedConfig {
  /** Provider: "ollama" or "openai" */
  provider: EmbedProvider;
  /** Model name (e.g., "nomic-embed-text" for Ollama, "text-embedding-3-small" for OpenAI) */
  model: string;
  /** API key (required for OpenAI, ignored for Ollama) */
  apiKey?: string;
  /** Base URL override (e.g., "https://api.openai.com" or "http://localhost:11434") */
  baseUrl?: string;
  /** Concurrency for Ollama (parallel requests) */
  concurrency?: number;
  /** Batch size for OpenAI (texts per request) */
  batchSize?: number;
}

export interface EmbeddingResult {
  /** Station ID → embedding vector */
  embeddings: Map<string, number[]>;
  /** Model used for generation */
  model: string;
  /** Total tokens consumed */
  tokensUsed?: number;
}

/** Provider interface all embed providers must implement */
export interface EmbedProviderImpl {
  /** Generate embeddings for a list of texts */
  embed(texts: string[]): Promise<number[][]>;
  /** Provider name */
  readonly name: string;
  /** Whether this provider is available */
  isAvailable(): Promise<boolean>;
}

/** Build the text corpus for a station */
export function buildStationCorpus(
  label: string,
  description: string,
  world: string,
  files: string[],
): string {
  return [
    `Component: ${label}`,
    `Description: ${description}`,
    `Domain: ${world}`,
    `Files: ${files.join(', ')}`,
  ].join('\n');
}

/** Default models per provider */
export const DEFAULT_MODELS: Record<EmbedProvider, string> = {
  ollama: 'nomic-embed-text:latest',
  openai: 'text-embedding-3-small',
};

/** Default base URLs */
export const DEFAULT_BASE_URLS: Record<EmbedProvider, string> = {
  ollama: 'http://localhost:11434',
  openai: 'https://api.openai.com',
};

/**
 * Resolve embedding configuration from CLI options, env vars, and defaults.
 */
export function resolveEmbedConfig(
  cliOptions: Partial<EmbedConfig> = {},
): EmbedConfig {
  // Load .env file if present
  try {
    const dotenvPath = resolvePath(process.cwd(), '.env');
    const dotenvContent = readFileSync(dotenvPath, 'utf-8');
    for (const line of dotenvContent.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          const value = trimmed.slice(eqIdx + 1).trim();
          if (!process.env[key]) {
            process.env[key] = value;
          }
        }
      }
    }
  } catch {
    // No .env file — fine
  }

  // Resolve config with precedence: CLI > env > defaults
  const provider: EmbedProvider =
    cliOptions.provider ??
    (process.env.SUBWAY_EMBED_PROVIDER as EmbedProvider) ??
    'ollama';

  const model =
    cliOptions.model ??
    process.env.SUBWAY_EMBED_MODEL ??
    DEFAULT_MODELS[provider];

  const apiKey =
    cliOptions.apiKey ??
    process.env.SUBWAY_EMBED_API_KEY ??
    process.env.OPENAI_API_KEY;

  const baseUrl =
    cliOptions.baseUrl ??
    process.env.SUBWAY_EMBED_BASE_URL ??
    DEFAULT_BASE_URLS[provider];

  const concurrency = cliOptions.concurrency ?? 4;
  const batchSize = cliOptions.batchSize ?? 100;

  return { provider, model, apiKey, baseUrl, concurrency, batchSize };
}

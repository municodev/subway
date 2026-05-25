/**
 * EMBED phase orchestrator.
 *
 * 1. Resolve provider configuration (CLI > env > defaults)
 * 2. Build text corpus for each station
 * 3. Generate embeddings via chosen provider
 * 4. Store embeddings in station objects and vector index
 */
import type { Station, Synapse } from '../types/index.js';
import {
  type EmbedConfig,
  type EmbeddingResult,
  resolveEmbedConfig,
  buildStationCorpus,
} from './config.js';
import { OllamaProvider } from './ollama.js';
import { OpenAIProvider } from './openai.js';
import { VectorStore } from './vector-store.js';

export interface EmbedReport {
  stationsProcessed: number;
  embeddingsGenerated: number;
  model: string;
  provider: string;
  dimension: number;
  failures: number;
}

/**
 * Generate embeddings for all stations.
 */
export async function runEmbed(
  stations: Station[],
  synapses: Synapse[],
  cliOptions: Partial<EmbedConfig> = {},
): Promise<EmbedReport> {
  const config = resolveEmbedConfig(cliOptions);

  console.log(`  🧠  Phase 3: EMBED — Semantic embeddings`);
  console.log(`      Provider: ${config.provider}`);
  console.log(`      Model:    ${config.model}`);
  if (config.baseUrl) {
    console.log(`      URL:      ${config.baseUrl}`);
  }
  console.log('');

  // Initialize provider
  let provider: OllamaProvider | OpenAIProvider;

  switch (config.provider) {
    case 'ollama':
      provider = new OllamaProvider(config);
      break;
    case 'openai':
      provider = new OpenAIProvider(config);
      break;
    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }

  // Check availability
  const available = await provider.isAvailable();
  if (!available) {
    throw new Error(
      `${config.provider.toUpperCase()} is not available.\n` +
      (config.provider === 'ollama'
        ? '  • Install Ollama: https://ollama.com/download\n' +
          '  • Pull the embedding model: ollama pull nomic-embed-text\n' +
          '  • Or switch to OpenAI: subway init --embed --embed-provider openai --embed-api-key sk-...'
        : '  • Check your API key (SUBWAY_EMBED_API_KEY or OPENAI_API_KEY)\n' +
          '  • Check network connectivity to ' + (config.baseUrl || 'api.openai.com') + '\n' +
          '  • Or switch to Ollama: subway init --embed --embed-provider ollama')
    );
  }

  // Build corpus for each station
  const stationCorpuses: Array<{ id: string; text: string }> = [];
  for (const station of stations) {
    const text = buildStationCorpus(
      station.label,
      station.description,
      station.world,
      station.files,
    );
    stationCorpuses.push({ id: station.id, text });
  }

  console.log(`      Embedding ${stationCorpuses.length} stations...`);

  // Generate embeddings
  const texts = stationCorpuses.map(c => c.text);
  let allEmbeddings: number[][];

  try {
    allEmbeddings = await provider.embed(texts);
  } catch (err) {
    throw new Error(
      `Embedding generation failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Write embeddings back to stations
  const vectorStore = new VectorStore();
  let successCount = 0;
  let failureCount = 0;
  let dimension = 0;

  for (let i = 0; i < stationCorpuses.length; i++) {
    const vec = allEmbeddings[i];
    if (vec && vec.length > 0) {
      stations[i].embedding = vec;
      vectorStore.upsert(stations[i].id, vec);
      successCount++;
      if (dimension === 0) dimension = vec.length;
    } else {
      failureCount++;
    }
  }

  return {
    stationsProcessed: stations.length,
    embeddingsGenerated: successCount,
    model: config.model,
    provider: config.provider,
    dimension,
    failures: failureCount,
  };
}

/** Re-export for convenience */
export { VectorStore } from './vector-store.js';
export { resolveEmbedConfig, buildStationCorpus } from './config.js';
export type { EmbedConfig, EmbedProvider, EmbeddingResult } from './config.js';

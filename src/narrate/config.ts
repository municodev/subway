/**
 * LLM Narration configuration.
 *
 * Same pattern as embed/config.ts:
 * - CLI flags > env vars > .env file > defaults
 * - Supports Ollama (local) and OpenAI-compatible (remote)
 * - Entirely optional — subway works without narration
 */
import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';

export type NarrateProvider = 'ollama' | 'openai';

export interface NarrateConfig {
  provider: NarrateProvider;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  /** Max tokens for each generation */
  maxTokens?: number;
  /** Temperature (0 = deterministic) */
  temperature?: number;
}

export const NARRATE_DEFAULTS: Record<NarrateProvider, string> = {
  ollama: 'llama3.2:latest',
  openai: 'gpt-4o-mini',
};

export const NARRATE_BASE_URLS: Record<NarrateProvider, string> = {
  ollama: 'http://localhost:11434',
  openai: 'https://api.openai.com',
};

/**
 * Resolve narration configuration with precedence:
 * CLI > SUBWAY_NARRATE_* env vars > .env file > defaults
 */
export function resolveNarrateConfig(
  cliOptions: Partial<NarrateConfig> = {},
): NarrateConfig {
  // Load .env if present
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
          if (!process.env[key]) process.env[key] = value;
        }
      }
    }
  } catch { /* no .env */ }

  const provider: NarrateProvider =
    cliOptions.provider ??
    (process.env.SUBWAY_NARRATE_PROVIDER as NarrateProvider) ??
    'ollama';

  const model =
    cliOptions.model ??
    process.env.SUBWAY_NARRATE_MODEL ??
    NARRATE_DEFAULTS[provider];

  const apiKey =
    cliOptions.apiKey ??
    process.env.SUBWAY_NARRATE_API_KEY ??
    process.env.OPENAI_API_KEY;

  const baseUrl =
    cliOptions.baseUrl ??
    process.env.SUBWAY_NARRATE_BASE_URL ??
    NARRATE_BASE_URLS[provider];

  return {
    provider,
    model,
    apiKey,
    baseUrl,
    maxTokens: cliOptions.maxTokens ?? 512,
    temperature: cliOptions.temperature ?? 0.3,
  };
}

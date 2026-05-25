/**
 * LLM Provider for narration (chat completions).
 *
 * Supports:
 * - Ollama: POST /api/chat  (native format)
 * - OpenAI-compatible: POST /v1/chat/completions
 */
import type { NarrateConfig } from './config.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMProvider {
  readonly name: string;
  /** Check if provider is available */
  isAvailable(): Promise<boolean>;
  /** Generate a chat completion. Returns the text response. */
  chat(messages: ChatMessage[], jsonMode?: boolean): Promise<string>;
}

/** Create the appropriate LLM provider for the config */
export function createLLMProvider(config: NarrateConfig): LLMProvider {
  switch (config.provider) {
    case 'ollama':
      return new OllamaChatProvider(config);
    case 'openai':
      return new OpenAIChatProvider(config);
    default:
      throw new Error(`Unknown narrator provider: ${config.provider}`);
  }
}

// ---- Ollama chat provider ----

class OllamaChatProvider implements LLMProvider {
  readonly name = 'ollama';
  private baseUrl: string;
  private model: string;

  constructor(config: NarrateConfig) {
    this.baseUrl = config.baseUrl ?? 'http://localhost:11434';
    this.model = config.model ?? 'llama3.2:latest';
  }

  async isAvailable(): Promise<boolean> {
    try {
      const r = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!r.ok) return false;
      const data = (await r.json()) as { models?: Array<{ name: string }> };
      const modelBase = this.model.replace(/:latest$/, '');
      return (data.models ?? []).some(
        m => m.name === this.model || m.name.startsWith(modelBase),
      );
    } catch {
      return false;
    }
  }

  async chat(messages: ChatMessage[], jsonMode = false): Promise<string> {
    // Build system + user into Ollama format
    const systemMsg = messages.find(m => m.role === 'system')?.content ?? '';
    const userMsgs = messages.filter(m => m.role !== 'system');

    const prompt = systemMsg
      ? `${systemMsg}\n\n${userMsgs.map(m => m.content).join('\n\n')}`
      : userMsgs.map(m => m.content).join('\n\n');

    const body: Record<string, unknown> = {
      model: this.model,
      prompt,
      stream: false,
      options: { temperature: 0.3, num_predict: 1024 },
    };

    if (jsonMode) {
      body.format = 'json';
    }

    const r = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    });

    if (!r.ok) {
      const err = await r.text();
      throw new Error(`Ollama chat error ${r.status}: ${err}`);
    }

    const data = (await r.json()) as { response: string };
    return data.response;
  }
}

// ---- OpenAI chat provider ----

class OpenAIChatProvider implements LLMProvider {
  readonly name = 'openai';
  private baseUrl: string;
  private model: string;
  private apiKey: string;

  constructor(config: NarrateConfig) {
    this.baseUrl = config.baseUrl ?? 'https://api.openai.com';
    this.model = config.model ?? 'gpt-4o-mini';
    this.apiKey = config.apiKey ?? process.env.OPENAI_API_KEY ?? '';
  }

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

  async chat(messages: ChatMessage[], jsonMode = false): Promise<string> {
    if (!this.apiKey) {
      throw new Error(
        'OpenAI API key required.\n' +
        '  Set SUBWAY_NARRATE_API_KEY or OPENAI_API_KEY environment variable.'
      );
    }

    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      temperature: 0.3,
      max_tokens: 512,
    };

    if (jsonMode) {
      body.response_format = { type: 'json_object' };
    }

    const r = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    });

    if (!r.ok) {
      const err = await r.text();
      let msg = `OpenAI chat error ${r.status}: ${err}`;
      if (r.status === 401) msg = 'Invalid API key. Set SUBWAY_NARRATE_API_KEY or OPENAI_API_KEY.';
      throw new Error(msg);
    }

    const data = (await r.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    return data.choices[0]?.message?.content ?? '';
  }
}

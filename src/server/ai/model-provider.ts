import { createOpenAI } from '@ai-sdk/openai';

const PLACEHOLDER_TOKENS = ['your', 'here'];
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';

export interface AiModelConfig {
  apiKey: string;
  modelId: string;
  baseURL?: string;
  providerName: string;
  headers?: Record<string, string>;
}

function isPlaceholderValue(value: string) {
  const normalized = value.trim().toLowerCase();
  return PLACEHOLDER_TOKENS.some((token) => normalized.includes(token));
}

function readFirstNonEmptyEnv(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }

  return '';
}

function parseHeadersJson(raw: string) {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return undefined;
    }

    const headers = Object.fromEntries(
      Object.entries(parsed).flatMap(([key, value]) =>
        typeof value === 'string' && value.trim()
          ? [[key, value]]
          : [],
      ),
    );

    return Object.keys(headers).length > 0 ? headers : undefined;
  } catch {
    return undefined;
  }
}

export function resolveAiModelConfig(): AiModelConfig | null {
  const apiKey = readFirstNonEmptyEnv('AI_API_KEY', 'OPENAI_API_KEY');
  if (!apiKey || isPlaceholderValue(apiKey)) {
    return null;
  }

  const modelId = readFirstNonEmptyEnv('AI_MODEL', 'OPENAI_MODEL') || DEFAULT_OPENAI_MODEL;
  const baseURL = readFirstNonEmptyEnv('AI_BASE_URL', 'OPENAI_BASE_URL') || undefined;
  const providerName =
    readFirstNonEmptyEnv('AI_PROVIDER_NAME') || (baseURL ? 'openai-compatible' : 'openai');
  const headersJson = readFirstNonEmptyEnv('AI_HEADERS_JSON');
  const headers = headersJson ? parseHeadersJson(headersJson) : undefined;

  return {
    apiKey,
    modelId,
    baseURL,
    providerName,
    headers,
  };
}

export function hasUsableAiLanguageModel() {
  return resolveAiModelConfig() !== null;
}

export function getAiLanguageModel() {
  const config = resolveAiModelConfig();
  if (!config) {
    return null;
  }

  const provider = createOpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    headers: config.headers,
    name: config.providerName,
  });

  return provider(config.modelId);
}

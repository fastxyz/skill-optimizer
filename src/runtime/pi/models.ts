import type { Model } from '@mariozechner/pi-ai';
import { getModel } from '@mariozechner/pi-ai';
import { ModelRegistry } from '@mariozechner/pi-coding-agent';

import { createPiAuthStorage, resolveApiCredential } from './auth.js';
import { parseModelRef } from '../../project/types.js';

export interface ResolvedPiModelRequest {
  model: Model<any>;
  authStorage: ReturnType<typeof createPiAuthStorage>;
  modelRegistry: ReturnType<typeof ModelRegistry.create>;
  auth: {
    apiKey?: string;
    headers?: Record<string, string>;
  };
}

export async function resolvePiModelByRef(
  modelRef: string,
  options?: { authMode?: import('./auth.js').PiAuthMode; apiKeyEnv?: string; apiKeyOverride?: string },
): Promise<ResolvedPiModelRequest> {
  const { provider, model } = parseModelRef(modelRef);
  return resolvePiModel(provider, model, options);
}

/**
 * Synthesizes a Model entry for OpenRouter models that are not pre-registered in pi-ai.
 * OpenRouter exposes an OpenAI-compatible completions API, so any model routed through
 * it can use the "openai-completions" api type with openrouter.ai/api/v1 as the base URL.
 * The model ID passed to OpenRouter is the portion after "openrouter/" in the full ref.
 */
function synthesizeOpenRouterModel(provider: string, modelName: string): Model<any> | undefined {
  if (provider !== 'openrouter') return undefined;
  return {
    id: modelName,
    name: modelName,
    api: 'openai-completions' as const,
    provider: 'openrouter' as const,
    baseUrl: 'https://openrouter.ai/api/v1',
    reasoning: false,
    input: ['text'] as ('text' | 'image')[],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 16384,
  };
}

function synthesizeOpenAICodexModel(provider: string, modelName: string): Model<any> | undefined {
  if (provider !== 'openai-codex') return undefined;
  return {
    id: modelName,
    name: modelName,
    api: 'openai-codex-responses' as const,
    provider: 'openai-codex' as const,
    baseUrl: 'https://chatgpt.com/backend-api/codex',
    reasoning: true,
    input: ['text', 'image'] as ('text' | 'image')[],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 272000,
    maxTokens: 32768,
  };
}

export async function resolvePiModel(
  provider: string,
  modelName: string,
  options?: { authMode?: import('./auth.js').PiAuthMode; apiKeyEnv?: string; apiKeyOverride?: string },
): Promise<ResolvedPiModelRequest> {
  // Guard: direct Anthropic provider + OpenRouter key = guaranteed 401.
  // Users who want Claude should use openrouter/anthropic/claude-* instead.
  if (provider === 'anthropic' && options?.apiKeyEnv === 'OPENROUTER_API_KEY') {
    throw new Error(
      `Model "${provider}/${modelName}" routes through the Anthropic API directly and requires ANTHROPIC_API_KEY. ` +
      `To use Claude via OpenRouter, change the model ID to "openrouter/anthropic/${modelName}".`,
    );
  }

  const credential = resolveApiCredential({
    provider,
    authMode: options?.authMode,
    apiKeyEnv: options?.apiKeyEnv,
    apiKeyOverride: options?.apiKeyOverride,
  });
  const resolvedProvider = provider === 'openai' && credential.source === 'codex'
    ? 'openai-codex'
    : provider;
  const authStorage = createPiAuthStorage({
    provider: resolvedProvider,
    authMode: options?.authMode,
    apiKeyEnv: options?.apiKeyEnv,
    apiKeyOverride: credential.apiKey,
  });
  const modelRegistry = ModelRegistry.create(authStorage);
  const registryModel = modelRegistry.find(resolvedProvider, modelName);
  const resolvedModel = registryModel
    ?? getModel(resolvedProvider as never, modelName)
    ?? synthesizeOpenRouterModel(resolvedProvider, modelName)
    ?? synthesizeOpenAICodexModel(resolvedProvider, modelName);
  if (!resolvedModel) {
    throw new Error(`Could not resolve pi model ${resolvedProvider}/${modelName}`);
  }

  const auth = await modelRegistry.getApiKeyAndHeaders(resolvedModel);
  if (!auth.ok) {
    throw new Error(auth.error);
  }

  return {
    model: resolvedModel,
    authStorage,
    modelRegistry,
    auth: {
      apiKey: auth.apiKey,
      headers: auth.headers,
    },
  };
}

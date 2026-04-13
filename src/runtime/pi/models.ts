import type { Model } from '@mariozechner/pi-ai';
import { getModel } from '@mariozechner/pi-ai';
import { ModelRegistry } from '@mariozechner/pi-coding-agent';

import { createPiAuthStorage } from './auth.js';
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
  options?: { apiKeyEnv?: string; apiKeyOverride?: string },
): Promise<ResolvedPiModelRequest> {
  const { provider, model } = parseModelRef(modelRef);
  return resolvePiModel(provider, model, options);
}

export async function resolvePiModel(
  provider: string,
  modelName: string,
  options?: { apiKeyEnv?: string; apiKeyOverride?: string },
): Promise<ResolvedPiModelRequest> {
  // Anthropic models route through the Anthropic API directly (not OpenRouter).
  // If the configured apiKeyEnv is OPENROUTER_API_KEY, catch this early to avoid
  // a confusing 401 from api.anthropic.com.
  if (provider === 'anthropic' && options?.apiKeyEnv === 'OPENROUTER_API_KEY') {
    throw new Error(
      `Model "${provider}/${modelName}" requires a direct Anthropic API key, but apiKeyEnv is set to OPENROUTER_API_KEY. ` +
      `Either set apiKeyEnv to ANTHROPIC_API_KEY, or choose an OpenRouter-accessible model ` +
      `(e.g. openrouter/openai/gpt-4o, openrouter/google/gemini-2.0-flash-001).`,
    );
  }

  const authStorage = createPiAuthStorage({
    provider,
    apiKeyEnv: options?.apiKeyEnv,
    apiKeyOverride: options?.apiKeyOverride,
  });
  const modelRegistry = ModelRegistry.create(authStorage);
  const registryModel = modelRegistry.find(provider, modelName);
  const resolvedModel = registryModel ?? getModel(provider as never, modelName);
  if (!resolvedModel) {
    throw new Error(`Could not resolve pi model ${provider}/${modelName}`);
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

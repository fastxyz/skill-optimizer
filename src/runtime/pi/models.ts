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

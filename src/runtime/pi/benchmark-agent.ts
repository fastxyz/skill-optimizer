import { resolvePiModelByRef } from './models.js';
import type { PiAuthMode } from './auth.js';

export async function createReadOnlyBenchmarkModel(params: {
  modelRef: string;
  authMode?: PiAuthMode;
  apiKeyEnv?: string;
  apiKeyOverride?: string;
}) {
  return resolvePiModelByRef(params.modelRef, {
    authMode: params.authMode,
    apiKeyEnv: params.apiKeyEnv,
    apiKeyOverride: params.apiKeyOverride,
  });
}

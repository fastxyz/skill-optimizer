import { resolvePiModelByRef } from './models.js';

export async function createReadOnlyBenchmarkModel(params: {
  modelRef: string;
  authMode?: import('./auth.js').PiAuthMode;
  apiKeyEnv?: string;
  apiKeyOverride?: string;
}) {
  return resolvePiModelByRef(params.modelRef, {
    authMode: params.authMode,
    apiKeyEnv: params.apiKeyEnv,
    apiKeyOverride: params.apiKeyOverride,
  });
}

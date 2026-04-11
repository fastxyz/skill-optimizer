import { resolvePiModelByRef } from './models.js';

export async function createReadOnlyBenchmarkModel(params: {
  modelRef: string;
  apiKeyEnv?: string;
  apiKeyOverride?: string;
}) {
  return resolvePiModelByRef(params.modelRef, {
    apiKeyEnv: params.apiKeyEnv,
    apiKeyOverride: params.apiKeyOverride,
  });
}

import { AuthStorage } from '@mariozechner/pi-coding-agent';

export interface PiAuthOptions {
  provider: string;
  apiKeyEnv?: string;
  apiKeyOverride?: string;
}

export function createPiAuthStorage(options?: PiAuthOptions): ReturnType<typeof AuthStorage.create> {
  const authStorage = AuthStorage.create();
  if (!options) {
    return authStorage;
  }

  const apiKey = options.apiKeyOverride ?? (options.apiKeyEnv ? process.env[options.apiKeyEnv] : undefined);
  if (apiKey) {
    authStorage.setRuntimeApiKey(options.provider as never, apiKey);
  }
  return authStorage;
}

export function requireApiKeyFromEnv(apiKeyEnv: string): string {
  const apiKey = process.env[apiKeyEnv];
  if (!apiKey) {
    throw new Error(`Missing API key env var: ${apiKeyEnv}`);
  }
  return apiKey;
}

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

import { AuthStorage } from '@mariozechner/pi-coding-agent';

export type PiAuthMode = 'env' | 'codex' | 'auto';

export interface PiAuthOptions {
  provider: string;
  authMode?: PiAuthMode;
  apiKeyEnv?: string;
  apiKeyOverride?: string;
}

export interface ResolvedApiCredential {
  apiKey?: string;
  source?: 'override' | 'env' | 'codex';
}

const CODEX_ACCESS_TOKEN_REFRESH_SKEW_MS = 120_000;

export function createPiAuthStorage(options?: PiAuthOptions): ReturnType<typeof AuthStorage.create> {
  const authStorage = AuthStorage.create();
  if (!options) {
    return authStorage;
  }

  const apiKey = resolveApiKey({
    provider: options.provider,
    authMode: options.authMode,
    apiKeyEnv: options.apiKeyEnv,
    apiKeyOverride: options.apiKeyOverride,
  });
  if (apiKey) {
    authStorage.setRuntimeApiKey(options.provider as never, apiKey);
  }
  return authStorage;
}

export function resolveApiKey(options: PiAuthOptions): string | undefined {
  return resolveApiCredential(options).apiKey;
}

export function resolveApiCredential(options: PiAuthOptions): ResolvedApiCredential {
  if (options.apiKeyOverride) {
    return { apiKey: options.apiKeyOverride, source: 'override' };
  }

  const authMode = options.authMode ?? 'env';
  const envName = options.apiKeyEnv ?? defaultApiKeyEnvForProvider(options.provider);
  const envApiKey = envName ? process.env[envName] : undefined;

  if (authMode === 'env') {
    return envApiKey ? { apiKey: envApiKey, source: 'env' } : {};
  }

  if (authMode === 'codex') {
    return readCodexApiKey(options.provider);
  }

  if (envApiKey) {
    return { apiKey: envApiKey, source: 'env' };
  }

  return readCodexApiKey(options.provider);
}

export function requireConfiguredApiKey(options: PiAuthOptions): string {
  const apiKey = resolveApiKey(options);
  if (apiKey) {
    return apiKey;
  }

  const authMode = options.authMode ?? 'env';
  if (authMode === 'codex') {
    if (options.provider !== 'openai') {
      throw new Error(
        `Codex auth only supports the "openai" provider, got "${options.provider}". ` +
        `Use authMode: "env" with an appropriate API key env var instead.`,
      );
    }
    throw new Error(
      `Codex auth is enabled for provider "${options.provider}" but no usable access token or OPENAI_API_KEY was found in ~/.codex/auth.json.`,
    );
  }

  if (authMode === 'auto' && options.provider === 'openai') {
    const envName = options.apiKeyEnv ?? 'OPENAI_API_KEY';
    throw new Error(
      `Could not resolve auth for provider "${options.provider}". ` +
      `Checked env var "${envName}" and ~/.codex/auth.json for a browser-login access token or OPENAI_API_KEY.`,
    );
  }

  const envName = options.apiKeyEnv ?? defaultApiKeyEnvForProvider(options.provider);
  if (!envName) {
    throw new Error(`No default API key env var is known for provider "${options.provider}"`);
  }

  throw new Error(`Missing API key env var: ${envName}`);
}

export function requireApiKeyFromEnv(apiKeyEnv: string): string {
  const apiKey = process.env[apiKeyEnv];
  if (!apiKey) {
    throw new Error(`Missing API key env var: ${apiKeyEnv}`);
  }
  return apiKey;
}

function readCodexApiKey(provider: string): ResolvedApiCredential {
  if (provider !== 'openai') {
    return {};
  }

  const authPath = resolve(homedir(), '.codex', 'auth.json');
  let raw: string;
  try {
    raw = readFileSync(authPath, 'utf-8');
  } catch {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as {
      OPENAI_API_KEY?: unknown;
      tokens?: { OPENAI_API_KEY?: unknown; access_token?: unknown };
    };
    // Browser-login JWT takes highest priority: it represents an active user session.
    // A stale static key must not shadow a valid browser-login token.
    if (typeof parsed.tokens?.access_token === 'string' && parsed.tokens.access_token.trim()) {
      return isJwtExpired(parsed.tokens.access_token)
        ? {}
        : { apiKey: parsed.tokens.access_token, source: 'codex' };
    }
    if (typeof parsed.tokens?.OPENAI_API_KEY === 'string' && parsed.tokens.OPENAI_API_KEY.trim()) {
      return { apiKey: parsed.tokens.OPENAI_API_KEY, source: 'codex' };
    }
    if (typeof parsed.OPENAI_API_KEY === 'string' && parsed.OPENAI_API_KEY.trim()) {
      return { apiKey: parsed.OPENAI_API_KEY, source: 'codex' };
    }
    return {};
  } catch {
    return {};
  }
}

function isJwtExpired(token: string): boolean {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return false;
  }

  try {
    const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf-8')) as { exp?: unknown };
    if (typeof payload.exp !== 'number') {
      return false;
    }
    return payload.exp * 1000 <= Date.now() + CODEX_ACCESS_TOKEN_REFRESH_SKEW_MS;
  } catch {
    return false;
  }
}

function defaultApiKeyEnvForProvider(provider: string): string | undefined {
  switch (provider) {
    case 'openai':
    case 'openai-codex':
      return 'OPENAI_API_KEY';
    case 'anthropic':
      return 'ANTHROPIC_API_KEY';
    case 'openrouter':
      return 'OPENROUTER_API_KEY';
    default:
      return undefined;
  }
}

import type { CriticDeps } from '../verdict/recommendations.js';
import { piSimpleComplete } from './pi-simple-complete.js';

export interface DefaultPiCriticOptions {
  provider: string;
  model: string;
  authMode?: import('../runtime/pi/auth.js').PiAuthMode;
  apiKeyEnv?: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

export function createDefaultPiCritic(options: DefaultPiCriticOptions): CriticDeps {
  return {
    async complete(input) {
      const text = await piSimpleComplete(
        {
          provider: options.provider,
          model: options.model,
          authMode: options.authMode,
          apiKeyEnv: options.apiKeyEnv,
          timeoutMs: options.timeoutMs,
          headers: options.headers,
          reasoning: 'minimal',
        },
        { system: input.system, prompt: input.prompt },
      );

      return text || '[]';
    },
  };
}

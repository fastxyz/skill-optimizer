import type { CriticDeps } from '../verdict/recommendations.js';
import { piSimpleComplete } from './pi-simple-complete.js';
import type { PiAuthMode } from '../runtime/pi/auth.js';

export interface DefaultPiCriticOptions {
  provider: string;
  model: string;
  authMode?: PiAuthMode;
  apiKeyEnv?: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

export function createDefaultPiCritic(options: DefaultPiCriticOptions): CriticDeps {
  return {
    async complete(input) {
      try {
        return await piSimpleComplete(
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
      } catch (err) {
        // A model that returns no text blocks is treated as "no recommendations"
        // rather than a hard failure — the verdict flow continues with an empty list.
        // Real provider errors (stopReason === 'error') are re-thrown.
        if (err instanceof Error && err.message.startsWith('Model returned no text blocks')) {
          return '[]';
        }
        throw err;
      }
    },
  };
}

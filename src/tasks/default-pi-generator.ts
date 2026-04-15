import type { SimpleStreamOptions } from '@mariozechner/pi-ai';

import type { TaskGeneratorDeps } from './types.js';
import { piSimpleComplete } from './pi-simple-complete.js';
import type { PiAuthMode } from '../runtime/pi/auth.js';

type ThinkingLevel = NonNullable<SimpleStreamOptions['reasoning']>;

export interface DefaultPiGeneratorOptions {
  provider: string;
  model: string;
  authMode?: PiAuthMode;
  apiKeyEnv?: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
  thinkingLevel?: ThinkingLevel;
}

export function createDefaultPiTaskGenerator(options: DefaultPiGeneratorOptions): TaskGeneratorDeps {
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
          reasoning: options.thinkingLevel ?? 'minimal',
        },
        { system: input.system, prompt: input.prompt },
      );

      if (!text) {
        throw new Error(`Generation model returned no text blocks`);
      }

      return text;
    },
  };
}

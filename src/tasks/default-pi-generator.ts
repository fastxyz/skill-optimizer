import { completeSimple } from '@mariozechner/pi-ai';
import type { SimpleStreamOptions } from '@mariozechner/pi-ai';

import { resolvePiModel } from '../runtime/pi/index.js';

import type { TaskGeneratorDeps } from './types.js';

type ThinkingLevel = NonNullable<SimpleStreamOptions['reasoning']>;

export interface DefaultPiGeneratorOptions {
  provider: string;
  model: string;
  authMode?: import('../runtime/pi/auth.js').PiAuthMode;
  apiKeyEnv?: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
  thinkingLevel?: ThinkingLevel;
}

export function createDefaultPiTaskGenerator(options: DefaultPiGeneratorOptions): TaskGeneratorDeps {
  return {
    async complete(input) {
      const resolved = await resolvePiModel(options.provider, options.model, {
        authMode: options.authMode,
        apiKeyEnv: options.apiKeyEnv,
      });

      const controller = new AbortController();
      const timeoutMs = options.timeoutMs ?? 120_000;
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      timer.unref?.();

      const response = await completeSimple(
        resolved.model,
        {
          systemPrompt: input.system,
          messages: [{ role: 'user', content: input.prompt, timestamp: Date.now() }],
        },
        {
          signal: controller.signal,
          apiKey: resolved.auth.apiKey,
          headers: { ...(resolved.auth.headers ?? {}), ...(options.headers ?? {}) },
          reasoning: options.thinkingLevel ?? 'minimal',
        },
      ).finally(() => clearTimeout(timer));

      if (response.stopReason === 'error' && response.errorMessage) {
        throw new Error(response.errorMessage);
      }

      const text = response.content
        .filter((block): block is Extract<typeof block, { type: 'text' }> => block.type === 'text')
        .map((block) => block.text)
        .join('\n')
        .trim();

      if (!text) {
        const contentTypes = response.content.map((block) => block.type).join(', ');
        throw new Error(
          response.errorMessage
            ?? `Generation model returned no text blocks${contentTypes ? ` (content types: ${contentTypes})` : ''}`,
        );
      }

      return text;
    },
  };
}

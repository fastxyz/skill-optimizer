import { completeSimple } from '@mariozechner/pi-ai';

import { resolvePiModel } from '../runtime/pi/index.js';
import type { CriticDeps } from '../verdict/recommendations.js';

export interface DefaultPiCriticOptions {
  provider: string;
  model: string;
  apiKeyEnv?: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

export function createDefaultPiCritic(options: DefaultPiCriticOptions): CriticDeps {
  return {
    async complete(input) {
      const resolved = await resolvePiModel(options.provider, options.model, {
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
          reasoning: 'minimal',
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

      return text || '[]';
    },
  };
}

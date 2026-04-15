/**
 * Shared helper for tasks that call Pi's completeSimple API.
 *
 * Both the default task-generator and the default critic perform an identical
 * sequence: resolve the model, set up an abort timer, call completeSimple, check
 * for errors, and extract text blocks. This module encapsulates that sequence so
 * each consumer only needs to handle what's unique to it.
 */

import { completeSimple } from '@mariozechner/pi-ai';
import type { SimpleStreamOptions } from '@mariozechner/pi-ai';

import { resolvePiModel } from '../runtime/pi/index.js';
import type { PiAuthMode } from '../runtime/pi/auth.js';

interface PiSimpleCompleteOptions {
  provider: string;
  model: string;
  authMode?: PiAuthMode;
  apiKeyEnv?: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
  reasoning?: NonNullable<SimpleStreamOptions['reasoning']>;
}

interface PiSimpleCompleteInput {
  system: string;
  prompt: string;
}

/**
 * Resolve a Pi model, call completeSimple with a timeout, check for errors,
 * and return the concatenated text from all text blocks.
 *
 * Throws if the model signals an error or if the response contains no text blocks.
 */
export async function piSimpleComplete(
  options: PiSimpleCompleteOptions,
  input: PiSimpleCompleteInput,
): Promise<string> {
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
      reasoning: options.reasoning ?? 'minimal',
    },
  ).finally(() => clearTimeout(timer));

  if (response.stopReason === 'error') {
    throw new Error(response.errorMessage ?? 'Model returned stop reason "error" with no message');
  }

  const text = response.content
    .filter((block): block is Extract<typeof block, { type: 'text' }> => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();

  if (!text) {
    const contentTypes = response.content.map((b) => b.type).join(', ');
    throw new Error(`Model returned no text blocks${contentTypes ? ` (content types: ${contentTypes})` : ''}`);
  }

  return text;
}

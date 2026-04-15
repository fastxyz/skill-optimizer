/**
 * Shared utilities for LLM format handlers.
 *
 * Keeping these in one place avoids duplicating identical logic across
 * openai-format.ts, anthropic-format.ts, and any future format handlers.
 */

import type { LLMResponse } from '../types.js';

/** Maximum tool-result characters forwarded to the model in agent loops. */
const MAX_TOOL_RESULT_CHARS = 50_000;
const TRUNCATED_SUFFIX = '\n\n[... truncated]';

/**
 * Truncate a tool result string so it does not exceed MAX_TOOL_RESULT_CHARS.
 * Returns the original string if it is already within the limit.
 */
export function truncateToolResult(result: string): string {
  if (result.length <= MAX_TOOL_RESULT_CHARS) return result;
  return result.slice(0, MAX_TOOL_RESULT_CHARS - TRUNCATED_SUFFIX.length) + TRUNCATED_SUFFIX;
}

export function isAbortError(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && 'name' in err && (err as { name: unknown }).name === 'AbortError');
}

/**
 * Return true if the error is a transient server error that should be retried.
 * Does NOT retry abort errors or 4xx client errors (except 429 rate-limit).
 */
export function isRetryableError(err: unknown): boolean {
  if (isAbortError(err)) return false;
  if (err && typeof err === 'object' && 'status' in err) {
    const status = (err as { status: unknown }).status;
    if (typeof status === 'number' && status >= 400 && status < 500 && status !== 429) {
      return false;
    }
  }
  return true;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function undefinedIfEmpty<T>(arr: T[]): T[] | undefined {
  return arr.length > 0 ? arr : undefined;
}

export function normalizeUsage(
  usage: { prompt: number; completion: number; total: number },
): LLMResponse['usage'] {
  return usage.total > 0 ? usage : undefined;
}

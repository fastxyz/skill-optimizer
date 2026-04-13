import type { ExtractedCall, LLMResponse } from '../types.js';

/**
 * Extract tool calls from a structured LLM response (MCP mode).
 * In MCP mode, the LLM returns tool_calls directly — no code parsing needed.
 */
export function extractFromToolCalls(response: LLMResponse): ExtractedCall[] {
  if (!response.toolCalls || response.toolCalls.length === 0) {
    return [];
  }

  return response.toolCalls.map((tc, index) => ({
    method: tc.name,
    args: tc.arguments,
    line: index,  // no meaningful line number in MCP mode
    raw: JSON.stringify(tc),
  }));
}

import type { ExtractedCall, BenchmarkConfig, LLMResponse } from '../types.js';
import { extractFromCode } from './code-analyzer.js';
import { extractCodeBlock } from './code-extractor.js';
import { extractFromToolCalls } from './mcp-extractor.js';

/**
 * Extract SDK/tool calls from an LLM response based on the benchmark mode.
 *
 * Code mode: extract code block from markdown → tree-sitter parse → ExtractedCall[]
 * MCP mode: read tool_calls from response → ExtractedCall[]
 */
export async function extract(
  response: LLMResponse,
  config: BenchmarkConfig,
): Promise<{ calls: ExtractedCall[]; generatedCode: string | null }> {
  if (config.mode === 'mcp') {
    const calls = extractFromToolCalls(response);
    return { calls, generatedCode: null };
  }

  // Code mode — dispatch by style
  if (!config.code) {
    throw new Error('Code mode requires "code" section in config');
  }

  const generatedCode = extractCodeBlock(response.content);
  if (!generatedCode) {
    return { calls: [], generatedCode: null };
  }

  const calls = await extractFromCode(generatedCode, config.code.classes ?? []);
  return { calls, generatedCode };
}

// Re-export for direct access
export { extractCodeBlock } from './code-extractor.js';
export { extractFromCode } from './code-analyzer.js';
export { extractFromToolCalls } from './mcp-extractor.js';

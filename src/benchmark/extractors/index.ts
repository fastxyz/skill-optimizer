import type { ExtractedCall, BenchmarkConfig, LLMResponse } from '../types.js';
import { extractCodeBlock, extractSdkCodeBlock } from './code-extractor.js';
import { extractFromCliMarkdown, extractShellBlock } from './cli-extractor.js';
import { extractFromToolCalls } from './mcp-extractor.js';
import { extractSdkFromCode, getSdkAdapter } from './sdk/registry.js';

/**
 * Extract SDK/tool calls from an LLM response based on the configured surface.
 *
 * SDK surface: extract TypeScript block from markdown → tree-sitter parse → ExtractedCall[]
 * CLI surface: extract shell block from markdown → parse command invocations → ExtractedCall[]
 * MCP surface: read tool_calls from response → ExtractedCall[]
 */
export async function extract(
  response: LLMResponse,
  config: BenchmarkConfig,
): Promise<{ calls: ExtractedCall[]; generatedCode: string | null; bindings?: Map<string, string> }> {
  const extended = config as BenchmarkConfig & {
    surface?: 'sdk' | 'cli' | 'mcp';
    mode?: 'code' | 'mcp';
    sdk?: unknown;
    cli?: { commandDefinitions?: Array<{ command: string }> };
    code?: unknown;
  };
  const surface = extended.surface;
  const sdkConfig = (extended.sdk ?? extended.code) as BenchmarkConfig['sdk'] | undefined;
  const knownCommands = Array.isArray(extended.cli?.commandDefinitions)
    ? extended.cli.commandDefinitions.map((definition) => definition.command)
    : undefined;

  if (surface === 'mcp' || extended.mode === 'mcp') {
    const calls = extractFromToolCalls(response);
    return { calls, generatedCode: null };
  }

  if (surface === 'cli') {
    const generatedCode = extractShellBlock(response.content);
    const calls = extractFromCliMarkdown(response.content, knownCommands);
    return { calls, generatedCode };
  }

  if (!sdkConfig) {
    throw new Error('SDK surface requires "sdk" section in config');
  }

  const generatedCode = extractSdkCodeBlock(response.content, sdkConfig.language);
  if (!generatedCode) {
    return { calls: [], generatedCode: null };
  }

  const { calls, bindings } = await extractSdkFromCode(generatedCode, sdkConfig.language);
  return { calls, generatedCode, bindings };
}

// Re-export for direct access
export { extractCodeBlock, extractSdkCodeBlock } from './code-extractor.js';
export { extractShellBlock, extractFromCliMarkdown, parseShellCommands } from './cli-extractor.js';
export { extractFromCode } from './code-analyzer.js';
export { extractFromToolCalls } from './mcp-extractor.js';
export { extractSdkFromCode, getSdkAdapter } from './sdk/registry.js';

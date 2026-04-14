import type { LLMConfig, LLMResponse, McpToolDefinition, ToolExecutor } from '../types.js';
import { chatOpenAI, chatWithToolsOpenAI, chatAgentLoopOpenAI } from './openai-format.js';
import { chatAnthropic, chatWithToolsAnthropic, chatAgentLoopAnthropic } from './anthropic-format.js';
import { chatPi, chatWithToolsPi, chatAgentLoopPi } from './pi-format.js';

export interface LLMClient {
  /** Regular chat — LLM returns text output (SDK/CLI surfaces) */
  chat(modelId: string, system: string, user: string): Promise<LLMResponse>;
  /** Chat with tools — LLM returns structured tool_calls (MCP surface) */
  chatWithTools(modelId: string, system: string, user: string, tools: McpToolDefinition[]): Promise<LLMResponse>;
  /** Agentic multi-turn loop — LLM can call tools and receive results across multiple turns */
  chatAgentLoop(
    modelId: string, system: string, user: string,
    tools: McpToolDefinition[], executor: ToolExecutor, maxTurns?: number,
  ): Promise<LLMResponse>;
}

/**
 * Strip the provider prefix (e.g. "anthropic/", "openai/") from a model ID
 * when talking directly to a provider API rather than through a router.
 *
 * The config validation requires prefixed IDs like "anthropic/claude-sonnet-4-6",
 * but the native Anthropic/OpenAI APIs expect just "claude-sonnet-4-6" / "gpt-4o".
 */
function stripProviderPrefix(modelId: string): string {
  const slashIndex = modelId.indexOf('/');
  if (slashIndex === -1) return modelId;
  return modelId.slice(slashIndex + 1);
}

/**
 * Create an LLM client from config.
 */
export function createLLMClient(config: LLMConfig): LLMClient {
  const baseUrl = config.baseUrl?.replace(/\/+$/, ''); // strip trailing slash
  const timeout = config.timeout ?? 240_000;
  const apiKey = config.apiKeyEnv ? process.env[config.apiKeyEnv] : undefined;

  if (config.apiKeyEnv && !apiKey) {
    throw new Error(`Environment variable ${config.apiKeyEnv} is not set`);
  }

  const extraHeaders = config.headers ?? {};

  // When format is 'anthropic' or 'openai', we're talking directly to a provider
  // API that doesn't understand prefixed model IDs like "anthropic/claude-sonnet-4-6".
  // Strip the prefix so only the bare model name (e.g. "claude-sonnet-4-6") is sent.
  const shouldStripPrefix = config.format === 'anthropic' || config.format === 'openai';

  return {
    async chat(modelId, system, user) {
      const resolvedModelId = shouldStripPrefix ? stripProviderPrefix(modelId) : modelId;
      if (config.format === 'pi') {
        return chatPi({ timeout, modelId, system, user, apiKeyOverride: apiKey, headers: config.headers });
      }
      if (config.format === 'anthropic') {
        return chatAnthropic({ baseUrl: baseUrl!, apiKey, timeout, extraHeaders, modelId: resolvedModelId, system, user });
      }
      return chatOpenAI({ baseUrl: baseUrl!, apiKey, timeout, extraHeaders, modelId: resolvedModelId, system, user });
    },
    async chatWithTools(modelId, system, user, tools) {
      const resolvedModelId = shouldStripPrefix ? stripProviderPrefix(modelId) : modelId;
      if (config.format === 'pi') {
        return chatWithToolsPi({ timeout, modelId, system, user, tools, apiKeyOverride: apiKey, headers: config.headers });
      }
      if (config.format === 'anthropic') {
        return chatWithToolsAnthropic({ baseUrl: baseUrl!, apiKey, timeout, extraHeaders, modelId: resolvedModelId, system, user, tools });
      }
      return chatWithToolsOpenAI({ baseUrl: baseUrl!, apiKey, timeout, extraHeaders, modelId: resolvedModelId, system, user, tools });
    },
    async chatAgentLoop(modelId, system, user, tools, executor, maxTurns = 5) {
      const resolvedModelId = shouldStripPrefix ? stripProviderPrefix(modelId) : modelId;
      if (config.format === 'pi') {
        return chatAgentLoopPi({ timeout, modelId, system, user, tools, executor, maxTurns, apiKeyOverride: apiKey, headers: config.headers });
      }
      if (config.format === 'anthropic') {
        return chatAgentLoopAnthropic({ baseUrl: baseUrl!, apiKey, timeout, extraHeaders, modelId: resolvedModelId, system, user, tools, executor, maxTurns });
      }
      return chatAgentLoopOpenAI({ baseUrl: baseUrl!, apiKey, timeout, extraHeaders, modelId: resolvedModelId, system, user, tools, executor, maxTurns });
    },
  };
}

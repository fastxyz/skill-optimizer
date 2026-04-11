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

  return {
    async chat(modelId, system, user) {
      if (config.format === 'pi') {
        return chatPi({ timeout, modelId, system, user, apiKeyOverride: apiKey, headers: config.headers });
      }
      if (config.format === 'anthropic') {
        return chatAnthropic({ baseUrl: baseUrl!, apiKey, timeout, extraHeaders, modelId, system, user });
      }
      return chatOpenAI({ baseUrl: baseUrl!, apiKey, timeout, extraHeaders, modelId, system, user });
    },
    async chatWithTools(modelId, system, user, tools) {
      if (config.format === 'pi') {
        return chatWithToolsPi({ timeout, modelId, system, user, tools, apiKeyOverride: apiKey, headers: config.headers });
      }
      if (config.format === 'anthropic') {
        return chatWithToolsAnthropic({ baseUrl: baseUrl!, apiKey, timeout, extraHeaders, modelId, system, user, tools });
      }
      return chatWithToolsOpenAI({ baseUrl: baseUrl!, apiKey, timeout, extraHeaders, modelId, system, user, tools });
    },
    async chatAgentLoop(modelId, system, user, tools, executor, maxTurns = 5) {
      if (config.format === 'pi') {
        return chatAgentLoopPi({ timeout, modelId, system, user, tools, executor, maxTurns, apiKeyOverride: apiKey, headers: config.headers });
      }
      if (config.format === 'anthropic') {
        return chatAgentLoopAnthropic({ baseUrl: baseUrl!, apiKey, timeout, extraHeaders, modelId, system, user, tools, executor, maxTurns });
      }
      return chatAgentLoopOpenAI({ baseUrl: baseUrl!, apiKey, timeout, extraHeaders, modelId, system, user, tools, executor, maxTurns });
    },
  };
}

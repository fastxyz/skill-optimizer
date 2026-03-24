import type { LLMConfig, LLMResponse, McpToolDefinition, ToolExecutor } from '../types.js';
import { chatOpenAI, chatWithToolsOpenAI, chatAgentLoopOpenAI } from './openai-format.js';
import { chatAnthropic, chatWithToolsAnthropic, chatAgentLoopAnthropic } from './anthropic-format.js';

export interface LLMClient {
  /** Regular chat — LLM returns text (code mode) */
  chat(modelId: string, system: string, user: string): Promise<LLMResponse>;
  /** Chat with tools — LLM returns structured tool_calls (MCP mode) */
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
  const baseUrl = config.baseUrl.replace(/\/+$/, ''); // strip trailing slash
  const timeout = config.timeout ?? 240_000;
  const apiKey = config.apiKeyEnv ? process.env[config.apiKeyEnv] : undefined;

  if (config.apiKeyEnv && !apiKey) {
    throw new Error(`Environment variable ${config.apiKeyEnv} is not set`);
  }

  const extraHeaders = config.headers ?? {};

  return {
    async chat(modelId, system, user) {
      if (config.format === 'anthropic') {
        return chatAnthropic({ baseUrl, apiKey, timeout, extraHeaders, modelId, system, user });
      }
      return chatOpenAI({ baseUrl, apiKey, timeout, extraHeaders, modelId, system, user });
    },
    async chatWithTools(modelId, system, user, tools) {
      if (config.format === 'anthropic') {
        return chatWithToolsAnthropic({ baseUrl, apiKey, timeout, extraHeaders, modelId, system, user, tools });
      }
      return chatWithToolsOpenAI({ baseUrl, apiKey, timeout, extraHeaders, modelId, system, user, tools });
    },
    async chatAgentLoop(modelId, system, user, tools, executor, maxTurns = 5) {
      if (config.format === 'anthropic') {
        return chatAgentLoopAnthropic({ baseUrl, apiKey, timeout, extraHeaders, modelId, system, user, tools, executor, maxTurns });
      }
      return chatAgentLoopOpenAI({ baseUrl, apiKey, timeout, extraHeaders, modelId, system, user, tools, executor, maxTurns });
    },
  };
}

import type { LLMConfig, LLMResponse, McpToolDefinition, ToolExecutor } from '../types.js';
import { chatOpenAI, chatWithToolsOpenAI, chatAgentLoopOpenAI } from './openai-format.js';
import { chatAnthropic, chatWithToolsAnthropic, chatAgentLoopAnthropic } from './anthropic-format.js';
import { chatPi, chatWithToolsPi, chatAgentLoopPi } from './pi-format.js';
import { requireConfiguredApiKey, resolveApiCredential } from '../../runtime/pi/index.js';

interface LLMClient {
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
 * Strip the provider prefix from a model ID when talking directly to a provider API.
 *
 * Only strips "anthropic/" and "openai/" prefixes — the prefixes that belong to
 * direct-API configs. "openrouter/" prefixes are intentionally left intact: they
 * signal that the ID belongs to format:'pi' (OpenRouter), so encountering one here
 * means the config is misconfigured and we want a fast, visible API error rather
 * than silently misrouting the request.
 */
function stripProviderPrefix(modelId: string): string {
  if (modelId.startsWith('anthropic/')) return modelId.slice('anthropic/'.length);
  if (modelId.startsWith('openai/')) return modelId.slice('openai/'.length);
  return modelId;
}

/**
 * Create an LLM client from config.
 */
export function createLLMClient(config: LLMConfig): LLMClient {
  const baseUrl = config.baseUrl?.replace(/\/+$/, ''); // strip trailing slash
  const timeout = config.timeout ?? 240_000;
  const extraHeaders = config.headers ?? {};

  function resolveOpenAICredential() {
    if (config.format !== 'openai') return undefined;
    return resolveApiCredential({
      provider: 'openai',
      authMode: config.authMode,
      apiKeyEnv: config.apiKeyEnv,
    });
  }

  const resolveDirectApiKey = (provider: 'openai' | 'anthropic', openAICredential?: ReturnType<typeof resolveOpenAICredential>): string =>
    provider === 'openai' && openAICredential?.apiKey
      ? openAICredential.apiKey
      : requireConfiguredApiKey({
        provider,
        authMode: config.authMode,
        apiKeyEnv: config.apiKeyEnv,
      });
  const toOpenAIProviderModelRef = (modelId: string): string =>
    modelId.includes('/') ? modelId : `openai/${modelId}`;

  // When format is 'anthropic' or 'openai', we're talking directly to a provider
  // API that doesn't understand prefixed model IDs like "anthropic/claude-sonnet-4-6".
  // Strip the prefix so only the bare model name (e.g. "claude-sonnet-4-6") is sent.
  const shouldStripPrefix = config.format === 'anthropic' || config.format === 'openai';

  return {
    async chat(modelId, system, user) {
      const openAICredential = resolveOpenAICredential();
      const resolvedModelId = shouldStripPrefix ? stripProviderPrefix(modelId) : modelId;
      if (config.format === 'pi') {
        return chatPi({
          timeout,
          modelId,
          system,
          user,
          authMode: config.authMode,
          apiKeyEnv: config.apiKeyEnv,
          headers: config.headers,
        });
      }
      // openAICredential is only non-undefined when config.format === 'openai' (see resolveOpenAICredential)
      if (openAICredential?.source === 'codex') {
        // Pass authMode:'codex' so Pi re-reads ~/.codex/auth.json and sets source:'codex',
        // which is required for resolvePiModel to route to the openai-codex provider
        // (synthesizeOpenAICodexModel guards on provider === 'openai-codex'). Using
        // apiKeyOverride here would return source:'override' and break that routing.
        return chatPi({
          timeout,
          modelId: toOpenAIProviderModelRef(modelId),
          system,
          user,
          authMode: 'codex',
          apiKeyEnv: config.apiKeyEnv,
          headers: config.headers,
        });
      }
      if (config.format === 'anthropic') {
        return chatAnthropic({
          baseUrl: baseUrl!,
          apiKey: resolveDirectApiKey('anthropic'),
          timeout,
          extraHeaders,
          modelId: resolvedModelId,
          system,
          user,
        });
      }
      return chatOpenAI({
        baseUrl: baseUrl!,
        apiKey: resolveDirectApiKey('openai', openAICredential),
        timeout,
        extraHeaders,
        modelId: resolvedModelId,
        system,
        user,
      });
    },
    async chatWithTools(modelId, system, user, tools) {
      const openAICredential = resolveOpenAICredential();
      const resolvedModelId = shouldStripPrefix ? stripProviderPrefix(modelId) : modelId;
      if (config.format === 'pi') {
        return chatWithToolsPi({
          timeout,
          modelId,
          system,
          user,
          tools,
          authMode: config.authMode,
          apiKeyEnv: config.apiKeyEnv,
          headers: config.headers,
        });
      }
      // openAICredential is only non-undefined when config.format === 'openai' (see resolveOpenAICredential)
      if (openAICredential?.source === 'codex') {
        return chatWithToolsPi({
          timeout,
          modelId: toOpenAIProviderModelRef(modelId),
          system,
          user,
          tools,
          authMode: 'codex',
          apiKeyEnv: config.apiKeyEnv,
          headers: config.headers,
        });
      }
      if (config.format === 'anthropic') {
        return chatWithToolsAnthropic({
          baseUrl: baseUrl!,
          apiKey: resolveDirectApiKey('anthropic'),
          timeout,
          extraHeaders,
          modelId: resolvedModelId,
          system,
          user,
          tools,
        });
      }
      return chatWithToolsOpenAI({
        baseUrl: baseUrl!,
        apiKey: resolveDirectApiKey('openai', openAICredential),
        timeout,
        extraHeaders,
        modelId: resolvedModelId,
        system,
        user,
        tools,
      });
    },
    async chatAgentLoop(modelId, system, user, tools, executor, maxTurns = 5) {
      const openAICredential = resolveOpenAICredential();
      const resolvedModelId = shouldStripPrefix ? stripProviderPrefix(modelId) : modelId;
      if (config.format === 'pi') {
        return chatAgentLoopPi({
          timeout,
          modelId,
          system,
          user,
          tools,
          executor,
          maxTurns,
          authMode: config.authMode,
          apiKeyEnv: config.apiKeyEnv,
          headers: config.headers,
        });
      }
      // openAICredential is only non-undefined when config.format === 'openai' (see resolveOpenAICredential)
      if (openAICredential?.source === 'codex') {
        return chatAgentLoopPi({
          timeout,
          modelId: toOpenAIProviderModelRef(modelId),
          system,
          user,
          tools,
          executor,
          maxTurns,
          authMode: 'codex',
          apiKeyEnv: config.apiKeyEnv,
          headers: config.headers,
        });
      }
      if (config.format === 'anthropic') {
        return chatAgentLoopAnthropic({
          baseUrl: baseUrl!,
          apiKey: resolveDirectApiKey('anthropic'),
          timeout,
          extraHeaders,
          modelId: resolvedModelId,
          system,
          user,
          tools,
          executor,
          maxTurns,
        });
      }
      return chatAgentLoopOpenAI({
        baseUrl: baseUrl!,
        apiKey: resolveDirectApiKey('openai', openAICredential),
        timeout,
        extraHeaders,
        modelId: resolvedModelId,
        system,
        user,
        tools,
        executor,
        maxTurns,
      });
    },
  };
}

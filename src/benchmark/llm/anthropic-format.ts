import type { LLMResponse, McpToolDefinition, ToolExecutor } from '../types.js';
import {
  isAbortError,
  isRetryableError,
  sleep,
  truncateToolResult,
  undefinedIfEmpty,
  normalizeUsage,
} from './shared.js';

interface CallParams {
  baseUrl: string;
  apiKey: string | undefined;
  timeout: number;
  extraHeaders: Record<string, string>;
  modelId: string;
  system: string;
  user: string;
}

interface CallWithToolsParams extends CallParams {
  tools: McpToolDefinition[];
}

interface AnthropicTool {
  name: string;
  description?: string;
  input_schema: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

/** Transform OpenAI-format McpToolDefinition to Anthropic tool format. */
function toAnthropicTool(tool: McpToolDefinition): AnthropicTool {
  return {
    name: tool.function.name,
    ...(tool.function.description !== undefined && { description: tool.function.description }),
    input_schema: {
      type: 'object',
      ...(tool.function.parameters?.properties !== undefined && {
        properties: tool.function.parameters.properties,
      }),
      ...(tool.function.parameters?.required !== undefined && {
        required: tool.function.parameters.required,
      }),
    },
  };
}

/**
 * Regular chat completion (code mode).
 * POST {baseUrl}/v1/messages
 */
export async function chatAnthropic(params: CallParams): Promise<LLMResponse> {
  const body = {
    model: params.modelId,
    max_tokens: 8192,
    system: params.system,
    messages: [{ role: 'user', content: params.user }],
    temperature: 0.2,
  };
  return callWithRetry(params, body);
}

/**
 * Chat with tools (MCP mode).
 * POST {baseUrl}/v1/messages with tools array
 */
export async function chatWithToolsAnthropic(params: CallWithToolsParams): Promise<LLMResponse> {
  const body = {
    model: params.modelId,
    max_tokens: 8192,
    system: params.system,
    messages: [{ role: 'user', content: params.user }],
    tools: params.tools.map(toAnthropicTool),
    temperature: 0.2,
  };
  return callWithRetry(params, body);
}

async function doFetch(params: CallParams, body: Record<string, unknown>): Promise<LLMResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeout);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01',
    ...params.extraHeaders,
  };
  if (params.apiKey) {
    headers['x-api-key'] = params.apiKey;
  }

  let response: Response;
  try {
    response = await fetch(`${params.baseUrl}/v1/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const text = await response.text();
    const err = new Error(`Anthropic API error ${response.status}: ${text}`);
    (err as any).status = response.status;
    throw err;
  }

  const data = await response.json() as {
    content: Array<
      | { type: 'text'; text: string }
      | { type: 'tool_use'; name: string; input: Record<string, unknown> }
    >;
    usage?: {
      input_tokens: number;
      output_tokens: number;
    };
  };

  if (!data.content || !Array.isArray(data.content)) {
    throw new Error(`Anthropic API returned unexpected response: missing content array`);
  }

  const textBlock = data.content.find((b) => b.type === 'text') as
    | { type: 'text'; text: string }
    | undefined;
  const content = textBlock?.text ?? '';

  const toolUseBlocks = data.content.filter((b) => b.type === 'tool_use') as Array<{
    type: 'tool_use';
    name: string;
    input: Record<string, unknown>;
  }>;
  const toolCalls =
    toolUseBlocks.length > 0
      ? toolUseBlocks.map((block) => ({
          name: block.name,
          arguments: block.input,
        }))
      : undefined;

  const usage = data.usage
    ? {
        prompt: data.usage.input_tokens,
        completion: data.usage.output_tokens,
        total: data.usage.input_tokens + data.usage.output_tokens,
      }
    : undefined;

  return { content, toolCalls, usage };
}

interface AgentLoopParams extends CallWithToolsParams {
  executor: ToolExecutor;
  maxTurns: number;
}

export async function chatAgentLoopAnthropic(params: AgentLoopParams): Promise<LLMResponse> {
  const messages: Array<Record<string, unknown>> = [{ role: 'user', content: params.user }];
  const allToolCalls: Array<{ name: string; arguments: Record<string, unknown> }> = [];
  const totalUsage = { prompt: 0, completion: 0, total: 0 };

  for (let turn = 0; turn < params.maxTurns; turn++) {
    const body: Record<string, unknown> = {
      model: params.modelId, max_tokens: 8192, system: params.system,
      messages, tools: params.tools.map(toAnthropicTool), temperature: 0.2,
    };
    const response = await callWithRetry(params, body);
    if (response.usage) {
      totalUsage.prompt += response.usage.prompt;
      totalUsage.completion += response.usage.completion;
      totalUsage.total += response.usage.total;
    }
    if (!response.toolCalls || response.toolCalls.length === 0) {
      return { content: response.content, toolCalls: undefinedIfEmpty(allToolCalls), usage: normalizeUsage(totalUsage) };
    }
    allToolCalls.push(...response.toolCalls);
    const assistantContent = [
      ...(response.content ? [{ type: 'text', text: response.content }] : []),
      ...response.toolCalls.map((tc, i) => ({ type: 'tool_use', id: `toolu_${turn}_${i}`, name: tc.name, input: tc.arguments })),
    ];
    messages.push({ role: 'assistant', content: assistantContent });
    const toolResults = [];
    for (let i = 0; i < response.toolCalls.length; i++) {
      const tc = response.toolCalls[i];
      let result: string;
      try { result = await params.executor(tc.name, tc.arguments); }
      catch (err) { result = `Error: ${err instanceof Error ? err.message : String(err)}`; }
      toolResults.push({ type: 'tool_result', tool_use_id: `toolu_${turn}_${i}`, content: truncateToolResult(result) });
    }
    messages.push({ role: 'user', content: toolResults });
  }
  return { content: '', toolCalls: undefinedIfEmpty(allToolCalls), usage: normalizeUsage(totalUsage) };
}

async function callWithRetry(
  params: CallParams,
  body: Record<string, unknown>,
): Promise<LLMResponse> {
  try {
    return await doFetch(params, body);
  } catch (err) {
    if (isAbortError(err)) throw err;
    if (!isRetryableError(err)) throw err;
    // Retry once after 3s
    await sleep(3_000);
    return doFetch(params, body);
  }
}

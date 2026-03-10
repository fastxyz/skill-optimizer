import type { LLMResponse, McpToolDefinition } from '../types.js';

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
    throw new Error(`Anthropic API error ${response.status}: ${text}`);
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

async function callWithRetry(
  params: CallParams,
  body: Record<string, unknown>,
): Promise<LLMResponse> {
  try {
    return await doFetch(params, body);
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw err;
    }
    // Retry once after 3s
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    return doFetch(params, body);
  }
}

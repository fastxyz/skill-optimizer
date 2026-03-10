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

/**
 * Regular chat completion (code mode).
 * POST {baseUrl}/chat/completions
 */
export async function chatOpenAI(params: CallParams): Promise<LLMResponse> {
  const body = {
    model: params.modelId,
    messages: [
      { role: 'system', content: params.system },
      { role: 'user', content: params.user },
    ],
    temperature: 0.2,
  };
  return callWithRetry(params, body);
}

/**
 * Chat with tools (MCP mode).
 * POST {baseUrl}/chat/completions with tools array
 */
export async function chatWithToolsOpenAI(params: CallWithToolsParams): Promise<LLMResponse> {
  const body = {
    model: params.modelId,
    messages: [
      { role: 'system', content: params.system },
      { role: 'user', content: params.user },
    ],
    tools: params.tools,
    tool_choice: 'auto',
    temperature: 0.2,
  };
  return callWithRetry(params, body);
}

async function doFetch(params: CallParams, body: Record<string, unknown>): Promise<LLMResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeout);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...params.extraHeaders,
  };
  if (params.apiKey) {
    headers['Authorization'] = `Bearer ${params.apiKey}`;
  }

  let response: Response;
  try {
    response = await fetch(`${params.baseUrl}/chat/completions`, {
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
    throw new Error(`OpenAI API error ${response.status}: ${text}`);
  }

  const data = await response.json() as {
    choices: Array<{
      message: {
        content?: string | null;
        tool_calls?: Array<{
          function: { name: string; arguments: string };
        }>;
      };
    }>;
    usage?: {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
    };
  };

  const message = data.choices[0]?.message;
  const content = message?.content ?? '';

  const toolCalls = message?.tool_calls?.map((tc) => ({
    name: tc.function.name,
    arguments: JSON.parse(tc.function.arguments) as Record<string, unknown>,
  }));

  const usage = data.usage
    ? {
        prompt: data.usage.prompt_tokens,
        completion: data.usage.completion_tokens,
        total: data.usage.total_tokens,
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

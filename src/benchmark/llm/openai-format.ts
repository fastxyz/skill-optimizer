import type { LLMResponse, McpToolDefinition, ToolExecutor } from '../types.js';
import { createToolNameAliasCodec } from './tool-name-aliases.js';

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
  const toolCodec = createToolNameAliasCodec(params.tools);
  const body = {
    model: params.modelId,
    messages: [
      { role: 'system', content: params.system },
      { role: 'user', content: params.user },
    ],
    tools: toolCodec.tools,
    tool_choice: 'auto',
    temperature: 0.2,
  };
  return callWithRetry(params, body, toolCodec.toCanonical);
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
    const err = new Error(`OpenAI API error ${response.status}: ${text}`);
    (err as any).status = response.status;
    throw err;
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

  if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
    throw new Error(`OpenAI API returned unexpected response: no choices in response`);
  }

  const message = data.choices[0]?.message;
  const content = message?.content ?? '';

  const toolCalls = message?.tool_calls?.map((tc) => {
    let parsedArguments: Record<string, unknown> = {};
    try {
      parsedArguments = JSON.parse(tc.function.arguments) as Record<string, unknown>;
    } catch {
      process.stderr.write(
        `[openai-format] Warning: failed to parse tool call arguments for "${tc.function.name}". ` +
          `Raw value: ${tc.function.arguments}\n`,
      );
    }
    return { name: tc.function.name, arguments: parsedArguments };
  });

  const usage = data.usage
    ? {
        prompt: data.usage.prompt_tokens,
        completion: data.usage.completion_tokens,
        total: data.usage.total_tokens,
      }
    : undefined;

  return { content, toolCalls, usage };
}

interface AgentLoopParams extends CallWithToolsParams {
  executor: ToolExecutor;
  maxTurns: number;
}

export async function chatAgentLoopOpenAI(params: AgentLoopParams): Promise<LLMResponse> {
  const toolCodec = createToolNameAliasCodec(params.tools);
  const messages: Array<Record<string, unknown>> = [
    { role: 'system', content: params.system },
    { role: 'user', content: params.user },
  ];
  let allToolCalls: Array<{ name: string; arguments: Record<string, unknown> }> = [];
  let totalUsage = { prompt: 0, completion: 0, total: 0 };

  for (let turn = 0; turn < params.maxTurns; turn++) {
    const body: Record<string, unknown> = {
      model: params.modelId, messages, tools: toolCodec.tools, tool_choice: 'auto', temperature: 0.2,
    };
    const response = await callWithRetry(params, body, toolCodec.toCanonical);
    if (response.usage) {
      totalUsage.prompt += response.usage.prompt;
      totalUsage.completion += response.usage.completion;
      totalUsage.total += response.usage.total;
    }
    if (!response.toolCalls || response.toolCalls.length === 0) {
      return { content: response.content, toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined, usage: totalUsage.total > 0 ? totalUsage : undefined };
    }
    allToolCalls.push(...response.toolCalls);
    messages.push({
      role: 'assistant', content: response.content || null,
      tool_calls: response.toolCalls.map((tc, i) => ({
        id: `call_${turn}_${i}`,
        type: 'function',
        function: {
          name: toolCodec.toProvider(tc.name),
          arguments: JSON.stringify(tc.arguments),
        },
      })),
    });
    const MAX_TOOL_RESULT_CHARS = 50_000;
    for (let i = 0; i < response.toolCalls.length; i++) {
      const tc = response.toolCalls[i];
      let result: string;
      try { result = await params.executor(tc.name, tc.arguments); }
      catch (err) { result = `Error: ${err instanceof Error ? err.message : String(err)}`; }
      if (result.length > MAX_TOOL_RESULT_CHARS) {
        result = result.slice(0, MAX_TOOL_RESULT_CHARS) + '\n\n[... truncated]';
      }
      messages.push({ role: 'tool', tool_call_id: `call_${turn}_${i}`, content: result });
    }
  }
  return { content: '', toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined, usage: totalUsage.total > 0 ? totalUsage : undefined };
}

async function callWithRetry(
  params: CallParams,
  body: Record<string, unknown>,
  toCanonicalToolName: (name: string) => string = (name) => name,
): Promise<LLMResponse> {
  try {
    const response = await doFetch(params, body);
    if (!response.toolCalls || response.toolCalls.length === 0) {
      return response;
    }

    return {
      ...response,
      toolCalls: response.toolCalls.map((toolCall) => ({
        ...toolCall,
        name: toCanonicalToolName(toolCall.name),
      })),
    };
  } catch (err) {
    if (err && typeof err === 'object' && 'name' in err && err.name === 'AbortError') {
      throw err;
    }
    // Don't retry client errors (4xx) except 429 (rate limit)
    if (err && typeof err === 'object' && 'status' in err) {
      const status = (err as any).status;
      if (typeof status === 'number' && status >= 400 && status < 500 && status !== 429) {
        throw err;
      }
    }
    // Retry once after 3s
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    const response = await doFetch(params, body);
    if (!response.toolCalls || response.toolCalls.length === 0) {
      return response;
    }

    return {
      ...response,
      toolCalls: response.toolCalls.map((toolCall) => ({
        ...toolCall,
        name: toCanonicalToolName(toolCall.name),
      })),
    };
  }
}

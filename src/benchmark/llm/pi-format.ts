import { Type } from '@mariozechner/pi-ai';
import type { Api, Context, Model, AssistantMessage, SimpleStreamOptions, Tool as PiTool } from '@mariozechner/pi-ai';
import { complete, completeSimple } from '@mariozechner/pi-ai';

import type { LLMResponse, McpToolDefinition, ToolExecutor } from '../types.js';
import { resolvePiModelByRef } from '../../runtime/pi/index.js';
import type { PiAuthMode } from '../../runtime/pi/auth.js';
import { createToolNameAliasCodec } from './tool-name-aliases.js';

interface PiCallParams {
  authMode?: PiAuthMode;
  apiKeyOverride?: string;
  apiKeyEnv?: string;
  headers?: Record<string, string>;
  timeout: number;
  modelId: string;
  system: string;
  user: string;
}

interface PiCallWithToolsParams extends PiCallParams {
  tools: McpToolDefinition[];
}

interface ResolvedPiRequest {
  model: Model<Api>;
  auth: {
    apiKey?: string;
    headers?: Record<string, string>;
  };
}

type PiImplementationSet = {
  resolve(
    modelId: string,
    authOptions?: {
      authMode?: PiAuthMode;
      apiKeyEnv?: string;
      apiKeyOverride?: string;
    },
  ): Promise<ResolvedPiRequest>;
  completeSimple(model: Model<Api>, context: Context, options?: SimpleStreamOptions): Promise<AssistantMessage>;
  complete(model: Model<Api>, context: Context, options?: SimpleStreamOptions): Promise<AssistantMessage>;
};

let piImplementationsForTest: PiImplementationSet | null = null;

export function __setPiImplementationsForTest(implementations: PiImplementationSet | null): void {
  piImplementationsForTest = implementations;
}

export async function chatPi(params: PiCallParams): Promise<LLMResponse> {
  const impl = getPiImplementations();
  const { model, auth } = await impl.resolve(params.modelId, {
    authMode: params.authMode,
    apiKeyEnv: params.apiKeyEnv,
    apiKeyOverride: params.apiKeyOverride,
  });
  const response = await impl.completeSimple(
    model,
    {
      systemPrompt: params.system,
      messages: [{ role: 'user', content: params.user, timestamp: Date.now() }],
    },
    buildPiOptions(params.timeout, auth, params.headers),
  );
  assertPiResponseSucceeded(response);
  return toLLMResponse(response);
}

export async function chatWithToolsPi(params: PiCallWithToolsParams): Promise<LLMResponse> {
  const impl = getPiImplementations();
  const toolCodec = createToolNameAliasCodec(params.tools);
  const { model, auth } = await impl.resolve(params.modelId, {
    authMode: params.authMode,
    apiKeyEnv: params.apiKeyEnv,
    apiKeyOverride: params.apiKeyOverride,
  });
  const response = await impl.complete(
    model,
    {
      systemPrompt: params.system,
      messages: [{ role: 'user', content: params.user, timestamp: Date.now() }],
      tools: toolCodec.tools.map(toPiTool),
    },
    buildPiOptions(params.timeout, auth, params.headers),
  );
  assertPiResponseSucceeded(response);
  return toLLMResponse(response, toolCodec.toCanonical);
}

interface PiAgentLoopParams extends PiCallWithToolsParams {
  executor: ToolExecutor;
  maxTurns: number;
}

export async function chatAgentLoopPi(params: PiAgentLoopParams): Promise<LLMResponse> {
  const impl = getPiImplementations();
  const toolCodec = createToolNameAliasCodec(params.tools);
  const { model, auth } = await impl.resolve(params.modelId, {
    authMode: params.authMode,
    apiKeyEnv: params.apiKeyEnv,
    apiKeyOverride: params.apiKeyOverride,
  });
  const messages: Context['messages'] = [
    { role: 'user', content: params.user, timestamp: Date.now() },
  ];
  const allToolCalls: Array<{ name: string; arguments: Record<string, unknown> }> = [];
  let finalResponse: LLMResponse = { content: '' };

  for (let turn = 0; turn < params.maxTurns; turn++) {
    const response = await impl.complete(
      model,
      {
        systemPrompt: params.system,
        messages,
        tools: toolCodec.tools.map(toPiTool),
      },
      buildPiOptions(params.timeout, auth, params.headers),
    );

    assertPiResponseSucceeded(response);
    finalResponse = toLLMResponse(response, toolCodec.toCanonical);
    if (!finalResponse.toolCalls || finalResponse.toolCalls.length === 0) {
      return {
        ...finalResponse,
        toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
      };
    }

    allToolCalls.push(...finalResponse.toolCalls);
    messages.push(response);

    const responseToolCalls = response.content.filter(
      (block): block is Extract<AssistantMessage['content'][number], { type: 'toolCall' }> => block.type === 'toolCall',
    );

    for (const toolCall of responseToolCalls) {
      const canonicalToolName = toolCodec.toCanonical(toolCall.name);
      let result: string;
      let isError = false;
      try {
        result = await params.executor(canonicalToolName, toolCall.arguments);
      } catch (error) {
        isError = true;
        result = `Error: ${error instanceof Error ? error.message : String(error)}`;
      }

      messages.push({
        role: 'toolResult',
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        content: [{ type: 'text', text: result }],
        isError,
        timestamp: Date.now(),
      });
    }
  }

  return {
    ...finalResponse,
    toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
  };
}

function getPiImplementations(): PiImplementationSet {
  if (piImplementationsForTest) {
    return piImplementationsForTest;
  }

  return {
    resolve: resolvePiRequest,
    completeSimple,
    complete,
  };
}

async function resolvePiRequest(
  modelId: string,
  authOptions?: {
    authMode?: PiAuthMode;
    apiKeyEnv?: string;
    apiKeyOverride?: string;
  },
): Promise<ResolvedPiRequest> {
  const resolved = await resolvePiModelByRef(modelId, authOptions);
  return {
    model: resolved.model,
    auth: {
      apiKey: resolved.auth.apiKey,
      headers: resolved.auth.headers,
    },
  };
}

function buildPiOptions(
  timeout: number,
  auth: { apiKey?: string; headers?: Record<string, string> },
  extraHeaders?: Record<string, string>,
): SimpleStreamOptions {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeout).unref?.();
  return {
    signal: controller.signal,
    apiKey: auth.apiKey,
    headers: { ...(auth.headers ?? {}), ...(extraHeaders ?? {}) },
    reasoning: 'medium',
  };
}

function toPiTool(tool: McpToolDefinition): PiTool {
  return {
    name: tool.function.name,
    description: tool.function.description ?? '',
    parameters: Type.Unsafe(tool.function.parameters ?? { type: 'object', properties: {}, required: [] }),
  };
}

function assertPiResponseSucceeded(message: AssistantMessage): void {
  if (message.stopReason === 'error') {
    throw new Error(message.errorMessage ?? 'PI model returned an unknown error');
  }
}

function toLLMResponse(
  message: AssistantMessage,
  toCanonicalToolName: (name: string) => string = (name) => name,
): LLMResponse {
  const content = message.content
    .filter((block): block is Extract<AssistantMessage['content'][number], { type: 'text' }> => block.type === 'text')
    .map((block) => block.text)
    .join('\n');

  const toolCalls = message.content
    .filter((block): block is Extract<AssistantMessage['content'][number], { type: 'toolCall' }> => block.type === 'toolCall')
    .map((block) => ({
      name: toCanonicalToolName(block.name),
      arguments: block.arguments as Record<string, unknown>,
    }));

  return {
    content,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    usage: {
      prompt: message.usage.input,
      completion: message.usage.output,
      total: message.usage.totalTokens,
    },
  };
}

import {
  createAgentSession,
  createBashTool,
  createEditTool,
  createFindTool,
  createGrepTool,
  createLsTool,
  createReadTool,
  createWriteTool,
  AuthStorage,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
  type ResourceLoader,
} from '@mariozechner/pi-coding-agent';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import { getModel, type Api, type Model } from '@mariozechner/pi-ai';
import { resolve } from 'node:path';

export function createWorkbenchPiTools(cwd: string): AgentTool<any>[] {
  return [
    createReadTool(cwd),
    createBashTool(cwd),
    createEditTool(cwd),
    createWriteTool(cwd),
    createGrepTool(cwd),
    createFindTool(cwd),
    createLsTool(cwd),
  ];
}

export async function createWorkbenchPiResourceLoader(params: { cwd: string }): Promise<ResourceLoader> {
  const cwd = resolve(params.cwd);
  const loader = new DefaultResourceLoader({
    cwd,
    noExtensions: true,
    additionalSkillPaths: [cwd],
    skillsOverride: (base) => ({
      skills: base.skills.filter((skill) => resolve(skill.filePath).startsWith(cwd)),
      diagnostics: base.diagnostics,
    }),
  });

  await loader.reload();
  return loader;
}

export async function createWorkbenchPiSession(params: {
  cwd: string;
  modelRef: string;
  apiKeyEnv?: string;
  thinkingLevel?: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
}) {
  const { provider, model } = parseModelRef(params.modelRef);
  if (provider !== 'openrouter') {
    throw new Error(`Workbench only supports OpenRouter model refs, got: ${params.modelRef}`);
  }

  const authStorage = AuthStorage.create();
  const apiKeyEnv = params.apiKeyEnv ?? 'OPENROUTER_API_KEY';
  const apiKey = process.env[apiKeyEnv];
  if (apiKey) {
    authStorage.setRuntimeApiKey('openrouter' as never, apiKey);
  }

  const modelRegistry = ModelRegistry.create(authStorage);
  const resolvedModel = modelRegistry.find(provider, model)
    ?? getModel(provider as never, model)
    ?? synthesizeOpenRouterModel(provider, model);
  if (!resolvedModel) {
    throw new Error(`Could not resolve Pi model ${provider}/${model}`);
  }

  const auth = await modelRegistry.getApiKeyAndHeaders(resolvedModel);
  if (!auth.ok) {
    throw new Error(auth.error);
  }

  const resourceLoader = await createWorkbenchPiResourceLoader({ cwd: params.cwd });

  return createAgentSession({
    cwd: params.cwd,
    model: resolvedModel,
    thinkingLevel: params.thinkingLevel ?? 'medium',
    authStorage,
    modelRegistry,
    resourceLoader,
    tools: createWorkbenchPiTools(params.cwd),
    sessionManager: SessionManager.inMemory(),
  });
}

function parseModelRef(modelRef: string): { provider: string; model: string } {
  const slash = modelRef.indexOf('/');
  if (slash <= 0 || slash === modelRef.length - 1) {
    throw new Error(`Invalid model ref: ${modelRef}`);
  }
  return {
    provider: modelRef.slice(0, slash),
    model: modelRef.slice(slash + 1),
  };
}

function synthesizeOpenRouterModel(provider: string, modelName: string): Model<Api> | undefined {
  if (provider !== 'openrouter') {
    return undefined;
  }

  return {
    id: modelName,
    name: modelName,
    api: 'openai-completions' as const,
    provider: 'openrouter' as const,
    baseUrl: 'https://openrouter.ai/api/v1',
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 16384,
  };
}

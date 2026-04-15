/**
 * Smoke tests for LLM format handlers (openai-format.ts, anthropic-format.ts, index.ts).
 * No test framework — uses simple assertion helpers.
 */

import { createLLMClient } from '../src/benchmark/llm/index.js';
import { __setPiImplementationsForTest } from '../src/benchmark/llm/pi-format.js';
import { resolveApiKey } from '../src/runtime/pi/auth.js';
import type { LLMConfig, McpToolDefinition } from '../src/benchmark/types.js';

// ---------------------------------------------------------------------------
// Assertion helpers
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e: any) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message}`);
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(
      `${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Fetch mock helpers
// ---------------------------------------------------------------------------

type MockFetch = (url: string | URL | Request, init?: RequestInit) => Promise<Response>;

function mockFetch(
  handler: (url: string, init: RequestInit) => { status: number; body: any },
): MockFetch {
  return async (url: string | URL | Request, init?: RequestInit) => {
    const urlStr = typeof url === 'string' ? url : url.toString();
    const result = handler(urlStr, init as RequestInit);
    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: { 'Content-Type': 'application/json' },
    });
  };
}

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

// Set a test API key in the environment before creating any client
process.env.__TEST_API_KEY__ = 'test-key-12345';

const openaiConfig: LLMConfig = {
  format: 'openai',
  baseUrl: 'https://api.test.com/v1',
  apiKeyEnv: '__TEST_API_KEY__',
  timeout: 5_000,
  models: [],
};

const anthropicConfig: LLMConfig = {
  format: 'anthropic',
  baseUrl: 'https://api.anthropic.com',
  apiKeyEnv: '__TEST_API_KEY__',
  timeout: 5_000,
  models: [],
};

const piConfig: LLMConfig = {
  format: 'pi',
  apiKeyEnv: '__TEST_API_KEY__',
  timeout: 5_000,
  models: [],
};

const sampleTools: McpToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Get the weather for a city',
      parameters: {
        type: 'object',
        properties: { city: { type: 'string' } },
        required: ['city'],
      },
    },
  },
];

const dottedSampleTools: McpToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'auth.status',
      description: 'Check session auth state',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
];

// ---------------------------------------------------------------------------
// Save original fetch so we can restore it after all tests
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

console.log('\n=== LLM Format Handler Smoke Tests ===\n');

// --- Group 1: createLLMClient factory ---

await test('createLLMClient: creates client for pi format', () => {
  const client = createLLMClient(piConfig);
  assert(typeof client.chat === 'function', 'client.chat should be a function');
  assert(typeof client.chatWithTools === 'function', 'client.chatWithTools should be a function');
});

await test('createLLMClient: creates client for openai format', () => {
  const client = createLLMClient(openaiConfig);
  assert(typeof client.chat === 'function', 'client.chat should be a function');
  assert(typeof client.chatWithTools === 'function', 'client.chatWithTools should be a function');
});

await test('createLLMClient: creates client for anthropic format', () => {
  const client = createLLMClient(anthropicConfig);
  assert(typeof client.chat === 'function', 'client.chat should be a function');
  assert(typeof client.chatWithTools === 'function', 'client.chatWithTools should be a function');
});

await test('createLLMClient: throws when apiKeyEnv is set but env var is missing', async () => {
  let threw = false;
  try {
    const client = createLLMClient({ ...openaiConfig, apiKeyEnv: '__MISSING_ENV_VAR_XYZ__' });
    await client.chat('gpt-5.4', 'sys', 'user');
  } catch (e: any) {
    threw = true;
    assert(
      e.message.includes('__MISSING_ENV_VAR_XYZ__'),
      'error message should mention the missing env var name',
    );
  }
  assert(threw, 'should have thrown for missing env var');
});

await test('pi format: uses provider/model id and runtime auth override for text chat', async () => {
  let capturedModel: string | null = null;
  let capturedAuthMode: string | undefined;
  let capturedApiKeyEnv: string | undefined;
  let capturedApiKey: string | undefined;

  __setPiImplementationsForTest({
    async resolve(modelId, authOptions) {
      capturedModel = modelId;
      capturedAuthMode = authOptions?.authMode;
      capturedApiKeyEnv = authOptions?.apiKeyEnv;
      capturedApiKey = authOptions?.apiKeyOverride;
      return {
        model: { id: 'openai/gpt-5.4', provider: 'openrouter', api: 'openai-completions', name: 'GPT-5.4' } as any,
        auth: { apiKey: 'test-key-12345', headers: { 'x-test-header': 'yes' } },
      };
    },
    async completeSimple(_model, context, options) {
      assertEqual(context.systemPrompt, 'sys', 'system prompt passed through');
      assertEqual((context.messages[0] as any).content, 'user', 'user content passed through');
      assertEqual(options?.apiKey, 'test-key-12345', 'api key override should be forwarded');
      assertEqual(options?.headers?.['x-test-header'], 'yes', 'resolved headers should be forwarded');
      return {
        role: 'assistant',
        api: 'openai-completions',
        provider: 'openrouter',
        model: 'openai/gpt-5.4',
        stopReason: 'stop',
        timestamp: Date.now(),
        usage: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0, totalTokens: 3, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        content: [{ type: 'text', text: 'hello from pi' }],
      } as any;
    },
    async complete() {
      throw new Error('unexpected complete() call');
    },
  });

  const client = createLLMClient(piConfig);
  const result = await client.chat('openrouter/openai/gpt-5.4', 'sys', 'user');

  assertEqual(capturedModel, 'openrouter/openai/gpt-5.4', 'model id should be resolved through pi');
  assertEqual(capturedAuthMode, undefined, 'default auth mode should be passed through as undefined');
  assertEqual(capturedApiKeyEnv, '__TEST_API_KEY__', 'api key env should be forwarded to pi resolution');
  assertEqual(capturedApiKey, undefined, 'pi resolution should now read the configured env var itself');
  assertEqual(result.content, 'hello from pi', 'pi text response should be surfaced');

  __setPiImplementationsForTest(null);
});

await test('pi format: converts tool calls for MCP chat', async () => {
  __setPiImplementationsForTest({
    async resolve() {
      return {
        model: { id: 'openai/gpt-5.4', provider: 'openrouter', api: 'openai-completions', name: 'GPT-5.4' } as any,
        auth: { apiKey: 'test-key-12345', headers: {} },
      };
    },
    async completeSimple() {
      throw new Error('unexpected completeSimple() call');
    },
    async complete(_model, context, options) {
      assert(Array.isArray(context.tools), 'tools should be passed to pi complete()');
      assertEqual(context.tools?.[0]?.name, 'get_weather', 'tool name should be preserved');
      assertEqual(options?.apiKey, 'test-key-12345', 'resolved auth should be forwarded');
      return {
        role: 'assistant',
        api: 'openai-completions',
        provider: 'openrouter',
        model: 'openai/gpt-5.4',
        stopReason: 'toolUse',
        timestamp: Date.now(),
        usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        content: [
          { type: 'toolCall', id: 'call-1', name: 'get_weather', arguments: { city: 'NYC' } },
        ],
      } as any;
    },
  });

  const client = createLLMClient(piConfig);
  const result = await client.chatWithTools('openrouter/openai/gpt-5.4', 'sys', 'user', sampleTools);

  assertEqual(result.toolCalls?.[0]?.name, 'get_weather', 'pi tool call name should be surfaced');
  assertEqual((result.toolCalls?.[0]?.arguments as any).city, 'NYC', 'pi tool call args should be surfaced');

  __setPiImplementationsForTest(null);
});

await test('pi format: sanitizes dotted MCP tool names and maps them back', async () => {
  __setPiImplementationsForTest({
    async resolve() {
      return {
        model: { id: 'gpt-5.4', provider: 'openai-codex', api: 'openai-codex-responses', name: 'GPT-5.4' } as any,
        auth: { apiKey: 'codex-access-token', headers: {} },
      };
    },
    async completeSimple() {
      throw new Error('unexpected completeSimple() call');
    },
    async complete(_model, context) {
      assert(Array.isArray(context.tools), 'tools should be passed to pi complete()');
      assertEqual(context.tools?.[0]?.name, 'auth_status', 'tool name should be sanitized for provider request');
      return {
        role: 'assistant',
        api: 'openai-codex-responses',
        provider: 'openai-codex',
        model: 'gpt-5.4',
        stopReason: 'toolUse',
        timestamp: Date.now(),
        usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        content: [
          { type: 'toolCall', id: 'call-1', name: 'auth_status', arguments: {} },
        ],
      } as any;
    },
  });

  const client = createLLMClient({ ...piConfig, authMode: 'codex' });
  const result = await client.chatWithTools('openai/gpt-5.4', 'sys', 'user', dottedSampleTools);

  assertEqual(result.toolCalls?.[0]?.name, 'auth.status', 'tool call name should map back to canonical form');

  __setPiImplementationsForTest(null);
});

await test('pi format: throws provider-side errors instead of returning empty output', async () => {
  __setPiImplementationsForTest({
    async resolve() {
      return {
        model: { id: 'gpt-5.4', provider: 'openai-codex', api: 'openai-codex-responses', name: 'GPT-5.4' } as any,
        auth: { apiKey: 'codex-access-token', headers: {} },
      };
    },
    async completeSimple() {
      throw new Error('unexpected completeSimple() call');
    },
    async complete() {
      return {
        role: 'assistant',
        api: 'openai-codex-responses',
        provider: 'openai-codex',
        model: 'gpt-5.4',
        stopReason: 'error',
        errorMessage: 'Invalid tool schema',
        timestamp: Date.now(),
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        content: [],
      } as any;
    },
  });

  const client = createLLMClient({ ...piConfig, authMode: 'codex' });
  let threw = false;
  try {
    await client.chatWithTools('openai/gpt-5.4', 'sys', 'user', dottedSampleTools);
  } catch (e: any) {
    threw = true;
    assert(
      e.message.includes('Invalid tool schema'),
      'provider-side error message should surface to the caller',
    );
  }
  assert(threw, 'chatWithTools should throw when the provider reports an error');

  __setPiImplementationsForTest(null);
});

await test('resolveApiKey: codex auth reads browser-login access token from ~/.codex/auth.json', async () => {
  const originalHome = process.env.HOME;
  const dir = await import('node:fs/promises').then(({ mkdtemp, mkdir, writeFile }) => ({ mkdtemp, mkdir, writeFile }));
  const os = await import('node:os');
  const path = await import('node:path');
  const tmpHome = await dir.mkdtemp(path.join(os.tmpdir(), 'codex-auth-'));
  const codexDir = path.join(tmpHome, '.codex');
  await dir.mkdir(codexDir, { recursive: true });
  const futureExp = Math.floor(Date.now() / 1000) + 3600;
  const jwt = [
    Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url'),
    Buffer.from(JSON.stringify({ exp: futureExp })).toString('base64url'),
    'sig',
  ].join('.');
  await dir.writeFile(
    path.join(codexDir, 'auth.json'),
    JSON.stringify({ auth_mode: 'chatgpt', tokens: { access_token: jwt } }),
    'utf-8',
  );
  process.env.HOME = tmpHome;

  try {
    const result = resolveApiKey({ provider: 'openai', authMode: 'codex' });
    assertEqual(result, jwt, 'browser-login access token should be returned');
  } finally {
    process.env.HOME = originalHome;
  }
});

await test('openai format: codex auth bridges through pi with openai provider refs', async () => {
  const originalHome = process.env.HOME;
  const dir = await import('node:fs/promises').then(({ mkdtemp, mkdir, writeFile }) => ({ mkdtemp, mkdir, writeFile }));
  const os = await import('node:os');
  const path = await import('node:path');
  const tmpHome = await dir.mkdtemp(path.join(os.tmpdir(), 'codex-bridge-auth-'));
  const codexDir = path.join(tmpHome, '.codex');
  await dir.mkdir(codexDir, { recursive: true });
  const futureExp = Math.floor(Date.now() / 1000) + 3600;
  const jwt = [
    Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url'),
    Buffer.from(JSON.stringify({ exp: futureExp })).toString('base64url'),
    'sig',
  ].join('.');
  await dir.writeFile(
    path.join(codexDir, 'auth.json'),
    JSON.stringify({ auth_mode: 'chatgpt', tokens: { access_token: jwt } }),
    'utf-8',
  );
  process.env.HOME = tmpHome;

  let capturedModel: string | null = null;

  __setPiImplementationsForTest({
    async resolve(modelId) {
      capturedModel = modelId;
      return {
        model: { id: 'gpt-5.4', provider: 'openai-codex', api: 'openai-codex-responses', name: 'GPT-5.4' } as any,
        auth: { apiKey: 'codex-access-token', headers: {} },
      };
    },
    async completeSimple(_model, context, options) {
      assertEqual(context.systemPrompt, 'sys', 'system prompt passed through');
      assertEqual((context.messages[0] as any).content, 'user', 'user content passed through');
      assertEqual(options?.apiKey, 'codex-access-token', 'codex token should flow through pi');
      return {
        role: 'assistant',
        api: 'openai-codex-responses',
        provider: 'openai-codex',
        model: 'gpt-5.4',
        stopReason: 'stop',
        timestamp: Date.now(),
        usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        content: [{ type: 'text', text: 'hello from codex auth' }],
      } as any;
    },
    async complete() {
      throw new Error('unexpected complete() call');
    },
  });

  try {
    const client = createLLMClient({
      format: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      authMode: 'codex',
      models: [],
    });
    const result = await client.chat('gpt-5.4', 'sys', 'user');
    assertEqual(capturedModel, 'openai/gpt-5.4', 'openai-format codex auth should bridge to pi using provider/model form');
    assertEqual(result.content, 'hello from codex auth', 'codex-auth bridged response should be returned');
  } finally {
    process.env.HOME = originalHome;
    __setPiImplementationsForTest(null);
  }
});

await test('openai format: codex bridge passes apiKeyOverride (not authMode/apiKeyEnv) to pi call', async () => {
  const originalHome = process.env.HOME;
  const dir = await import('node:fs/promises').then(({ mkdtemp, mkdir, writeFile }) => ({ mkdtemp, mkdir, writeFile }));
  const os = await import('node:os');
  const path = await import('node:path');
  const tmpHome = await dir.mkdtemp(path.join(os.tmpdir(), 'codex-override-auth-'));
  const codexDir = path.join(tmpHome, '.codex');
  await dir.mkdir(codexDir, { recursive: true });
  const futureExp = Math.floor(Date.now() / 1000) + 3600;
  const jwt = [
    Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url'),
    Buffer.from(JSON.stringify({ exp: futureExp })).toString('base64url'),
    'sig',
  ].join('.');
  await dir.writeFile(
    path.join(codexDir, 'auth.json'),
    JSON.stringify({ auth_mode: 'chatgpt', tokens: { access_token: jwt } }),
    'utf-8',
  );
  process.env.HOME = tmpHome;

  let capturedAuthMode: string | undefined = 'NOT_SET';
  let capturedApiKeyEnv: string | undefined = 'NOT_SET';
  let capturedApiKeyOverride: string | undefined = 'NOT_SET';

  __setPiImplementationsForTest({
    async resolve(_modelId, authOptions) {
      capturedAuthMode = authOptions?.authMode;
      capturedApiKeyEnv = authOptions?.apiKeyEnv;
      capturedApiKeyOverride = authOptions?.apiKeyOverride;
      return {
        model: { id: 'gpt-5.4', provider: 'openai-codex', api: 'openai-codex-responses', name: 'GPT-5.4' } as any,
        auth: { apiKey: jwt, headers: {} },
      };
    },
    async completeSimple() {
      return {
        role: 'assistant',
        api: 'openai-codex-responses',
        provider: 'openai-codex',
        model: 'gpt-5.4',
        stopReason: 'stop',
        timestamp: Date.now(),
        usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        content: [{ type: 'text', text: 'ok' }],
      } as any;
    },
    async complete() {
      throw new Error('unexpected complete() call');
    },
  });

  try {
    const client = createLLMClient({
      format: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      authMode: 'codex',
      models: [],
    });
    await client.chat('gpt-5.4', 'sys', 'user');

    assertEqual(capturedApiKeyOverride, jwt, 'codex bridge should pass pre-resolved JWT as apiKeyOverride');
    assert(capturedAuthMode === undefined, `codex bridge should NOT pass authMode to pi (got: ${capturedAuthMode})`);
    assert(capturedApiKeyEnv === undefined, `codex bridge should NOT pass apiKeyEnv to pi (got: ${capturedApiKeyEnv})`);
  } finally {
    process.env.HOME = originalHome;
    __setPiImplementationsForTest(null);
  }
});

await test('openai format: codex bridge passes apiKeyOverride (not authMode/apiKeyEnv) to pi call for chatWithTools', async () => {
  const originalHome = process.env.HOME;
  const dir = await import('node:fs/promises').then(({ mkdtemp, mkdir, writeFile }) => ({ mkdtemp, mkdir, writeFile }));
  const os = await import('node:os');
  const path = await import('node:path');
  const tmpHome = await dir.mkdtemp(path.join(os.tmpdir(), 'codex-override-tools-'));
  const codexDir = path.join(tmpHome, '.codex');
  await dir.mkdir(codexDir, { recursive: true });
  const futureExp = Math.floor(Date.now() / 1000) + 3600;
  const jwt = [
    Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url'),
    Buffer.from(JSON.stringify({ exp: futureExp })).toString('base64url'),
    'sig',
  ].join('.');
  await dir.writeFile(
    path.join(codexDir, 'auth.json'),
    JSON.stringify({ auth_mode: 'chatgpt', tokens: { access_token: jwt } }),
    'utf-8',
  );
  process.env.HOME = tmpHome;

  let capturedAuthMode: string | undefined = 'NOT_SET';
  let capturedApiKeyEnv: string | undefined = 'NOT_SET';
  let capturedApiKeyOverride: string | undefined = 'NOT_SET';

  __setPiImplementationsForTest({
    async resolve(_modelId, authOptions) {
      capturedAuthMode = authOptions?.authMode;
      capturedApiKeyEnv = authOptions?.apiKeyEnv;
      capturedApiKeyOverride = authOptions?.apiKeyOverride;
      return {
        model: { id: 'gpt-5.4', provider: 'openai-codex', api: 'openai-codex-responses', name: 'GPT-5.4' } as any,
        auth: { apiKey: jwt, headers: {} },
      };
    },
    async completeSimple() {
      throw new Error('unexpected completeSimple() call');
    },
    async complete() {
      return {
        role: 'assistant',
        api: 'openai-codex-responses',
        provider: 'openai-codex',
        model: 'gpt-5.4',
        stopReason: 'stop',
        timestamp: Date.now(),
        usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        content: [{ type: 'text', text: 'ok' }],
      } as any;
    },
  });

  try {
    const client = createLLMClient({
      format: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      authMode: 'codex',
      models: [],
    });
    await client.chatWithTools('gpt-5.4', 'sys', 'user', sampleTools);

    assertEqual(capturedApiKeyOverride, jwt, 'codex bridge should pass pre-resolved JWT as apiKeyOverride (chatWithTools)');
    assert(capturedAuthMode === undefined, `codex bridge should NOT pass authMode to pi (got: ${capturedAuthMode})`);
    assert(capturedApiKeyEnv === undefined, `codex bridge should NOT pass apiKeyEnv to pi (got: ${capturedApiKeyEnv})`);
  } finally {
    process.env.HOME = originalHome;
    __setPiImplementationsForTest(null);
  }
});

await test('openai format: codex bridge passes apiKeyOverride (not authMode/apiKeyEnv) to pi call for chatAgentLoop', async () => {
  const originalHome = process.env.HOME;
  const dir = await import('node:fs/promises').then(({ mkdtemp, mkdir, writeFile }) => ({ mkdtemp, mkdir, writeFile }));
  const os = await import('node:os');
  const path = await import('node:path');
  const tmpHome = await dir.mkdtemp(path.join(os.tmpdir(), 'codex-override-agent-'));
  const codexDir = path.join(tmpHome, '.codex');
  await dir.mkdir(codexDir, { recursive: true });
  const futureExp = Math.floor(Date.now() / 1000) + 3600;
  const jwt = [
    Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url'),
    Buffer.from(JSON.stringify({ exp: futureExp })).toString('base64url'),
    'sig',
  ].join('.');
  await dir.writeFile(
    path.join(codexDir, 'auth.json'),
    JSON.stringify({ auth_mode: 'chatgpt', tokens: { access_token: jwt } }),
    'utf-8',
  );
  process.env.HOME = tmpHome;

  let capturedAuthMode: string | undefined = 'NOT_SET';
  let capturedApiKeyEnv: string | undefined = 'NOT_SET';
  let capturedApiKeyOverride: string | undefined = 'NOT_SET';

  __setPiImplementationsForTest({
    async resolve(_modelId, authOptions) {
      capturedAuthMode = authOptions?.authMode;
      capturedApiKeyEnv = authOptions?.apiKeyEnv;
      capturedApiKeyOverride = authOptions?.apiKeyOverride;
      return {
        model: { id: 'gpt-5.4', provider: 'openai-codex', api: 'openai-codex-responses', name: 'GPT-5.4' } as any,
        auth: { apiKey: jwt, headers: {} },
      };
    },
    async completeSimple() {
      throw new Error('unexpected completeSimple() call');
    },
    async complete() {
      return {
        role: 'assistant',
        api: 'openai-codex-responses',
        provider: 'openai-codex',
        model: 'gpt-5.4',
        stopReason: 'stop',
        timestamp: Date.now(),
        usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        content: [{ type: 'text', text: 'ok' }],
      } as any;
    },
  });

  try {
    const client = createLLMClient({
      format: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      authMode: 'codex',
      models: [],
    });
    const dummyExecutor = async () => 'result';
    await client.chatAgentLoop('gpt-5.4', 'sys', 'user', sampleTools, dummyExecutor);

    assertEqual(capturedApiKeyOverride, jwt, 'codex bridge should pass pre-resolved JWT as apiKeyOverride (chatAgentLoop)');
    assert(capturedAuthMode === undefined, `codex bridge should NOT pass authMode to pi (got: ${capturedAuthMode})`);
    assert(capturedApiKeyEnv === undefined, `codex bridge should NOT pass apiKeyEnv to pi (got: ${capturedApiKeyEnv})`);
  } finally {
    process.env.HOME = originalHome;
    __setPiImplementationsForTest(null);
  }
});

await test('pi format: agent loop feeds tool results back with original tool call ids', async () => {
  const toolCallIds: string[] = [];
  let callCount = 0;

  __setPiImplementationsForTest({
    async resolve() {
      return {
        model: { id: 'openai/gpt-5.4', provider: 'openrouter', api: 'openai-completions', name: 'GPT-5.4' } as any,
        auth: { apiKey: 'test-key-12345', headers: {} },
      };
    },
    async completeSimple() {
      throw new Error('unexpected completeSimple() call');
    },
    async complete(_model, context) {
      callCount += 1;
      if (callCount === 1) {
        return {
          role: 'assistant',
          api: 'openai-completions',
          provider: 'openrouter',
          model: 'openai/gpt-5.4',
          stopReason: 'toolUse',
          timestamp: Date.now(),
          usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
          content: [
            { type: 'toolCall', id: 'tool-123', name: 'get_weather', arguments: { city: 'NYC' } },
          ],
        } as any;
      }

      const toolResult = context.messages[context.messages.length - 1] as any;
      toolCallIds.push(toolResult.toolCallId);
      return {
        role: 'assistant',
        api: 'openai-completions',
        provider: 'openrouter',
        model: 'openai/gpt-5.4',
        stopReason: 'stop',
        timestamp: Date.now(),
        usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        content: [{ type: 'text', text: 'done' }],
      } as any;
    },
  });

  const client = createLLMClient(piConfig);
  const result = await client.chatAgentLoop('openrouter/openai/gpt-5.4', 'sys', 'user', sampleTools, async () => 'sunny', 3);

  assertEqual(toolCallIds[0], 'tool-123', 'tool result should reference original tool call id');
  assertEqual(result.content, 'done', 'final agent-loop text should be returned');

  __setPiImplementationsForTest(null);
});

// --- Group 2: OpenAI format handler ---

await test('openai format: sends correct request body', async () => {
  let capturedBody: any = null;
  let capturedHeaders: Record<string, string> = {};

  globalThis.fetch = mockFetch((url, init) => {
    capturedBody = JSON.parse(init.body as string);
    capturedHeaders = (init.headers as Record<string, string>) ?? {};
    return {
      status: 200,
      body: {
        choices: [{ message: { content: 'ok' } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      },
    };
  }) as any;

  const client = createLLMClient(openaiConfig);
  await client.chat('gpt-4o', 'You are a helper.', 'Hello');

  assert(capturedBody !== null, 'fetch should have been called');
  assertEqual(capturedBody.model, 'gpt-4o', 'model field');
  assert(Array.isArray(capturedBody.messages), 'messages should be an array');
  const roles = capturedBody.messages.map((m: any) => m.role);
  assert(roles.includes('system'), 'messages should contain a system role');
  assert(roles.includes('user'), 'messages should contain a user role');
  const systemMsg = capturedBody.messages.find((m: any) => m.role === 'system');
  assertEqual(systemMsg.content, 'You are a helper.', 'system message content');
  const userMsg = capturedBody.messages.find((m: any) => m.role === 'user');
  assertEqual(userMsg.content, 'Hello', 'user message content');
  assertEqual(
    capturedHeaders['Authorization'],
    'Bearer test-key-12345',
    'Authorization header',
  );
}) ;

await test('openai format: posts to /chat/completions endpoint', async () => {
  let capturedUrl = '';

  globalThis.fetch = mockFetch((url) => {
    capturedUrl = url;
    return {
      status: 200,
      body: {
        choices: [{ message: { content: 'ok' } }],
      },
    };
  }) as any;

  const client = createLLMClient(openaiConfig);
  await client.chat('gpt-4o', 'sys', 'user');

  assert(
    capturedUrl.endsWith('/chat/completions'),
    `URL should end with /chat/completions, got: ${capturedUrl}`,
  );
});

await test('openai format: parses chat response', async () => {
  globalThis.fetch = mockFetch(() => ({
    status: 200,
    body: {
      choices: [{ message: { content: 'Hello from OpenAI' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    },
  })) as any;

  const client = createLLMClient(openaiConfig);
  const result = await client.chat('gpt-4o', 'sys', 'user');

  assertEqual(result.content, 'Hello from OpenAI', 'content');
  assert(result.usage !== undefined, 'usage should be present');
  assertEqual(result.usage!.prompt, 10, 'usage.prompt');
  assertEqual(result.usage!.completion, 5, 'usage.completion');
  assertEqual(result.usage!.total, 15, 'usage.total');
});

await test('openai format: parses tool_calls response', async () => {
  globalThis.fetch = mockFetch(() => ({
    status: 200,
    body: {
      choices: [
        {
          message: {
            content: '',
            tool_calls: [
              {
                function: {
                  name: 'get_weather',
                  arguments: '{"city":"NYC"}',
                },
              },
            ],
          },
        },
      ],
    },
  })) as any;

  const client = createLLMClient(openaiConfig);
  const result = await client.chatWithTools('gpt-4o', 'sys', 'user', sampleTools);

  assert(result.toolCalls !== undefined, 'toolCalls should be present');
  assert(result.toolCalls!.length === 1, 'should have exactly one tool call');
  assertEqual(result.toolCalls![0].name, 'get_weather', 'tool call name');
  assertEqual(
    (result.toolCalls![0].arguments as any).city,
    'NYC',
    'tool call argument city',
  );
});

await test('openai format: sanitizes dotted tool names in requests and maps them back in responses', async () => {
  let capturedBody: any = null;

  globalThis.fetch = mockFetch((_url, init) => {
    capturedBody = JSON.parse(init.body as string);
    return {
      status: 200,
      body: {
        choices: [
          {
            message: {
              content: '',
              tool_calls: [
                {
                  function: {
                    name: 'auth_status',
                    arguments: '{}',
                  },
                },
              ],
            },
          },
        ],
      },
    };
  }) as any;

  const client = createLLMClient(openaiConfig);
  const result = await client.chatWithTools('gpt-4o', 'sys', 'user', dottedSampleTools);

  assertEqual(
    capturedBody.tools[0].function.name,
    'auth_status',
    'dotted tool name should be sanitized in the request body',
  );
  assertEqual(
    result.toolCalls?.[0]?.name,
    'auth.status',
    'sanitized tool call names should map back to canonical form',
  );
});

await test('openai format: handles non-200 response', async () => {
  // The retry logic retries once after 3s on any non-AbortError.
  // To avoid a 3s delay in tests, we make both attempts fail immediately.
  let callCount = 0;
  globalThis.fetch = mockFetch(() => {
    callCount++;
    return {
      status: 429,
      body: { error: { message: 'Rate limit exceeded' } },
    };
  }) as any;

  const client = createLLMClient(openaiConfig);
  let threw = false;
  try {
    // Override the retry delay by patching setTimeout — instead, just catch the error.
    // The retry waits 3s; we accept the delay here since it's a single retry.
    // To keep tests fast, we mock fetch to succeed on the second call.
    await client.chat('gpt-4o', 'sys', 'user');
  } catch (e: any) {
    threw = true;
    assert(
      e.message.includes('429'),
      `error message should include status code 429, got: ${e.message}`,
    );
  }
  assert(threw, 'should have thrown on non-200 response');
}, );

// --- Group 3: Anthropic format handler ---

await test('anthropic format: sends correct headers', async () => {
  let capturedHeaders: Record<string, string> = {};

  globalThis.fetch = mockFetch((_url, init) => {
    capturedHeaders = (init.headers as Record<string, string>) ?? {};
    return {
      status: 200,
      body: {
        content: [{ type: 'text', text: 'ok' }],
        usage: { input_tokens: 1, output_tokens: 1 },
      },
    };
  }) as any;

  const client = createLLMClient(anthropicConfig);
  await client.chat('claude-3-5-sonnet-20241022', 'sys', 'user');

  assertEqual(
    capturedHeaders['x-api-key'],
    'test-key-12345',
    'x-api-key header',
  );
  assert(
    capturedHeaders['anthropic-version'] !== undefined,
    'anthropic-version header should be present',
  );
  assert(
    capturedHeaders['Authorization'] === undefined,
    'should NOT have Authorization header (Anthropic uses x-api-key)',
  );
});

await test('anthropic format: correct request body format', async () => {
  let capturedBody: any = null;

  globalThis.fetch = mockFetch((_url, init) => {
    capturedBody = JSON.parse(init.body as string);
    return {
      status: 200,
      body: {
        content: [{ type: 'text', text: 'ok' }],
      },
    };
  }) as any;

  const client = createLLMClient(anthropicConfig);
  await client.chat('claude-3-5-sonnet-20241022', 'You are a helper.', 'Hello');

  assert(capturedBody !== null, 'fetch should have been called');
  assertEqual(capturedBody.model, 'claude-3-5-sonnet-20241022', 'model field');
  // Anthropic puts system as a top-level field, NOT inside messages
  assertEqual(capturedBody.system, 'You are a helper.', 'system field at top level');
  assert(Array.isArray(capturedBody.messages), 'messages should be an array');
  // Only user message in messages array (no system role)
  const roles = capturedBody.messages.map((m: any) => m.role);
  assert(!roles.includes('system'), 'messages array should NOT contain a system role');
  assert(roles.includes('user'), 'messages array should contain a user role');
  const userMsg = capturedBody.messages.find((m: any) => m.role === 'user');
  assertEqual(userMsg.content, 'Hello', 'user message content');
});

await test('anthropic format: posts to /v1/messages endpoint', async () => {
  let capturedUrl = '';

  globalThis.fetch = mockFetch((url) => {
    capturedUrl = url;
    return {
      status: 200,
      body: { content: [{ type: 'text', text: 'ok' }] },
    };
  }) as any;

  const client = createLLMClient(anthropicConfig);
  await client.chat('claude-3-5-sonnet-20241022', 'sys', 'user');

  assert(
    capturedUrl.endsWith('/v1/messages'),
    `URL should end with /v1/messages, got: ${capturedUrl}`,
  );
});

await test('anthropic format: parses response', async () => {
  globalThis.fetch = mockFetch(() => ({
    status: 200,
    body: {
      content: [{ type: 'text', text: 'Hello from Anthropic' }],
      usage: { input_tokens: 10, output_tokens: 5 },
    },
  })) as any;

  const client = createLLMClient(anthropicConfig);
  const result = await client.chat('claude-3-5-sonnet-20241022', 'sys', 'user');

  assertEqual(result.content, 'Hello from Anthropic', 'content');
  assert(result.usage !== undefined, 'usage should be present');
  // Anthropic maps input_tokens -> prompt, output_tokens -> completion, sum -> total
  assertEqual(result.usage!.prompt, 10, 'usage.prompt (input_tokens)');
  assertEqual(result.usage!.completion, 5, 'usage.completion (output_tokens)');
  assertEqual(result.usage!.total, 15, 'usage.total (input + output)');
});

await test('anthropic format: parses tool_use response', async () => {
  globalThis.fetch = mockFetch(() => ({
    status: 200,
    body: {
      content: [
        {
          type: 'tool_use',
          id: '123',
          name: 'get_weather',
          input: { city: 'NYC' },
        },
      ],
    },
  })) as any;

  const client = createLLMClient(anthropicConfig);
  const result = await client.chatWithTools(
    'claude-3-5-sonnet-20241022',
    'sys',
    'user',
    sampleTools,
  );

  assert(result.toolCalls !== undefined, 'toolCalls should be present');
  assert(result.toolCalls!.length === 1, 'should have exactly one tool call');
  assertEqual(result.toolCalls![0].name, 'get_weather', 'tool call name');
  assertEqual(
    (result.toolCalls![0].arguments as any).city,
    'NYC',
    'tool call argument city',
  );
});

await test('anthropic format: converts McpToolDefinition to Anthropic tool format', async () => {
  let capturedBody: any = null;

  globalThis.fetch = mockFetch((_url, init) => {
    capturedBody = JSON.parse(init.body as string);
    return {
      status: 200,
      body: { content: [{ type: 'text', text: 'ok' }] },
    };
  }) as any;

  const client = createLLMClient(anthropicConfig);
  await client.chatWithTools('claude-3-5-sonnet-20241022', 'sys', 'user', sampleTools);

  assert(Array.isArray(capturedBody.tools), 'tools should be an array in request body');
  const tool = capturedBody.tools[0];
  assertEqual(tool.name, 'get_weather', 'tool name');
  assertEqual(tool.description, 'Get the weather for a city', 'tool description');
  assert(tool.input_schema !== undefined, 'tool should have input_schema (not parameters)');
  assertEqual(tool.input_schema.type, 'object', 'input_schema.type');
  assert(
    tool.parameters === undefined,
    'Anthropic format should use input_schema, not parameters',
  );
});

// ---------------------------------------------------------------------------
// Provider prefix stripping for direct API formats
// ---------------------------------------------------------------------------

await test('anthropic format: strips provider prefix from model ID', async () => {
  let capturedBody: any = null;

  globalThis.fetch = mockFetch((_url, init) => {
    capturedBody = JSON.parse(init.body as string);
    return {
      status: 200,
      body: {
        content: [{ type: 'text', text: 'ok' }],
      },
    };
  }) as any;

  const client = createLLMClient(anthropicConfig);
  // Pass a prefixed model ID like the config validation requires
  await client.chat('anthropic/claude-sonnet-4-6', 'system', 'user');

  assert(capturedBody !== null, 'fetch should have been called');
  assertEqual(
    capturedBody.model,
    'claude-sonnet-4-6',
    'model field should have provider prefix stripped for direct Anthropic API',
  );
});

await test('anthropic format: strips provider prefix in chatWithTools', async () => {
  let capturedBody: any = null;

  globalThis.fetch = mockFetch((_url, init) => {
    capturedBody = JSON.parse(init.body as string);
    return {
      status: 200,
      body: {
        content: [{ type: 'text', text: 'no tools needed' }],
        stop_reason: 'end_turn',
      },
    };
  }) as any;

  const tools: McpToolDefinition[] = [
    {
      type: 'function',
      function: {
        name: 'test_tool',
        description: 'A test tool',
        parameters: { type: 'object', properties: {} },
      },
    },
  ];

  const client = createLLMClient(anthropicConfig);
  await client.chatWithTools('anthropic/claude-sonnet-4-6', 'system', 'user', tools);

  assert(capturedBody !== null, 'fetch should have been called');
  assertEqual(
    capturedBody.model,
    'claude-sonnet-4-6',
    'model field should have provider prefix stripped in chatWithTools',
  );
});

await test('anthropic format: strips provider prefix in chatAgentLoop', async () => {
  let capturedBody: any = null;

  globalThis.fetch = mockFetch((_url, init) => {
    capturedBody = JSON.parse(init.body as string);
    return {
      status: 200,
      body: {
        content: [{ type: 'text', text: 'no tools needed' }],
        stop_reason: 'end_turn',
      },
    };
  }) as any;

  const tools: McpToolDefinition[] = [
    {
      type: 'function',
      function: {
        name: 'test_tool',
        description: 'A test tool',
        parameters: { type: 'object', properties: {} },
      },
    },
  ];

  const client = createLLMClient(anthropicConfig);
  await client.chatAgentLoop('anthropic/claude-sonnet-4-6', 'system', 'user', tools, async () => 'result');

  assert(capturedBody !== null, 'fetch should have been called');
  assertEqual(
    capturedBody.model,
    'claude-sonnet-4-6',
    'model field should have provider prefix stripped in chatAgentLoop',
  );
});

await test('anthropic format: does not strip when no prefix present', async () => {
  let capturedBody: any = null;

  globalThis.fetch = mockFetch((_url, init) => {
    capturedBody = JSON.parse(init.body as string);
    return {
      status: 200,
      body: {
        content: [{ type: 'text', text: 'ok' }],
      },
    };
  }) as any;

  const client = createLLMClient(anthropicConfig);
  await client.chat('claude-sonnet-4-6', 'system', 'user');

  assert(capturedBody !== null, 'fetch should have been called');
  assertEqual(
    capturedBody.model,
    'claude-sonnet-4-6',
    'model field should remain unchanged when no prefix',
  );
});

await test('openai format: strips provider prefix from model ID', async () => {
  let capturedBody: any = null;

  const openaiConfig: LLMConfig = {
    format: 'openai',
    baseUrl: 'https://api.openai.com',
    apiKeyEnv: 'OPENAI_API_KEY',
    timeout: 5000,
    models: [],
  };

  globalThis.fetch = mockFetch((_url, init) => {
    capturedBody = JSON.parse(init.body as string);
    return {
      status: 200,
      body: {
        choices: [{ message: { role: 'assistant', content: 'ok' } }],
      },
    };
  }) as any;

  // Temporarily set the env var so createLLMClient doesn't throw.
  // Capture and restore the original value so we don't clobber it in CI.
  const hadOpenAiApiKey = Object.prototype.hasOwnProperty.call(process.env, 'OPENAI_API_KEY');
  const previousOpenAiApiKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-key';
  const client = createLLMClient(openaiConfig);
  try {
    await client.chat('openai/gpt-4o', 'system', 'user');
  } finally {
    if (hadOpenAiApiKey) {
      process.env.OPENAI_API_KEY = previousOpenAiApiKey;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
  }

  assert(capturedBody !== null, 'fetch should have been called');
  assertEqual(
    capturedBody.model,
    'gpt-4o',
    'model field should have provider prefix stripped for direct OpenAI API',
  );
});

await test('anthropic format: leaves openrouter/-prefixed model ID unchanged', async () => {
  // openrouter/ IDs belong to format:'pi'. If one appears with format:'anthropic',
  // the config is misconfigured — we pass it through unchanged so the Anthropic API
  // returns a fast, visible error rather than silently misrouting the request.
  let capturedBody: any = null;

  globalThis.fetch = mockFetch((_url, init) => {
    capturedBody = JSON.parse(init.body as string);
    return {
      status: 200,
      body: {
        content: [{ type: 'text', text: 'ok' }],
      },
    };
  }) as any;

  const client = createLLMClient(anthropicConfig);
  await client.chat('openrouter/anthropic/claude-sonnet-4-6', 'system', 'user');

  assert(capturedBody !== null, 'fetch should have been called');
  assertEqual(
    capturedBody.model,
    'openrouter/anthropic/claude-sonnet-4-6',
    'openrouter/ prefix should be left intact — not silently stripped',
  );
});

// NOTE: pi format prefix preservation is already covered by existing
// "pi format: uses provider/model id" tests above. The prefix stripping
// only applies to anthropic and openai direct formats.

// ---------------------------------------------------------------------------
// Restore original fetch
// ---------------------------------------------------------------------------

globalThis.fetch = originalFetch;

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);

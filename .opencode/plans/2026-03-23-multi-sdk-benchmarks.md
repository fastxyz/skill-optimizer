# Multi-SDK Benchmark Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add standalone function extraction to the code-analyzer, add multi-turn agentic LLM support, restructure integration/ into per-SDK benchmark suites (fast-sdk, allset-sdk, x402-client), and create an orchestrator benchmark (fast-skill) that tests routing + doc fetching + code generation.

**Architecture:** Extend the existing tree-sitter code-analyzer to detect standalone function calls (e.g. `x402Pay(...)`) and function return type tracking (e.g. `const f = fast(...)` then track `f.method()`). Add a multi-turn `chatAgentLoop` to the LLM client that can fulfill tool calls (like `web_fetch`) mid-conversation and continue until the model produces a final text response. Create 4 benchmark suites as JSON configs: 3 per-repo (fast-sdk, allset-sdk, x402-client) and 1 orchestrator (fast-skill) that gives all models the router skill and expects them to fetch the right sub-skill via `web_fetch`.

**Tech Stack:** TypeScript, web-tree-sitter, OpenAI/Anthropic chat APIs with tool calling

---

## Chunk 1: Framework — Standalone Function Extraction

### Task 1: Add `functions` and `functionReturns` to types

**Files:**
- Modify: `src/types.ts:29-34`
- Modify: `tests/smoke-code.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/smoke-code.ts` after the "empty code returns empty array" test (line 136):

```typescript
await test('extractFromCode: standalone function call', async () => {
  const code = `const result = await x402Pay({ url: 'https://api.example.com', wallet: { type: 'evm' } });`;
  const calls = await extractFromCode(code, [], ['x402Pay']);
  assertEqual(calls.length, 1, 'should find 1 call');
  assertEqual(calls[0].method, 'x402Pay', 'method should be x402Pay');
  assertEqual(calls[0].args['url'] as string, 'https://api.example.com', 'url arg');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx tests/smoke-code.ts`
Expected: FAIL — `extractFromCode` does not accept a third parameter

- [ ] **Step 3: Update `src/types.ts` — add fields to `CodeModeConfig`**

Change `CodeModeConfig` (lines 29-34) from:

```typescript
export interface CodeModeConfig {
  language: string;
  style?: 'sdk';
  classes?: string[];
  methods: string[];
}
```

To:

```typescript
export interface CodeModeConfig {
  language: string;
  style?: 'sdk';
  classes?: string[];
  functions?: string[];
  functionReturns?: Record<string, string>;
  methods: string[];
}
```

- [ ] **Step 4: Commit**

```
feat(types): add functions and functionReturns to CodeModeConfig
```

---

### Task 2: Extend code-analyzer to handle standalone function calls

**Files:**
- Modify: `src/extractors/code-analyzer.ts`

- [ ] **Step 1: Update `extractFromCode` signature** (line 386)

Change from:

```typescript
export async function extractFromCode(code: string, classes: string[]): Promise<ExtractedCall[]> {
  const sdkClasses = new Set(classes);
  const p = await initParser();
  const tree = p.parse(code);
  const root = tree.rootNode;
  const varMap = collectVariableBindings(root, sdkClasses);
  const calls = collectCalls(root, varMap, code, sdkClasses);
  calls.sort((a, b) => a.line - b.line);
  return calls;
}
```

To:

```typescript
export async function extractFromCode(
  code: string,
  classes: string[],
  functions: string[] = [],
  functionReturns: Record<string, string> = {},
): Promise<ExtractedCall[]> {
  const sdkClasses = new Set(classes);
  const knownFunctions = new Set(functions);
  const fnReturns = new Map(Object.entries(functionReturns));
  const p = await initParser();
  const tree = p.parse(code);
  const root = tree.rootNode;
  const varMap = collectVariableBindings(root, sdkClasses, knownFunctions, fnReturns);
  const calls = collectCalls(root, varMap, code, sdkClasses, knownFunctions);
  calls.sort((a, b) => a.line - b.line);
  return calls;
}
```

- [ ] **Step 2: Update `collectVariableBindings`** (line 174)

Change signature to:

```typescript
function collectVariableBindings(
  rootNode: Parser.SyntaxNode,
  sdkClasses: Set<string>,
  knownFunctions: Set<string> = new Set(),
  fnReturns: Map<string, string> = new Map(),
): VarMap {
```

Pass new params through to `detectSdkClassFromExpr` at line 194:

```typescript
      const sdkClass = detectSdkClassFromExpr(valueNode, sdkClasses, knownFunctions, fnReturns);
```

- [ ] **Step 3: Update `detectSdkClassFromExpr`** (line 213)

Change signature to:

```typescript
function detectSdkClassFromExpr(
  node: Parser.SyntaxNode,
  sdkClasses: Set<string>,
  knownFunctions: Set<string> = new Set(),
  fnReturns: Map<string, string> = new Map(),
): string | null {
```

Add a new branch inside the existing `call_expression` case (line 231). Replace the entire `if (node.type === 'call_expression')` block with:

```typescript
  if (node.type === 'call_expression') {
    const fn = node.childForFieldName('function');
    if (!fn) return null;

    // NEW: standalone function that returns a trackable type
    // e.g. const f = fast({ network: 'testnet' }) → f maps to "FastClient"
    if (fn.type === 'identifier' && fnReturns.has(fn.text)) {
      return fnReturns.get(fn.text)!;
    }

    if (fn.type === 'member_expression') {
      const obj = fn.childForFieldName('object');
      const prop = fn.childForFieldName('property');
      if (obj && prop && sdkClasses.has(obj.text)) {
        return obj.text;
      }
    }
    return null;
  }
```

- [ ] **Step 4: Update `collectCalls`** (line 278)

Change signature to:

```typescript
function collectCalls(
  rootNode: Parser.SyntaxNode,
  varMap: VarMap,
  code: string,
  sdkClasses: Set<string>,
  knownFunctions: Set<string> = new Set(),
): ExtractedCall[] {
```

Pass `knownFunctions` to `extractCallExpression` at line 296:

```typescript
      const extracted = extractCallExpression(node, varMap, code, sdkClasses, knownFunctions);
```

- [ ] **Step 5: Update `extractCallExpression`** (line 339)

Change signature to:

```typescript
function extractCallExpression(
  node: Parser.SyntaxNode,
  varMap: VarMap,
  _code: string,
  sdkClasses: Set<string>,
  knownFunctions: Set<string> = new Set(),
): ExtractedCall | null {
```

Replace the body (lines 345-374) with:

```typescript
  const fnNode = node.childForFieldName('function');
  if (!fnNode) return null;

  // NEW: standalone function call — x402Pay(...), createEvmWallet(...)
  if (fnNode.type === 'identifier' && knownFunctions.has(fnNode.text)) {
    const method = fnNode.text;
    const argsNode = node.childForFieldName('arguments');
    const args = argsNode ? parseArguments(argsNode) : {};
    return { method, args, line: node.startPosition.row + 1, raw: node.text };
  }

  // Existing: member expressions — obj.method(...)
  if (fnNode.type !== 'member_expression') return null;

  const objNode = fnNode.childForFieldName('object');
  const propNode = fnNode.childForFieldName('property');
  if (!objNode || !propNode) return null;

  const objectName = objNode.text.replace(/\?$/, '');
  const propertyName = propNode.text;

  const method = normalizeMethod(objectName, propertyName, varMap, sdkClasses);

  const isKnownSdk = sdkClasses.has(objectName) || varMap.has(objectName);
  if (!isKnownSdk) return null;

  const argsNode = node.childForFieldName('arguments');
  const args = argsNode ? parseArguments(argsNode) : {};

  return { method, args, line: node.startPosition.row + 1, raw: node.text };
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx tsx tests/smoke-code.ts`
Expected: PASS — standalone function call is now extracted

- [ ] **Step 7: Commit**

```
feat(code-analyzer): support standalone function calls and functionReturns tracking
```

---

### Task 3: Add more standalone function tests

**Files:**
- Modify: `tests/smoke-code.ts`

- [ ] **Step 1: Add tests for function return tracking and mixed scenarios**

Add after the standalone function test from Task 1:

```typescript
await test('extractFromCode: function return tracking', async () => {
  const code = [
    `const f = fast({ network: 'testnet' });`,
    `await f.setup();`,
    `const balance = await f.balance({ token: 'FAST' });`,
  ].join('\n');
  const calls = await extractFromCode(code, [], ['fast'], { fast: 'FastClient' });
  assertEqual(calls.length, 3, 'should find 3 calls');
  assertEqual(calls[0].method, 'fast', 'first call should be fast');
  assertEqual(calls[0].args['network'] as string, 'testnet', 'network arg');
  assertEqual(calls[1].method, 'FastClient.setup', 'second call should be FastClient.setup');
  assertEqual(calls[2].method, 'FastClient.balance', 'third call should be FastClient.balance');
  assertEqual(calls[2].args['token'] as string, 'FAST', 'token arg');
});

await test('extractFromCode: mixed classes and functions', async () => {
  const code = [
    `const account = createEvmWallet('~/.evm/keys/default.json');`,
    `const allset = new AllSetProvider({ network: 'testnet' });`,
    `await allset.sendToFast({ chain: 'arbitrum', token: 'USDC', amount: '1000000' });`,
  ].join('\n');
  const calls = await extractFromCode(code, ['AllSetProvider'], ['createEvmWallet']);
  assertEqual(calls.length, 3, 'should find 3 calls');
  assertEqual(calls[0].method, 'createEvmWallet', 'first call should be createEvmWallet');
  assertEqual(calls[0].args['_positional_0'] as string, '~/.evm/keys/default.json', 'keyfile path arg');
  assertEqual(calls[1].method, 'AllSetProvider.constructor', 'second call should be AllSetProvider.constructor');
  assertEqual(calls[2].method, 'AllSetProvider.sendToFast', 'third call should be AllSetProvider.sendToFast');
  assertEqual(calls[2].args['chain'] as string, 'arbitrum', 'chain arg');
});

await test('extractFromCode: standalone function with no classes', async () => {
  const code = [
    `const result = await x402Pay({`,
    `  url: 'https://api.example.com/premium',`,
    `  wallet: { type: 'evm', privateKey: '0x123', address: '0xabc' },`,
    `  verbose: true,`,
    `});`,
  ].join('\n');
  const calls = await extractFromCode(code, [], ['x402Pay']);
  assertEqual(calls.length, 1, 'should find 1 call');
  assertEqual(calls[0].method, 'x402Pay', 'method should be x402Pay');
  assertEqual(calls[0].args['url'] as string, 'https://api.example.com/premium', 'url arg');
  assertEqual(calls[0].args['verbose'] as boolean, true, 'verbose arg');
});
```

- [ ] **Step 2: Run all tests**

Run: `npx tsx tests/smoke-code.ts`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```
test: add standalone function and function return tracking tests
```

---

### Task 4: Wire functions through extractor, config, and runner

**Files:**
- Modify: `src/extractors/index.ts:31`
- Modify: `src/config.ts:60-64`
- Modify: `src/runner.ts:47-48`

- [ ] **Step 1: Update `src/extractors/index.ts` line 31**

Change from:

```typescript
  const calls = await extractFromCode(generatedCode, config.code.classes ?? []);
```

To:

```typescript
  const calls = await extractFromCode(
    generatedCode,
    config.code.classes ?? [],
    config.code.functions ?? [],
    config.code.functionReturns ?? {},
  );
```

- [ ] **Step 2: Update config validation in `src/config.ts` lines 60-64**

Change from:

```typescript
    if (style === 'sdk') {
      if (!config.code.classes || !Array.isArray(config.code.classes) || config.code.classes.length === 0) {
        throw new Error(`Config ${path}: "code.classes" must be a non-empty array when style is "sdk"`);
      }
    }
```

To:

```typescript
    if (style === 'sdk') {
      const hasClasses = config.code.classes && Array.isArray(config.code.classes) && config.code.classes.length > 0;
      const hasFunctions = config.code.functions && Array.isArray(config.code.functions) && config.code.functions.length > 0;
      if (!hasClasses && !hasFunctions) {
        throw new Error(`Config ${path}: "code.classes" or "code.functions" must be a non-empty array when style is "sdk"`);
      }
    }
```

- [ ] **Step 3: Update `src/runner.ts` lines 47-48**

Change from:

```typescript
  if (config.mode === 'code') {
    knownMethods = new Set(config.code!.methods);
```

To:

```typescript
  if (config.mode === 'code') {
    knownMethods = new Set([
      ...config.code!.methods,
      ...(config.code!.functions ?? []),
    ]);
```

- [ ] **Step 4: Run all tests and typecheck**

Run: `npx tsx tests/smoke-code.ts && npx tsx tests/smoke-mcp.ts && npx tsc --noEmit`
Expected: ALL PASS, no type errors

- [ ] **Step 5: Commit**

```
feat: wire standalone functions through extractor, config validation, and runner
```

---

## Chunk 2: Framework — Multi-Turn Agentic LLM Support

### Task 5: Add agentic types to types.ts

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Add `AgenticConfig` type after `OutputConfig` (line 56)**

```typescript
export interface AgenticConfig {
  references: {
    baseUrl: string;
    allowedPaths: string[];
  };
  maxTurns?: number;  // default 5
}
```

- [ ] **Step 2: Add `agentic?` to `BenchmarkConfig` (add before closing brace, line 27)**

```typescript
  agentic?: AgenticConfig;
```

- [ ] **Step 3: Add `expected_fetches?` to `TaskDefinition` (after line 102)**

```typescript
  expected_fetches?: string[];
```

- [ ] **Step 4: Add fetch metrics to `TaskResult.metrics` (after `hallucinationRate`, line 158)**

```typescript
    fetchRecall?: number;
    fetchPrecision?: number;
    actualFetches?: string[];
```

- [ ] **Step 5: Add `ToolExecutor` type after `ToolCallResult` (line 125)**

```typescript
export type ToolExecutor = (name: string, args: Record<string, unknown>) => Promise<string>;
```

- [ ] **Step 6: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```
feat(types): add AgenticConfig, expected_fetches, fetch metrics, ToolExecutor
```

---

### Task 6: Add multi-turn agent loop to LLM client

**Files:**
- Modify: `src/llm/index.ts`
- Modify: `src/llm/openai-format.ts`
- Modify: `src/llm/anthropic-format.ts`

- [ ] **Step 1: Add `chatAgentLoop` to `LLMClient` interface in `src/llm/index.ts`**

Add import:

```typescript
import type { LLMConfig, LLMResponse, McpToolDefinition, ToolExecutor } from '../types.js';
```

Add to `LLMClient` interface (after `chatWithTools`):

```typescript
  chatAgentLoop(
    modelId: string, system: string, user: string,
    tools: McpToolDefinition[], executor: ToolExecutor, maxTurns?: number,
  ): Promise<LLMResponse>;
```

Add to `createLLMClient` return object:

```typescript
    async chatAgentLoop(modelId, system, user, tools, executor, maxTurns = 5) {
      if (config.format === 'anthropic') {
        return chatAgentLoopAnthropic({ baseUrl, apiKey, timeout, extraHeaders, modelId, system, user, tools, executor, maxTurns });
      }
      return chatAgentLoopOpenAI({ baseUrl, apiKey, timeout, extraHeaders, modelId, system, user, tools, executor, maxTurns });
    },
```

Add the imports for the new functions from the format files.

- [ ] **Step 2: Implement `chatAgentLoopOpenAI` in `src/llm/openai-format.ts`**

Add after `chatWithToolsOpenAI`:

```typescript
import type { ToolExecutor } from '../types.js';

interface AgentLoopParams extends CallWithToolsParams {
  executor: ToolExecutor;
  maxTurns: number;
}

export async function chatAgentLoopOpenAI(params: AgentLoopParams): Promise<LLMResponse> {
  const messages: Array<Record<string, unknown>> = [
    { role: 'system', content: params.system },
    { role: 'user', content: params.user },
  ];

  let allToolCalls: Array<{ name: string; arguments: Record<string, unknown> }> = [];
  let totalUsage = { prompt: 0, completion: 0, total: 0 };

  for (let turn = 0; turn < params.maxTurns; turn++) {
    const body: Record<string, unknown> = {
      model: params.modelId,
      messages,
      tools: params.tools,
      tool_choice: 'auto',
      temperature: 0.2,
    };

    const response = await doFetch(params, body);

    if (response.usage) {
      totalUsage.prompt += response.usage.prompt;
      totalUsage.completion += response.usage.completion;
      totalUsage.total += response.usage.total;
    }

    if (!response.toolCalls || response.toolCalls.length === 0) {
      return {
        content: response.content,
        toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
        usage: totalUsage.total > 0 ? totalUsage : undefined,
      };
    }

    allToolCalls.push(...response.toolCalls);

    const assistantMsg: Record<string, unknown> = {
      role: 'assistant',
      content: response.content || null,
      tool_calls: response.toolCalls.map((tc, i) => ({
        id: `call_${turn}_${i}`,
        type: 'function',
        function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
      })),
    };
    messages.push(assistantMsg);

    for (let i = 0; i < response.toolCalls.length; i++) {
      const tc = response.toolCalls[i];
      let result: string;
      try {
        result = await params.executor(tc.name, tc.arguments);
      } catch (err) {
        result = `Error: ${err instanceof Error ? err.message : String(err)}`;
      }
      messages.push({ role: 'tool', tool_call_id: `call_${turn}_${i}`, content: result });
    }
  }

  return {
    content: '',
    toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
    usage: totalUsage.total > 0 ? totalUsage : undefined,
  };
}
```

Note: `doFetch` is already exported-scoped in the file and can be reused directly.

- [ ] **Step 3: Implement `chatAgentLoopAnthropic` in `src/llm/anthropic-format.ts`**

Add after `chatWithToolsAnthropic`:

```typescript
import type { ToolExecutor } from '../types.js';

interface AgentLoopParams extends CallWithToolsParams {
  executor: ToolExecutor;
  maxTurns: number;
}

export async function chatAgentLoopAnthropic(params: AgentLoopParams): Promise<LLMResponse> {
  const messages: Array<Record<string, unknown>> = [
    { role: 'user', content: params.user },
  ];

  let allToolCalls: Array<{ name: string; arguments: Record<string, unknown> }> = [];
  let totalUsage = { prompt: 0, completion: 0, total: 0 };

  for (let turn = 0; turn < params.maxTurns; turn++) {
    const body: Record<string, unknown> = {
      model: params.modelId,
      max_tokens: 8192,
      system: params.system,
      messages,
      tools: params.tools.map(toAnthropicTool),
      temperature: 0.2,
    };

    const response = await doFetch(params, body);

    if (response.usage) {
      totalUsage.prompt += response.usage.prompt;
      totalUsage.completion += response.usage.completion;
      totalUsage.total += response.usage.total;
    }

    if (!response.toolCalls || response.toolCalls.length === 0) {
      return {
        content: response.content,
        toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
        usage: totalUsage.total > 0 ? totalUsage : undefined,
      };
    }

    allToolCalls.push(...response.toolCalls);

    const assistantContent = [
      ...(response.content ? [{ type: 'text', text: response.content }] : []),
      ...response.toolCalls.map((tc, i) => ({
        type: 'tool_use', id: `toolu_${turn}_${i}`, name: tc.name, input: tc.arguments,
      })),
    ];
    messages.push({ role: 'assistant', content: assistantContent });

    const toolResults = [];
    for (let i = 0; i < response.toolCalls.length; i++) {
      const tc = response.toolCalls[i];
      let result: string;
      try {
        result = await params.executor(tc.name, tc.arguments);
      } catch (err) {
        result = `Error: ${err instanceof Error ? err.message : String(err)}`;
      }
      toolResults.push({ type: 'tool_result', tool_use_id: `toolu_${turn}_${i}`, content: result });
    }
    messages.push({ role: 'user', content: toolResults });
  }

  return {
    content: '',
    toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
    usage: totalUsage.total > 0 ? totalUsage : undefined,
  };
}
```

- [ ] **Step 4: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```
feat(llm): add multi-turn chatAgentLoop for OpenAI and Anthropic formats
```

---

### Task 7: Add agentic mode to runner

**Files:**
- Modify: `src/runner.ts`

- [ ] **Step 1: Add web_fetch tool builder and reference executor**

Add after imports (around line 24):

```typescript
function buildWebFetchTool(): McpToolDefinition {
  return {
    type: 'function',
    function: {
      name: 'web_fetch',
      description: 'Fetch a reference document by path. Use this to load SDK documentation referenced in the skill.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Path to the reference document, e.g. "references/fast-sdk.md"' },
        },
        required: ['url'],
      },
    },
  };
}

function createReferenceExecutor(
  baseUrl: string,
  allowedPaths: string[],
): { executor: ToolExecutor; fetchedPaths: string[] } {
  const fetched: string[] = [];
  const allowed = new Set(allowedPaths);

  const executor: ToolExecutor = async (name, args) => {
    if (name !== 'web_fetch') return `Error: Unknown tool "${name}"`;

    let url = (args.url ?? args.path ?? '') as string;
    url = url.replace(/^\/+/, '');
    // Strip full URL prefix if model included it
    const prefix = baseUrl.replace(/\/+$/, '') + '/';
    if (url.startsWith(prefix)) url = url.slice(prefix.length);
    if (url.startsWith('https://')) {
      const idx = url.indexOf(prefix);
      if (idx !== -1) url = url.slice(idx + prefix.length);
    }

    if (!allowed.has(url)) {
      return `Error: Path "${url}" not in allowed list. Available: ${allowedPaths.join(', ')}`;
    }

    fetched.push(url);

    const fullUrl = `${baseUrl.replace(/\/+$/, '')}/${url}`;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30_000);
      try {
        const res = await fetch(fullUrl, { signal: controller.signal });
        if (!res.ok) return `Error: HTTP ${res.status} fetching ${fullUrl}`;
        return await res.text();
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      return `Error: ${err instanceof Error ? err.message : String(err)}`;
    }
  };

  return { executor, fetchedPaths: fetched };
}
```

Add the import for ToolExecutor at the top:

```typescript
import type { ..., ToolExecutor } from './types.js';
```

- [ ] **Step 2: Add agentic branch to the evaluation loop**

In the `try` block around line 136, replace the existing `if/else` chain with:

```typescript
        if (config.agentic) {
          const { executor, fetchedPaths } = createReferenceExecutor(
            config.agentic.references.baseUrl,
            config.agentic.references.allowedPaths,
          );
          llmResponse = await client.chatAgentLoop(
            model.id, systemPrompt, buildTaskPrompt(task, promptOptions),
            [buildWebFetchTool()], executor, config.agentic.maxTurns ?? 5,
          );
          (llmResponse as any)._fetchedPaths = fetchedPaths;
        } else if (config.mode === 'mcp' && mcpToolDefs) {
```

Keep the rest of the existing `else if` / `else` chain unchanged.

- [ ] **Step 3: Add fetch metric computation after `evaluateTask`**

After the `evaluateTask` call (around line 190), before `results.push(taskResult)`:

```typescript
      if (config.agentic && task.expected_fetches) {
        const actualFetches: string[] = (llmResponse as any)?._fetchedPaths ?? [];
        const expectedSet = new Set(task.expected_fetches);
        const actualSet = new Set(actualFetches);
        const matched = [...expectedSet].filter(f => actualSet.has(f));
        taskResult.metrics.fetchRecall = expectedSet.size === 0 ? 1.0 : matched.length / expectedSet.size;
        taskResult.metrics.fetchPrecision = actualSet.size === 0 ? 0.0 : matched.length / actualSet.size;
        taskResult.metrics.actualFetches = actualFetches;

        const fetchStatus = taskResult.metrics.fetchRecall === 1.0 ? 'correct' : 'WRONG';
        console.log(`  [${slug}] Fetched: [${actualFetches.join(', ')}] (${fetchStatus})`);
      }
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx tsx tests/smoke-code.ts && npx tsx tests/smoke-mcp.ts && npx tsc --noEmit`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```
feat(runner): add agentic mode with web_fetch tool executor and fetch metrics
```

---

## Chunk 3: Restructure integration/ and Create Per-Repo Benchmarks

### Task 8: Move existing fast-sdk integration to subdirectory

**Files:**
- Move: `integration/benchmark.config.json` → `integration/fast-sdk/benchmark.config.json`
- Move: `integration/tasks.json` → `integration/fast-sdk/tasks.json`
- Move: `integration/dump-prompts.ts` → `integration/fast-sdk/dump-prompts.ts`
- Move: `integration/package.json` → `integration/fast-sdk/package.json`

- [ ] **Step 1: Create directory and move files**

```bash
mkdir -p integration/fast-sdk
git mv integration/benchmark.config.json integration/fast-sdk/
git mv integration/tasks.json integration/fast-sdk/
git mv integration/dump-prompts.ts integration/fast-sdk/
git mv integration/package.json integration/fast-sdk/
```

Leave `integration/benchmark-results/` in place (historical data).

- [ ] **Step 2: Trim fast-sdk config to 5 flagship models**

Edit `integration/fast-sdk/benchmark.config.json` — replace the `models` array with:

```json
"models": [
  { "id": "openai/gpt-5.4", "name": "GPT-5.4", "tier": "flagship" },
  { "id": "anthropic/claude-opus-4.6", "name": "Claude Opus 4.6", "tier": "flagship" },
  { "id": "google/gemini-3.1-pro-preview", "name": "Gemini 3.1 Pro", "tier": "flagship" },
  { "id": "x-ai/grok-4-fast", "name": "Grok 4 Fast", "tier": "flagship" },
  { "id": "deepseek/deepseek-v3.2", "name": "DeepSeek V3.2", "tier": "flagship" }
]
```

- [ ] **Step 3: Commit**

```
refactor: move fast-sdk integration to integration/fast-sdk/ and trim to 5 flagships
```

---

### Task 9: Create allset-sdk benchmark

**Files:**
- Create: `integration/allset-sdk/benchmark.config.json`
- Create: `integration/allset-sdk/tasks.json`

- [ ] **Step 1: Create `integration/allset-sdk/benchmark.config.json`**

```json
{
  "name": "allset-sdk",
  "mode": "code",
  "code": {
    "language": "typescript",
    "classes": ["AllSetProvider"],
    "functions": [
      "createEvmWallet", "createEvmExecutor",
      "buildTransferIntent", "buildExecuteIntent",
      "buildDepositBackIntent", "buildRevokeIntent"
    ],
    "methods": [
      "AllSetProvider.constructor", "AllSetProvider.sendToFast",
      "AllSetProvider.sendToExternal", "AllSetProvider.executeIntent",
      "AllSetProvider.getChainConfig", "AllSetProvider.getTokenConfig",
      "createEvmWallet", "createEvmExecutor",
      "buildTransferIntent", "buildExecuteIntent",
      "buildDepositBackIntent", "buildRevokeIntent"
    ]
  },
  "skill": { "source": "github:fastxyz/allset-sdk/SKILL.md", "cache": true },
  "tasks": "./tasks.json",
  "llm": {
    "baseUrl": "https://openrouter.ai/api/v1",
    "apiKeyEnv": "OPENROUTER_API_KEY",
    "format": "openai",
    "timeout": 240000,
    "models": [
      { "id": "openai/gpt-5.4", "name": "GPT-5.4", "tier": "flagship" },
      { "id": "anthropic/claude-opus-4.6", "name": "Claude Opus 4.6", "tier": "flagship" },
      { "id": "google/gemini-3.1-pro-preview", "name": "Gemini 3.1 Pro", "tier": "flagship" },
      { "id": "x-ai/grok-4-fast", "name": "Grok 4 Fast", "tier": "flagship" },
      { "id": "deepseek/deepseek-v3.2", "name": "DeepSeek V3.2", "tier": "flagship" }
    ]
  },
  "output": { "dir": "./benchmark-results" }
}
```

- [ ] **Step 2: Create `integration/allset-sdk/tasks.json`**

8 tasks covering: deposit-usdc, withdraw-fastusdc, execute-transfer-intent, deposit-back-intent, generate-evm-wallet, load-wallet-keyfile, setup-evm-executor, custom-config.

(Full task definitions with expected_tools and args — see the detailed JSON in the plan discussion above. Copy the full tasks.json content from the plan discussion.)

- [ ] **Step 3: Commit**

```
feat: add allset-sdk benchmark suite (8 tasks, 5 flagship models)
```

---

### Task 10: Create x402-client benchmark

**Files:**
- Create: `integration/x402-client/benchmark.config.json`
- Create: `integration/x402-client/tasks.json`

- [ ] **Step 1: Create config — functions-only, no classes**

```json
{
  "name": "x402-client",
  "mode": "code",
  "code": {
    "language": "typescript",
    "functions": ["x402Pay"],
    "methods": ["x402Pay"]
  },
  "skill": { "source": "github:fastxyz/x402-sdk/skills/client-skill.md", "cache": true },
  "tasks": "./tasks.json",
  "llm": {
    "baseUrl": "https://openrouter.ai/api/v1",
    "apiKeyEnv": "OPENROUTER_API_KEY",
    "format": "openai",
    "timeout": 240000,
    "models": [
      { "id": "openai/gpt-5.4", "name": "GPT-5.4", "tier": "flagship" },
      { "id": "anthropic/claude-opus-4.6", "name": "Claude Opus 4.6", "tier": "flagship" },
      { "id": "google/gemini-3.1-pro-preview", "name": "Gemini 3.1 Pro", "tier": "flagship" },
      { "id": "x-ai/grok-4-fast", "name": "Grok 4 Fast", "tier": "flagship" },
      { "id": "deepseek/deepseek-v3.2", "name": "DeepSeek V3.2", "tier": "flagship" }
    ]
  },
  "output": { "dir": "./benchmark-results" }
}
```

- [ ] **Step 2: Create tasks — 5 tasks with code_pattern verification**

5 tasks: evm-payment, fast-payment, auto-bridge-payment, post-with-body, verbose-debug. Uses both `expected_tools` for `x402Pay` extraction and `verify.code_pattern` for wallet type checks.

- [ ] **Step 3: Commit**

```
feat: add x402-client benchmark suite (5 tasks, 5 flagship models)
```

---

## Chunk 4: Orchestrator Benchmark (fast-skill agentic)

### Task 11: Create fast-skill agentic benchmark

**Files:**
- Create: `integration/fast-skill/benchmark.config.json`
- Create: `integration/fast-skill/tasks.json`

- [ ] **Step 1: Create config with agentic section**

Config includes: `classes` (AllSetProvider, FastProvider, FastWallet), `functions` (fast, x402Pay, createEvmWallet, etc.), `functionReturns` ({ fast: "FastClient" }), `agentic.references` pointing to `https://raw.githubusercontent.com/fastxyz/fast-skill/main` with 13 allowed paths covering all references and flows.

- [ ] **Step 2: Create tasks with `expected_fetches`**

8 tasks spanning all packages:
- check-fast-balance → expects fetch of `references/fast-sdk.md`
- send-fast-tokens → expects `references/fast-sdk.md`
- bridge-evm-to-fast → expects `references/allset-sdk.md`
- bridge-fast-to-evm → expects `references/allset-sdk.md`
- pay-402-evm → expects `references/x402-client.md`
- pay-402-fast → expects `references/x402-client.md`
- sign-verify-message → expects `references/fast-sdk.md`
- ambiguous-routing → expects `references/fast-sdk.md`

Each task has both `expected_fetches` (routing test) and `expected_tools` (code test).

- [ ] **Step 3: Commit**

```
feat: add fast-skill orchestrator benchmark (8 agentic tasks with expected_fetches)
```

---

## Chunk 5: Build Verification

### Task 12: Full build and test verification

- [ ] **Step 1: Run unit tests**

Run: `npx tsx tests/smoke-code.ts`
Expected: All pass (including 4 new standalone function tests)

- [ ] **Step 2: Run MCP tests**

Run: `npx tsx tests/smoke-mcp.ts`
Expected: All pass (unaffected)

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Run build**

Run: `npx tsc`
Expected: Clean build

- [ ] **Step 5: Verify each config loads**

Attempt to load each config through the runner (will fail at LLM call without API key, but config validation should pass):

```bash
npx tsx src/cli.ts run --config integration/fast-sdk/benchmark.config.json 2>&1 | head -10
npx tsx src/cli.ts run --config integration/allset-sdk/benchmark.config.json 2>&1 | head -10
npx tsx src/cli.ts run --config integration/x402-client/benchmark.config.json 2>&1 | head -10
npx tsx src/cli.ts run --config integration/fast-skill/benchmark.config.json 2>&1 | head -10
```

Expected: Each should load config, load tasks, attempt skill fetch — then fail at LLM call (expected without API key).

---

## Summary

| Chunk | Tasks | Purpose |
|-------|-------|---------|
| 1 (Tasks 1-4) | Standalone function extraction | `types.ts`, `code-analyzer.ts`, `extractors/index.ts`, `config.ts`, `runner.ts`, `tests/smoke-code.ts` |
| 2 (Tasks 5-7) | Multi-turn agentic LLM | `types.ts`, `llm/index.ts`, `llm/openai-format.ts`, `llm/anthropic-format.ts`, `runner.ts` |
| 3 (Tasks 8-10) | Per-repo benchmarks | `integration/fast-sdk/*`, `integration/allset-sdk/*`, `integration/x402-client/*` |
| 4 (Task 11) | Orchestrator benchmark | `integration/fast-skill/*` |
| 5 (Task 12) | Verification | No file changes |

**Totals:** 12 tasks, ~300 lines framework code, 8 JSON config files, 29 benchmark tasks across 4 suites, 145 evaluations (29 x 5 models)

# Task-Driven Extraction Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all SDK extraction hints from config (`functions`, `functionReturns`, `classes`, `methods`). Make tree-sitter extract ALL calls from generated code. Derive `knownMethods` and type mappings from task `expected_tools` at eval time. Tasks become the single source of truth for correctness.

**Architecture:** The extractor becomes fully generic — it extracts every `new X(...)`, `x.method(...)`, and `func(...)` call from code without filtering. Variable-to-type resolution (e.g. `f ← fast(...)` → `f.method()` = `FastClient.method`) is inferred at eval time by combining the extractor's raw variable binding graph with the task's `expected_tools` type prefixes. Config shrinks to just `language` + benchmark metadata.

**Tech Stack:** TypeScript, web-tree-sitter, existing evaluator/runner

---

## Chunk 1: Generic Extractor (no filtering)

### Task 1: Make extractor extract ALL calls without filtering

**Files:**
- Modify: `src/extractors/code-analyzer.ts`
- Modify: `tests/smoke-code.ts`

The current extractor only extracts calls that match known `classes` or `functions` sets. We need it to extract every call expression and constructor, then output raw calls + a variable binding graph.

- [ ] **Step 1: Write failing test — extractor finds unknown function calls**

Add to `tests/smoke-code.ts`:

```typescript
await test('extractFromCode: extracts all calls without hints', async () => {
  const code = [
    `const f = fast({ network: 'testnet' });`,
    `await f.setup();`,
    `await f.balance();`,
    `const result = await x402Pay({ url: 'https://example.com' });`,
    `console.log(result);`,
  ].join('\n');
  // No classes, no functions, no hints
  const { calls, bindings } = await extractAllFromCode(code);
  // Should find: fast(...), f.setup(), f.balance(), x402Pay(...), console.log(...)
  assert(calls.length >= 4, 'should find at least 4 calls');
  const methods = calls.map(c => c.method);
  assert(methods.includes('fast'), 'should find fast');
  assert(methods.includes('f.setup'), 'should find f.setup');
  assert(methods.includes('f.balance'), 'should find f.balance');
  assert(methods.includes('x402Pay'), 'should find x402Pay');
  // Bindings should show f ← fast
  assertEqual(bindings.get('f'), 'fast', 'f should be bound to fast');
});
```

- [ ] **Step 2: Run test — verify it fails**

Run: `npx tsx tests/smoke-code.ts`
Expected: FAIL — `extractAllFromCode` does not exist

- [ ] **Step 3: Implement `extractAllFromCode`**

Add a new public function to `src/extractors/code-analyzer.ts`:

```typescript
export interface RawExtraction {
  calls: ExtractedCall[];
  bindings: Map<string, string>;  // variable → source function/class name
}

export async function extractAllFromCode(code: string): Promise<RawExtraction> {
  const p = await initParser();
  const tree = p.parse(code);
  const root = tree.rootNode;
  const literalMap = collectLiteralBindings(root);
  const bindings = collectAllVariableBindings(root);
  const calls = collectAllCalls(root, bindings, literalMap);
  calls.sort((a, b) => a.line - b.line);
  return { calls, bindings };
}
```

Where:

`collectAllVariableBindings(root)` — walks every variable declarator/assignment, tracks:
- `const f = fast(...)` → `f` bound to `fast`
- `const allset = new AllSetProvider(...)` → `allset` bound to `AllSetProvider`
- `const w = await FastWallet.fromKeyfile(...)` → `w` bound to `FastWallet`
- `const x = someVar` → `x` bound to whatever `someVar` was bound to

Returns `Map<string, string>` — variable name → source function/class/constructor name.

`collectAllCalls(root, bindings, literalMap)` — walks every `call_expression` and `new_expression`, extracts ALL of them:
- `new X(...)` → method=`X.constructor`, args parsed
- `obj.method(...)` → method=`<resolvedObj>.method` (resolve via bindings if available, else keep `obj.method`)
- `func(...)` → method=`func`, args parsed

No filtering by known classes/functions. Everything gets extracted.

- [ ] **Step 4: Run test — verify it passes**

Run: `npx tsx tests/smoke-code.ts`
Expected: PASS

- [ ] **Step 5: Add test for constructor extraction**

```typescript
await test('extractAllFromCode: extracts constructors', async () => {
  const code = [
    `const allset = new AllSetProvider({ network: 'testnet' });`,
    `await allset.sendToFast({ to: 'fast1abc', amount: '1000000' });`,
  ].join('\n');
  const { calls, bindings } = await extractAllFromCode(code);
  assertEqual(calls.length, 2, 'should find 2 calls');
  assertEqual(calls[0].method, 'AllSetProvider.constructor', 'first call should be constructor');
  assertEqual(calls[1].method, 'AllSetProvider.sendToFast', 'second call resolved via binding');
  assertEqual(bindings.get('allset'), 'AllSetProvider', 'allset bound to AllSetProvider');
});
```

- [ ] **Step 6: Run test — verify it passes**

Run: `npx tsx tests/smoke-code.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```
feat(extractor): add extractAllFromCode that extracts all calls without config hints
```

---

### Task 2: Wire new extractor through extract() factory

**Files:**
- Modify: `src/extractors/index.ts`

- [ ] **Step 1: Update extract() to use extractAllFromCode for code mode**

Change `src/extractors/index.ts` to use the new function. The `extract()` function should now return `{ calls, generatedCode, bindings }`:

```typescript
import { extractAllFromCode, type RawExtraction } from './code-analyzer.js';

export async function extract(
  response: LLMResponse,
  config: BenchmarkConfig,
): Promise<{ calls: ExtractedCall[]; generatedCode: string | null; bindings?: Map<string, string> }> {
  if (config.mode === 'mcp') {
    const calls = extractFromToolCalls(response);
    return { calls, generatedCode: null };
  }

  if (!config.code) {
    throw new Error('Code mode requires "code" section in config');
  }

  const generatedCode = extractCodeBlock(response.content);
  if (!generatedCode) {
    return { calls: [], generatedCode: null };
  }

  const { calls, bindings } = await extractAllFromCode(generatedCode);
  return { calls, generatedCode, bindings };
}
```

Keep the old `extractFromCode` function in code-analyzer.ts — don't delete it yet. Existing tests that call it directly still work.

- [ ] **Step 2: Run all tests**

Run: `npx tsx tests/smoke-code.ts && npx tsx tests/smoke-mcp.ts`
Expected: ALL PASS

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```
feat(extractor): wire extractAllFromCode through extract() factory
```

---

## Chunk 2: Evaluator-Side Type Resolution

### Task 3: Resolve raw calls using task expectations + bindings

**Files:**
- Modify: `src/evaluator.ts`
- Modify: `tests/smoke-code.ts`

The evaluator currently receives pre-resolved calls (e.g. `FastClient.balance`). Now it receives raw calls (e.g. `f.balance`) plus bindings (`f ← fast`). It must infer that `fast → FastClient` from the task's expected tools.

Algorithm:
1. Scan task `expected_tools` — collect type prefixes (e.g. `FastClient` from `FastClient.setup`, `FastClient.balance`)
2. Scan task `expected_tools` — collect standalone method names (e.g. `fast` from `{ method: "fast" }`)
3. Build inference map: if task expects standalone `fast` AND expects `FastClient.*` methods, and bindings show `f ← fast(...)`, then `fast → FastClient`
4. Also handle `new ClassName(...)` — bindings show `allset ← AllSetProvider`, task expects `AllSetProvider.*` — direct match, no inference needed
5. Resolve all raw extracted calls through this map before matching

- [ ] **Step 1: Write failing test**

Add to `tests/smoke-code.ts`:

```typescript
await test('evaluateTask: resolves raw calls via bindings + task expectations', () => {
  const task: TaskDefinition = {
    id: 'resolve-test',
    prompt: 'Test resolution',
    expected_tools: [
      { method: 'fast', args: { network: 'testnet' } },
      { method: 'FastClient.setup' },
      { method: 'FastClient.balance' },
    ],
  };
  // Raw calls as they come from extractAllFromCode
  const extractedCalls: ExtractedCall[] = [
    makeCall('fast', { network: 'testnet' }),
    makeCall('f.setup', {}),
    makeCall('f.balance', {}),
  ];
  const bindings = new Map([['f', 'fast']]);
  const result = evaluateTask({
    task,
    model: MODEL,
    generatedCode: null,
    rawResponse: '',
    extractedCalls,
    llmLatencyMs: 0,
    error: undefined,
    knownMethods: new Set(['fast', 'FastClient.setup', 'FastClient.balance']),
    bindings,
  });
  assertEqual(result.metrics.taskPassed, true, 'should pass after resolution');
  assertEqual(result.metrics.toolRecall, 1.0, 'recall should be 1.0');
});
```

- [ ] **Step 2: Run test — verify it fails**

Run: `npx tsx tests/smoke-code.ts`
Expected: FAIL — `evaluateTask` does not accept `bindings` param

- [ ] **Step 3: Implement resolution in evaluator**

Add a `bindings?: Map<string, string>` parameter to `evaluateTask`. Before matching, resolve raw calls:

```typescript
function resolveCallsFromBindings(
  extractedCalls: ExtractedCall[],
  bindings: Map<string, string>,
  expectedTools: ExpectedTool[],
): ExtractedCall[] {
  // 1. Collect type prefixes from expected tools
  // e.g. { method: 'FastClient.setup' } → prefix 'FastClient'
  const expectedPrefixes = new Set<string>();
  const expectedStandalone = new Set<string>();
  for (const tool of expectedTools) {
    if (tool.method.includes('.')) {
      expectedPrefixes.add(tool.method.split('.')[0]);
    } else {
      expectedStandalone.add(tool.method);
    }
  }

  // 2. Build function-to-type map from bindings + expectations
  // If bindings say f ← fast, and expected has 'fast' standalone + 'FastClient.*'
  // Then fast → FastClient
  const fnToType = new Map<string, string>();
  for (const [varName, sourceFn] of bindings) {
    // Check if sourceFn is an expected standalone call
    if (expectedStandalone.has(sourceFn)) {
      // Find which expected prefix's methods are called on this variable
      for (const prefix of expectedPrefixes) {
        // Check if any expected tool uses this prefix
        const hasMethodsOnPrefix = expectedTools.some(t =>
          t.method.startsWith(prefix + '.')
        );
        if (hasMethodsOnPrefix) {
          fnToType.set(sourceFn, prefix);
          break;
        }
      }
    }
    // Direct class match (e.g. allset ← AllSetProvider)
    if (expectedPrefixes.has(sourceFn)) {
      fnToType.set(sourceFn, sourceFn);
    }
  }

  // 3. Build var-to-type map
  const varToType = new Map<string, string>();
  for (const [varName, sourceFn] of bindings) {
    const resolvedType = fnToType.get(sourceFn);
    if (resolvedType) {
      varToType.set(varName, resolvedType);
    }
  }

  // 4. Resolve each call
  return extractedCalls.map(call => {
    if (call.method.includes('.')) {
      const [obj, method] = call.method.split('.');
      const resolvedType = varToType.get(obj);
      if (resolvedType) {
        return { ...call, method: `${resolvedType}.${method}` };
      }
    }
    return call;
  });
}
```

Then in `evaluateTask`, before `matchTools`:

```typescript
if (bindings) {
  extractedCalls = resolveCallsFromBindings(extractedCalls, bindings, task.expected_tools);
}
```

- [ ] **Step 4: Run test — verify it passes**

Run: `npx tsx tests/smoke-code.ts`
Expected: PASS

- [ ] **Step 5: Add test for constructor-based resolution**

```typescript
await test('evaluateTask: resolves constructor-based bindings', () => {
  const task: TaskDefinition = {
    id: 'constructor-resolve',
    prompt: 'Test constructor',
    expected_tools: [
      { method: 'AllSetProvider.constructor', args: { network: 'testnet' } },
      { method: 'AllSetProvider.sendToFast' },
    ],
  };
  const extractedCalls: ExtractedCall[] = [
    makeCall('AllSetProvider.constructor', { network: 'testnet' }),
    makeCall('allset.sendToFast', { to: 'fast1abc' }),
  ];
  const bindings = new Map([['allset', 'AllSetProvider']]);
  const result = evaluateTask({
    task,
    model: MODEL,
    generatedCode: null,
    rawResponse: '',
    extractedCalls,
    llmLatencyMs: 0,
    error: undefined,
    knownMethods: new Set(['AllSetProvider.constructor', 'AllSetProvider.sendToFast']),
    bindings,
  });
  assertEqual(result.metrics.taskPassed, true, 'should pass constructor resolution');
  assertEqual(result.metrics.toolRecall, 1.0, 'recall should be 1.0');
});
```

- [ ] **Step 6: Run all tests**

Run: `npx tsx tests/smoke-code.ts && npx tsx tests/smoke-mcp.ts`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```
feat(evaluator): resolve raw calls using task expectations + variable bindings
```

---

## Chunk 3: Simplify Config and Runner

### Task 4: Remove code extraction hints from config

**Files:**
- Modify: `src/types.ts`
- Modify: `src/config.ts`
- Modify: `src/runner.ts`
- Modify: `src/extractors/index.ts`

- [ ] **Step 1: Make CodeModeConfig minimal**

In `src/types.ts`, change `CodeModeConfig` to:

```typescript
export interface CodeModeConfig {
  language: string;
  style?: 'sdk';
  // Optional: explicit API surface for coverage/hallucination reporting only
  // If omitted, derived from task expected_tools
  apiSurface?: string[];
}
```

Remove `classes`, `functions`, `functionReturns`, `methods`.

- [ ] **Step 2: Update config validation in `src/config.ts`**

Remove the validation blocks for `classes`, `functions`, `methods`. Keep only:

```typescript
if (config.mode === 'code') {
  if (!config.code) throw new Error(`Config ${path}: "code" section is required when mode is "code"`);
  if (!config.code.language) {
    throw new Error(`Config ${path}: "code.language" is required (e.g. "typescript")`);
  }
}
```

Remove the `style === 'sdk'` classes/functions check.
Remove the `methods` required check.

- [ ] **Step 3: Update runner to derive knownMethods from tasks**

In `src/runner.ts`, change the `knownMethods` setup (lines 90-102) from:

```typescript
if (config.mode === 'code') {
  knownMethods = new Set([
    ...config.code!.methods,
    ...(config.code!.functions ?? []),
  ]);
}
```

To:

```typescript
if (config.mode === 'code') {
  // Derive known methods from task expected_tools
  const fromTasks = new Set<string>();
  for (const task of tasks) {
    for (const tool of task.expected_tools) {
      fromTasks.add(tool.method);
    }
  }
  // Optional: merge with explicit apiSurface if provided
  const apiSurface = config.code?.apiSurface ?? [];
  knownMethods = new Set([...fromTasks, ...apiSurface]);
}
```

- [ ] **Step 4: Update runner to pass bindings to evaluateTask**

Where `evaluateTask` is called (around line 235), pass the bindings from the extract result:

```typescript
const { calls: extractedCalls, generatedCode, bindings } = await extract(llmResponse, config);
// ...
const taskResult = evaluateTask({
  ...existing params...,
  bindings,
});
```

- [ ] **Step 5: Update extract() — remove old config-based params**

In `src/extractors/index.ts`, the extract function should no longer read `config.code.classes`, `config.code.functions`, `config.code.functionReturns`. It just calls `extractAllFromCode(generatedCode)`.

- [ ] **Step 6: Run all tests and typecheck**

Run: `npx tsx tests/smoke-code.ts && npx tsx tests/smoke-mcp.ts && npx tsc --noEmit`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```
refactor: remove classes/functions/functionReturns/methods from CodeModeConfig
```

---

### Task 5: Update benchmark configs to minimal format

**Files:**
- Modify: `integration/fast-sdk/benchmark.config.json`
- Modify: `integration/allset-sdk/benchmark.config.json`
- Modify: `integration/x402-client/benchmark.config.json`

- [ ] **Step 1: Simplify fast-sdk config**

Remove `functions`, `functionReturns`, `methods` from `code` section. Keep only:

```json
"code": {
  "language": "typescript"
}
```

- [ ] **Step 2: Simplify allset-sdk config**

Same — reduce to `"code": { "language": "typescript" }`.

- [ ] **Step 3: Simplify x402-client config**

Same — reduce to `"code": { "language": "typescript" }`.

- [ ] **Step 4: Run one smoke benchmark per SDK**

```bash
source integration/.env
npx tsx src/cli.ts run --config integration/fast-sdk/benchmark.config.json --task check-balance --model gpt-5-4
npx tsx src/cli.ts run --config integration/x402-client/benchmark.config.json --task evm-payment --model gpt-5-4
npx tsx src/cli.ts run --config integration/allset-sdk/benchmark.config.json --task deposit-usdc --model gpt-5-4
```

Expected: All 3 pass.

- [ ] **Step 5: Commit**

```
refactor: simplify benchmark configs to minimal code.language-only format
```

---

## Chunk 4: Cleanup and Verification

### Task 6: Remove old extractFromCode or mark deprecated

**Files:**
- Modify: `src/extractors/code-analyzer.ts`
- Modify: `tests/smoke-code.ts`

- [ ] **Step 1: Decide on old function**

The old `extractFromCode(code, classes, functions, functionReturns)` is no longer called by the main pipeline. Options:
- Keep it for backward compat (mark deprecated)
- Remove it and update old tests to use `extractAllFromCode`

Recommendation: Keep it but add a `@deprecated` comment. Update tests that now test the new function.

- [ ] **Step 2: Ensure existing tests still pass**

Run: `npx tsx tests/smoke-code.ts && npx tsx tests/smoke-mcp.ts && npx tsc --noEmit`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```
chore: deprecate old extractFromCode, keep for backward compat
```

---

### Task 7: Full verification

- [ ] **Step 1: Run all unit tests**

Run: `npx tsx tests/smoke-code.ts && npx tsx tests/smoke-mcp.ts`
Expected: ALL PASS

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Run full fast-sdk benchmark**

```bash
source integration/.env && npx tsx src/cli.ts run --config integration/fast-sdk/benchmark.config.json --task check-balance --model gpt-5-4
```

Expected: PASS with `fast → FastClient` resolution working from task expectations only

- [ ] **Step 4: Run full x402-client benchmark**

```bash
source integration/.env && npx tsx src/cli.ts run --config integration/x402-client/benchmark.config.json --task evm-payment --model gpt-5-4
```

Expected: PASS with nested arg matching on `wallet.type`

---

## Summary

| Chunk | Tasks | Purpose |
|-------|-------|---------|
| 1 (Tasks 1-2) | Generic extractor | Extract all calls without filtering, output raw calls + bindings |
| 2 (Task 3) | Evaluator resolution | Infer type mappings from task expectations + bindings |
| 3 (Tasks 4-5) | Config simplification | Remove `classes`/`functions`/`functionReturns`/`methods` from config |
| 4 (Tasks 6-7) | Cleanup + verification | Deprecate old function, full test run |

**Key design decisions:**
- Extractor outputs raw `f.setup`, not `FastClient.setup`
- Evaluator resolves `f.setup → FastClient.setup` by combining:
  - binding graph: `f ← fast`
  - task expectations: `fast` (standalone) + `FastClient.*` (prefixed)
  - inference: `fast → FastClient`
- Config only needs `"code": { "language": "typescript" }`
- Tasks are the single source of truth for correctness
- `knownMethods` derived from union of all `expected_tools` across tasks

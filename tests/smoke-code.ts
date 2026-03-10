import { extractCodeBlock } from '../src/extractors/code-extractor.js';
import { extractFromCode } from '../src/extractors/code-analyzer.js';
import { evaluateTask } from '../src/evaluator.js';
import { computeCoverage } from '../src/coverage.js';
import type { ExtractedCall, TaskDefinition, ModelConfig } from '../src/types.js';

// ── Test harness ───────────────────────────────────────────────────────────

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
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

const MODEL: ModelConfig = { id: 'test/model', name: 'TestModel', tier: 'flagship' as const };

const KNOWN_METHODS = new Set([
  'FastProvider.constructor',
  'FastWallet.fromKeyfile',
  'FastWallet.send',
  'FastWallet.balance',
]);

function makeTask(id: string, methods: string[]): TaskDefinition {
  return {
    id,
    prompt: `Task ${id}`,
    expected_tools: methods.map((method) => ({ method })),
  };
}

function makeCall(method: string, args: Record<string, unknown> = {}): ExtractedCall {
  return { method, args, line: 1, raw: 'mock' };
}

// ── Tests ──────────────────────────────────────────────────────────────────

console.log('\n=== Code Mode Smoke Tests ===\n');

// Group 1: extractCodeBlock

await test('extractCodeBlock: finds typescript block', () => {
  const md = '```typescript\nconst x = 1;\n```';
  const result = extractCodeBlock(md);
  assertEqual(result, 'const x = 1;', 'should extract typescript block content');
});

await test('extractCodeBlock: finds ts block', () => {
  const md = '```ts\nconst x = 1;\n```';
  const result = extractCodeBlock(md);
  assertEqual(result, 'const x = 1;', 'should extract ts block content');
});

await test('extractCodeBlock: returns null on no block', () => {
  const result = extractCodeBlock('Here is some text without any code blocks');
  assertEqual(result, null, 'should return null when no code block present');
});

await test('extractCodeBlock: returns null on non-ts block', () => {
  // The regex only matches typescript|ts|javascript|js or bare ```.
  // A ```python block does NOT match, so it returns null.
  const md = "```python\nprint('hello')\n```";
  const result = extractCodeBlock(md);
  assertEqual(result, null, 'should return null for python code block');
});

// Group 2: extractFromCode (tree-sitter)

await test('extractFromCode: constructor call', async () => {
  const code = 'const provider = new FastProvider("testnet");';
  const calls = await extractFromCode(code, ['FastProvider', 'FastWallet']);
  assertEqual(calls.length, 1, 'should find 1 call');
  assertEqual(calls[0].method, 'FastProvider.constructor', 'method should be FastProvider.constructor');
  assertEqual(calls[0].args['_positional_0'] as string, 'testnet', 'first positional arg should be "testnet"');
});

await test('extractFromCode: variable tracking', async () => {
  const code = [
    'const provider = new FastProvider("testnet");',
    'const wallet = await FastWallet.fromKeyfile(provider);',
    'const balance = await wallet.balance();',
  ].join('\n');
  const calls = await extractFromCode(code, ['FastProvider', 'FastWallet']);
  assertEqual(calls.length, 3, 'should find 3 calls');
  // The 3rd call should resolve wallet → FastWallet via variable tracking
  assertEqual(calls[2].method, 'FastWallet.balance', 'third call method should be FastWallet.balance');
});

await test('extractFromCode: static method', async () => {
  const code = 'const wallet = await FastWallet.fromKeyfile(provider, "merchant");';
  const calls = await extractFromCode(code, ['FastProvider', 'FastWallet']);
  assertEqual(calls.length, 1, 'should find 1 call');
  assertEqual(calls[0].method, 'FastWallet.fromKeyfile', 'method should be FastWallet.fromKeyfile');
  assertEqual(calls[0].args['_positional_1'] as string, 'merchant', 'second positional arg should be "merchant"');
});

await test('extractFromCode: object arguments', async () => {
  const code = [
    'const provider = new FastProvider("testnet");',
    'const wallet = await FastWallet.fromKeyfile(provider);',
    'await wallet.send({ to: "fast1abc", amount: "5", token: "FAST" });',
  ].join('\n');
  const calls = await extractFromCode(code, ['FastProvider', 'FastWallet']);
  // Find the send call
  const sendCall = calls.find((c) => c.method === 'FastWallet.send');
  assert(sendCall !== undefined, 'should find a FastWallet.send call');
  assertEqual(sendCall!.args['to'] as string, 'fast1abc', 'to arg should be "fast1abc"');
  assertEqual(sendCall!.args['amount'] as string, '5', 'amount arg should be "5"');
  assertEqual(sendCall!.args['token'] as string, 'FAST', 'token arg should be "FAST"');
});

await test('extractFromCode: empty code returns empty array', async () => {
  const calls = await extractFromCode('', ['FastProvider', 'FastWallet']);
  assertEqual(calls.length, 0, 'should return empty array for empty code');
});

// Group 3: evaluateTask

await test('evaluateTask: perfect match → taskPassed=true', () => {
  const task = makeTask('t1', ['FastProvider.constructor', 'FastWallet.fromKeyfile']);
  const extractedCalls: ExtractedCall[] = [
    makeCall('FastProvider.constructor'),
    makeCall('FastWallet.fromKeyfile'),
  ];
  const result = evaluateTask({
    task,
    model: MODEL,
    generatedCode: null,
    rawResponse: '',
    extractedCalls,
    llmLatencyMs: 0,
    error: undefined,
    knownMethods: KNOWN_METHODS,
  });
  assertEqual(result.metrics.taskPassed, true, 'taskPassed should be true');
  assertEqual(result.metrics.toolSelectionAccuracy, 1.0, 'toolSelectionAccuracy should be 1.0');
  assertEqual(result.metrics.toolRecall, 1.0, 'toolRecall should be 1.0');
});

await test('evaluateTask: hallucinated method → hallucinationRate > 0', () => {
  const task = makeTask('t2', ['FastProvider.constructor']);
  const extractedCalls: ExtractedCall[] = [
    makeCall('FastProvider.constructor'),
    makeCall('FastWallet.doSomethingFake'),
  ];
  const result = evaluateTask({
    task,
    model: MODEL,
    generatedCode: null,
    rawResponse: '',
    extractedCalls,
    llmLatencyMs: 0,
    error: undefined,
    knownMethods: KNOWN_METHODS,
  });
  assert(result.metrics.hallucinatedCalls.length > 0, 'hallucinatedCalls should be non-empty');
  assert(result.metrics.hallucinationRate > 0, 'hallucinationRate should be > 0');
});

await test('evaluateTask: missing expected method → taskPassed=false', () => {
  const task = makeTask('t3', ['FastProvider.constructor', 'FastWallet.fromKeyfile']);
  // Only provide one of the two expected calls
  const extractedCalls: ExtractedCall[] = [
    makeCall('FastProvider.constructor'),
  ];
  const result = evaluateTask({
    task,
    model: MODEL,
    generatedCode: null,
    rawResponse: '',
    extractedCalls,
    llmLatencyMs: 0,
    error: undefined,
    knownMethods: KNOWN_METHODS,
  });
  assertEqual(result.metrics.taskPassed, false, 'taskPassed should be false');
  assert(result.metrics.toolRecall < 1.0, 'toolRecall should be < 1.0');
});

// Group 4: computeCoverage

await test('computeCoverage: identifies covered and uncovered methods', () => {
  const tasks: TaskDefinition[] = [
    makeTask('task-a', ['FastProvider.constructor']),
    makeTask('task-b', ['FastWallet.fromKeyfile']),
  ];
  const allMethods = ['FastProvider.constructor', 'FastWallet.fromKeyfile', 'FastWallet.send'];
  const coverage = computeCoverage(tasks, allMethods);

  assertEqual(coverage.length, 3, 'should return coverage for all 3 methods');

  const providerCov = coverage.find((c) => c.method === 'FastProvider.constructor');
  assert(providerCov !== undefined, 'should have coverage entry for FastProvider.constructor');
  assertEqual(providerCov!.covered, true, 'FastProvider.constructor should be covered');

  const walletCov = coverage.find((c) => c.method === 'FastWallet.fromKeyfile');
  assert(walletCov !== undefined, 'should have coverage entry for FastWallet.fromKeyfile');
  assertEqual(walletCov!.covered, true, 'FastWallet.fromKeyfile should be covered');

  const sendCov = coverage.find((c) => c.method === 'FastWallet.send');
  assert(sendCov !== undefined, 'should have coverage entry for FastWallet.send');
  assertEqual(sendCov!.covered, false, 'FastWallet.send should NOT be covered');
});

// ── Summary ────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);

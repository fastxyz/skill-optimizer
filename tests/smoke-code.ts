import { extractCodeBlock } from '../src/extractors/code-extractor.js';
import { extractFromCode, extractAllFromCode } from '../src/extractors/code-analyzer.js';
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

await test('extractFromCode: standalone function call', async () => {
  const code = `const result = await x402Pay({ url: 'https://api.example.com', wallet: { type: 'evm' } });`;
  const calls = await extractFromCode(code, [], ['x402Pay']);
  assertEqual(calls.length, 1, 'should find 1 call');
  assertEqual(calls[0].method, 'x402Pay', 'method should be x402Pay');
  assertEqual(calls[0].args['url'] as string, 'https://api.example.com', 'url arg');
});

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

await test('extractFromCode: nested object arguments', async () => {
  const code = [
    `const result = await x402Pay({`,
    `  url: 'https://api.example.com/premium',`,
    `  wallet: { type: 'evm', privateKey: '0x123', address: '0xabc' },`,
    `});`,
  ].join('\n');
  const calls = await extractFromCode(code, [], ['x402Pay']);
  assertEqual(calls.length, 1, 'should find 1 call');
  assertEqual((calls[0].args['wallet'] as Record<string, unknown>).type as string, 'evm', 'wallet.type arg');
  assertEqual((calls[0].args['wallet'] as Record<string, unknown>).address as string, '0xabc', 'wallet.address arg');
});

await test('extractFromCode: resolves identifier-backed nested arguments', async () => {
  const code = [
    `const fastWallet = { type: 'fast', address: 'fast1abc', publicKey: 'pub', privateKey: 'priv' };`,
    `const evmWallet = { type: 'evm', address: '0xabc', privateKey: '0x123' };`,
    `const result = await x402Pay({`,
    `  url: 'https://api.example.com/premium',`,
    `  wallet: [fastWallet, evmWallet],`,
    `});`,
  ].join('\n');
  const calls = await extractFromCode(code, [], ['x402Pay']);
  assertEqual(calls.length, 1, 'should find 1 call');
  const wallet = calls[0].args['wallet'] as unknown[];
  assertEqual((wallet[0] as Record<string, unknown>).type as string, 'fast', 'wallet[0].type arg');
  assertEqual((wallet[1] as Record<string, unknown>).type as string, 'evm', 'wallet[1].type arg');
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

await test('evaluateTask: nested expected args match recursively', () => {
  const task: TaskDefinition = {
    id: 'nested-args',
    prompt: 'Task nested',
    expected_tools: [
      {
        method: 'x402Pay',
        args: {
          url: 'https://api.example.com/premium',
          wallet: {
            type: 'evm',
            address: '0xabc',
          },
        } as unknown as Record<string, string>,
      },
    ],
  };
  const extractedCalls: ExtractedCall[] = [
    makeCall('x402Pay', {
      url: 'https://api.example.com/premium',
      wallet: {
        type: 'evm',
        privateKey: '0x123',
        address: '0xabc',
      },
    }),
  ];
  const result = evaluateTask({
    task,
    model: MODEL,
    generatedCode: null,
    rawResponse: '',
    extractedCalls,
    llmLatencyMs: 0,
    error: undefined,
    knownMethods: new Set(['x402Pay']),
  });
  assertEqual(result.metrics.taskPassed, true, 'taskPassed should be true for nested args');
  assertEqual(result.metrics.argAccuracy, 1.0, 'argAccuracy should be 1.0 for nested args');
});

await test('evaluateTask: nested expected args fail when nested field differs', () => {
  const task: TaskDefinition = {
    id: 'nested-args-fail',
    prompt: 'Task nested fail',
    expected_tools: [
      {
        method: 'x402Pay',
        args: {
          wallet: {
            type: 'fast',
          },
        } as unknown as Record<string, string>,
      },
    ],
  };
  const extractedCalls: ExtractedCall[] = [
    makeCall('x402Pay', {
      wallet: {
        type: 'evm',
      },
    }),
  ];
  const result = evaluateTask({
    task,
    model: MODEL,
    generatedCode: null,
    rawResponse: '',
    extractedCalls,
    llmLatencyMs: 0,
    error: undefined,
    knownMethods: new Set(['x402Pay']),
  });
  assertEqual(result.metrics.taskPassed, false, 'taskPassed should be false for mismatched nested args');
  assert(result.metrics.argAccuracy < 1.0, 'argAccuracy should be < 1.0 for mismatched nested args');
});

// Group 4: extractAllFromCode (generic, no config hints)

await test('extractAllFromCode: extracts all calls without hints', async () => {
  const code = [
    `const f = fast({ network: 'testnet' });`,
    `await f.setup();`,
    `await f.balance();`,
    `const result = await x402Pay({ url: 'https://example.com' });`,
    `console.log(result);`,
  ].join('\n');
  const { calls, bindings } = await extractAllFromCode(code);
  const methods = calls.map(c => c.method);
  assert(methods.includes('fast'), 'should find fast');
  assert(methods.includes('f.setup'), 'should find f.setup');
  assert(methods.includes('f.balance'), 'should find f.balance');
  assert(methods.includes('x402Pay'), 'should find x402Pay');
  assertEqual(bindings.get('f'), 'fast', 'f should be bound to fast');
});

await test('extractAllFromCode: extracts constructors and resolves via bindings', async () => {
  const code = [
    `const allset = new AllSetProvider({ network: 'testnet' });`,
    `await allset.sendToFast({ to: 'fast1abc', amount: '1000000' });`,
  ].join('\n');
  const { calls, bindings } = await extractAllFromCode(code);
  assertEqual(calls.length, 2, 'should find 2 calls');
  assertEqual(calls[0].method, 'AllSetProvider.constructor', 'first call should be constructor');
  assertEqual(calls[1].method, 'allset.sendToFast', 'second call raw is allset.sendToFast');
  assertEqual(bindings.get('allset'), 'AllSetProvider', 'allset bound to AllSetProvider');
});

await test('extractAllFromCode: extracts static method calls', async () => {
  const code = [
    `const provider = new FastProvider('testnet');`,
    `const wallet = await FastWallet.fromKeyfile(provider, 'merchant');`,
    `await wallet.send({ to: 'fast1abc', amount: '5' });`,
  ].join('\n');
  const { calls, bindings } = await extractAllFromCode(code);
  assertEqual(calls.length, 3, 'should find 3 calls');
  assertEqual(calls[0].method, 'FastProvider.constructor', 'constructor call');
  assertEqual(calls[1].method, 'FastWallet.fromKeyfile', 'static method call');
  assertEqual(calls[2].method, 'wallet.send', 'raw member call on wallet');
  assertEqual(bindings.get('provider'), 'FastProvider', 'provider bound to FastProvider');
  assertEqual(bindings.get('wallet'), 'FastWallet', 'wallet bound to FastWallet');
});

await test('extractAllFromCode: resolves literal-backed nested args', async () => {
  const code = [
    `const fastWallet = { type: 'fast', address: 'fast1abc' };`,
    `const evmWallet = { type: 'evm', address: '0xabc' };`,
    `const result = await x402Pay({ url: 'https://example.com', wallet: [fastWallet, evmWallet] });`,
  ].join('\n');
  const { calls } = await extractAllFromCode(code);
  assertEqual(calls.length, 1, 'should find 1 call');
  const wallet = calls[0].args['wallet'] as unknown[];
  assert(Array.isArray(wallet), 'wallet should be an array');
  assertEqual((wallet[0] as Record<string, unknown>).type as string, 'fast', 'wallet[0].type');
  assertEqual((wallet[1] as Record<string, unknown>).type as string, 'evm', 'wallet[1].type');
});

// Group 5: evaluateTask with bindings (task-driven resolution)

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

// Group 6: computeCoverage

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

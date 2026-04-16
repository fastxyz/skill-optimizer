import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { extractCodeBlock } from '../src/benchmark/extractors/code-extractor.js';
import { extractSdkCodeBlock } from '../src/benchmark/extractors/code-extractor.js';
import { extractAllFromCode } from '../src/benchmark/extractors/code-analyzer.js';
import { extract } from '../src/benchmark/extractors/index.js';
import { evaluateTask } from '../src/benchmark/evaluator.js';
import { computeCoverage } from '../src/benchmark/coverage.js';
import { initBenchmark } from '../src/benchmark/init.js';
import { loadConfig } from '../src/benchmark/config.js';
import type { ExtractedCall, TaskDefinition, ModelConfig, BenchmarkConfig, LLMResponse } from '../src/benchmark/types.js';

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
    expected_actions: methods.map((name) => ({ name })),
  };
}

function makeCall(method: string, args: Record<string, unknown> = {}): ExtractedCall {
  return { method, args, line: 1, raw: 'mock' };
}

// ── Tests ──────────────────────────────────────────────────────────────────

console.log('\n=== SDK Surface Smoke Tests ===\n');

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

await test('extractSdkCodeBlock: finds python block', () => {
  const md = '```python\nclient = FastClient()\n```';
  const result = extractSdkCodeBlock(md, 'python');
  assertEqual(result, 'client = FastClient()', 'should extract python block content');
});

await test('extractSdkCodeBlock: finds rust block', () => {
  const md = '```rust\nlet client = FastClient::new();\n```';
  const result = extractSdkCodeBlock(md, 'rust');
  assertEqual(result, 'let client = FastClient::new();', 'should extract rust block content');
});

await test('loadConfig: rejects unsupported sdk language', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'skill-optimizer-lang-'));
  try {
    const configPath = join(dir, 'skill-optimizer.json');
    writeFileSync(configPath, JSON.stringify({
      name: 'bad-sdk',
      target: {
        surface: 'sdk',
        repoPath: '.',
        sdk: { language: 'java' },
      },
      benchmark: {
        tasks: './tasks.json',
        baseUrl: 'https://example.com',
        format: 'openai',
        models: [{ id: 'test/model', name: 'Test Model', tier: 'flagship' }],
      },
    }, null, 2), 'utf-8');
    writeFileSync(join(dir, 'tasks.json'), JSON.stringify({ tasks: [] }, null, 2), 'utf-8');

    let threw = false;
    try {
      await loadConfig(configPath);
    } catch (error: any) {
      threw = true;
      assert(
        error.message.includes('sdk.language'),
        'error should mention sdk.language validation',
      );
    }

    assert(threw, 'should reject unsupported sdk.language values');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Group 2: extractAllFromCode (tree-sitter, no config hints needed)

await test('extractAllFromCode: constructor call', async () => {
  const code = 'const provider = new FastProvider("testnet");';
  const { calls } = await extractAllFromCode(code);
  assertEqual(calls.length, 1, 'should find 1 call');
  assertEqual(calls[0].method, 'FastProvider.constructor', 'method should be FastProvider.constructor');
  assertEqual(calls[0].args['_positional_0'] as string, 'testnet', 'first positional arg should be "testnet"');
});

await test('extractAllFromCode: variable tracking (raw calls)', async () => {
  const code = [
    'const provider = new FastProvider("testnet");',
    'const wallet = await FastWallet.fromKeyfile(provider);',
    'const balance = await wallet.balance();',
  ].join('\n');
  const { calls } = await extractAllFromCode(code);
  assertEqual(calls.length, 3, 'should find 3 calls');
  // Raw extraction: wallet.balance is unresolved (resolution happens in evaluateTask with bindings)
  assertEqual(calls[2].method, 'wallet.balance', 'third raw call method should be wallet.balance');
});

await test('extractAllFromCode: static method', async () => {
  const code = 'const wallet = await FastWallet.fromKeyfile(provider, "merchant");';
  const { calls } = await extractAllFromCode(code);
  assertEqual(calls.length, 1, 'should find 1 call');
  assertEqual(calls[0].method, 'FastWallet.fromKeyfile', 'method should be FastWallet.fromKeyfile');
  assertEqual(calls[0].args['_positional_1'] as string, 'merchant', 'second positional arg should be "merchant"');
});

await test('extractAllFromCode: object arguments', async () => {
  const code = [
    'const provider = new FastProvider("testnet");',
    'const wallet = await FastWallet.fromKeyfile(provider);',
    'await wallet.send({ to: "fast1abc", amount: "5", token: "FAST" });',
  ].join('\n');
  const { calls } = await extractAllFromCode(code);
  // Raw extraction: wallet.send is unresolved
  const sendCall = calls.find((c) => c.method === 'wallet.send');
  assert(sendCall !== undefined, 'should find a wallet.send call (raw, unresolved)');
  assertEqual(sendCall!.args['to'] as string, 'fast1abc', 'to arg should be "fast1abc"');
  assertEqual(sendCall!.args['amount'] as string, '5', 'amount arg should be "5"');
  assertEqual(sendCall!.args['token'] as string, 'FAST', 'token arg should be "FAST"');
});

await test('extractAllFromCode: empty code returns empty arrays', async () => {
  const { calls, bindings } = await extractAllFromCode('');
  assertEqual(calls.length, 0, 'should return empty array for empty code');
  assertEqual(bindings.size, 0, 'should return empty bindings for empty code');
});

await test('extractAllFromCode: standalone function call', async () => {
  const code = `const result = await x402Pay({ url: 'https://api.example.com', wallet: { type: 'evm' } });`;
  const { calls } = await extractAllFromCode(code);
  assertEqual(calls.length, 1, 'should find 1 call');
  assertEqual(calls[0].method, 'x402Pay', 'method should be x402Pay');
  assertEqual(calls[0].args['url'] as string, 'https://api.example.com', 'url arg');
});

await test('extractAllFromCode: bindings capture factory returns', async () => {
  const code = [
    `const f = fast({ network: 'testnet' });`,
    `await f.setup();`,
    `const balance = await f.balance({ token: 'FAST' });`,
  ].join('\n');
  const { calls, bindings } = await extractAllFromCode(code);
  assertEqual(calls.length, 3, 'should find 3 calls');
  assertEqual(calls[0].method, 'fast', 'first call should be fast');
  assertEqual(calls[0].args['network'] as string, 'testnet', 'network arg');
  // Raw calls use variable names; bindings map f → fast
  assertEqual(calls[1].method, 'f.setup', 'second raw call should be f.setup');
  assertEqual(calls[2].method, 'f.balance', 'third raw call should be f.balance');
  assertEqual(bindings.get('f'), 'fast', 'bindings should map f → fast');
  assertEqual(calls[2].args['token'] as string, 'FAST', 'token arg');
});

await test('extractAllFromCode: mixed classes and functions', async () => {
  const code = [
    `const account = createEvmWallet('~/.evm/keys/default.json');`,
    `const allset = new AllSetProvider({ network: 'testnet' });`,
    `await allset.sendToFast({ chain: 'arbitrum', token: 'USDC', amount: '1000000' });`,
  ].join('\n');
  const { calls } = await extractAllFromCode(code);
  assertEqual(calls.length, 3, 'should find 3 calls');
  assertEqual(calls[0].method, 'createEvmWallet', 'first call should be createEvmWallet');
  assertEqual(calls[0].args['_positional_0'] as string, '~/.evm/keys/default.json', 'keyfile path arg');
  assertEqual(calls[1].method, 'AllSetProvider.constructor', 'second call should be AllSetProvider.constructor');
  // Raw: allset.sendToFast (unresolved)
  assertEqual(calls[2].method, 'allset.sendToFast', 'third raw call should be allset.sendToFast');
  assertEqual(calls[2].args['chain'] as string, 'arbitrum', 'chain arg');
});

await test('extractAllFromCode: standalone function with no classes', async () => {
  const code = [
    `const result = await x402Pay({`,
    `  url: 'https://api.example.com/premium',`,
    `  wallet: { type: 'evm', privateKey: '0x123', address: '0xabc' },`,
    `  verbose: true,`,
    `});`,
  ].join('\n');
  const { calls } = await extractAllFromCode(code);
  assertEqual(calls.length, 1, 'should find 1 call');
  assertEqual(calls[0].method, 'x402Pay', 'method should be x402Pay');
  assertEqual(calls[0].args['url'] as string, 'https://api.example.com/premium', 'url arg');
  assertEqual(calls[0].args['verbose'] as boolean, true, 'verbose arg');
});

await test('extractAllFromCode: nested object arguments', async () => {
  const code = [
    `const result = await x402Pay({`,
    `  url: 'https://api.example.com/premium',`,
    `  wallet: { type: 'evm', privateKey: '0x123', address: '0xabc' },`,
    `});`,
  ].join('\n');
  const { calls } = await extractAllFromCode(code);
  assertEqual(calls.length, 1, 'should find 1 call');
  assertEqual((calls[0].args['wallet'] as Record<string, unknown>).type as string, 'evm', 'wallet.type arg');
  assertEqual((calls[0].args['wallet'] as Record<string, unknown>).address as string, '0xabc', 'wallet.address arg');
});

await test('extractAllFromCode: resolves identifier-backed nested arguments', async () => {
  const code = [
    `const fastWallet = { type: 'fast', address: 'fast1abc', publicKey: 'pub', privateKey: 'priv' };`,
    `const evmWallet = { type: 'evm', address: '0xabc', privateKey: '0x123' };`,
    `const result = await x402Pay({`,
    `  url: 'https://api.example.com/premium',`,
    `  wallet: [fastWallet, evmWallet],`,
    `});`,
  ].join('\n');
  const { calls } = await extractAllFromCode(code);
  assertEqual(calls.length, 1, 'should find 1 call');
  const wallet = calls[0].args['wallet'] as unknown[];
  assertEqual((wallet[0] as Record<string, unknown>).type as string, 'fast', 'wallet[0].type arg');
  assertEqual((wallet[1] as Record<string, unknown>).type as string, 'evm', 'wallet[1].type arg');
});

await test('extract factory dispatches surface=sdk', async () => {
  const config: BenchmarkConfig = {
    name: 'test-sdk',
    surface: 'sdk',
    sdk: { language: 'typescript' },
    tasks: 'tasks.json',
    llm: {
      baseUrl: '',
      apiKeyEnv: 'OPENROUTER_API_KEY',
      format: 'openai',
      models: [],
    },
  };

  const response: LLMResponse = {
    content: '```ts\nconst provider = new FastProvider("testnet");\n```',
  };

  const { calls, generatedCode } = await extract(response, config);
  assertEqual(generatedCode, 'const provider = new FastProvider("testnet");', 'should preserve extracted TypeScript block');
  assertEqual(calls.length, 1, 'one call expected');
  assertEqual(calls[0].method, 'FastProvider.constructor', 'method should be parsed');
});

await test('initBenchmark sdk: creates skill-optimizer.json with task generation enabled', () => {
  const dir = mkdtempSync(join(tmpdir(), 'skill-optimizer-init-'));
  try {
    initBenchmark(dir, 'sdk');
    const config = JSON.parse(readFileSync(join(dir, '.skill-optimizer', 'skill-optimizer.json'), 'utf-8')) as {
      target: { surface: string };
      benchmark: { taskGeneration?: { enabled?: boolean }; tasks?: string };
    };
    assertEqual(config.target.surface, 'sdk', 'sdk scaffold should emit sdk surface');
    assert(config.benchmark.taskGeneration?.enabled === true, 'scaffold should enable task generation');
    assert(!config.benchmark.tasks, 'scaffold should not set benchmark.tasks when task generation is on');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

await test('initBenchmark cli: creates cli-commands.json and sets target.cli.commands', () => {
  const dir = mkdtempSync(join(tmpdir(), 'skill-optimizer-init-'));
  try {
    initBenchmark(dir, 'cli');
    const configPath = join(dir, '.skill-optimizer', 'skill-optimizer.json');
    const commandsPath = join(dir, '.skill-optimizer', 'cli-commands.json');
    const config = JSON.parse(readFileSync(configPath, 'utf-8')) as {
      target: { surface: string; cli?: { commands?: string } };
      benchmark: { taskGeneration?: { enabled?: boolean }; tasks?: string };
    };
    assertEqual(config.target.surface, 'cli', 'cli scaffold should emit cli surface');
    assert(existsSync(commandsPath), 'cli scaffold should create cli-commands.json');
    assert(typeof config.target.cli?.commands === 'string', 'cli scaffold should set target.cli.commands');
    assert(config.benchmark.taskGeneration?.enabled === true, 'cli scaffold should enable task generation');
    assert(!config.benchmark.tasks, 'cli scaffold should not set benchmark.tasks');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

await test('initBenchmark mcp: creates tools.json and sets target.mcp.tools', () => {
  const dir = mkdtempSync(join(tmpdir(), 'skill-optimizer-init-'));
  try {
    initBenchmark(dir, 'mcp');
    const configPath = join(dir, '.skill-optimizer', 'skill-optimizer.json');
    const toolsPath = join(dir, '.skill-optimizer', 'tools.json');
    const config = JSON.parse(readFileSync(configPath, 'utf-8')) as {
      target: { surface: string; mcp?: { tools?: string } };
      benchmark: { taskGeneration?: { enabled?: boolean }; tasks?: string };
    };
    assertEqual(config.target.surface, 'mcp', 'mcp scaffold should emit mcp surface');
    assert(existsSync(toolsPath), 'mcp scaffold should create tools.json');
    assert(typeof config.target.mcp?.tools === 'string', 'mcp scaffold should set target.mcp.tools');
    assert(config.benchmark.taskGeneration?.enabled === true, 'mcp scaffold should enable task generation');
    assert(!config.benchmark.tasks, 'mcp scaffold should not set benchmark.tasks');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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
    surface: 'sdk',
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
    surface: 'sdk',
    generatedCode: null,
    rawResponse: '',
    extractedCalls,
    llmLatencyMs: 0,
    error: undefined,
    knownMethods: KNOWN_METHODS,
  });
  assert(result.metrics.hallucinatedActions.length > 0, 'hallucinatedActions should be non-empty');
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
    surface: 'sdk',
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
    expected_actions: [
      {
        name: 'x402Pay',
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
    surface: 'sdk',
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
    expected_actions: [
      {
        name: 'x402Pay',
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
    surface: 'sdk',
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
    expected_actions: [
      { name: 'fast', args: { network: 'testnet' } },
      { name: 'FastClient.setup' },
      { name: 'FastClient.balance' },
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
    surface: 'sdk',
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
    expected_actions: [
      { name: 'AllSetProvider.constructor', args: { network: 'testnet' } },
      { name: 'AllSetProvider.sendToFast' },
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
    surface: 'sdk',
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

console.log('\n=== Doctor / checkConfig Tests ===\n');

await test('checkConfig: valid sdk config returns no errors', async () => {
  const { checkConfig } = await import('../src/project/validate.js');
  const dir = mkdtempSync(join(tmpdir(), 'skill-optimizer-check-'));
  try {
    // Create real files so path-existence checks pass
    writeFileSync(join(dir, 'index.ts'), '// entry', 'utf-8');
    writeFileSync(join(dir, 'tasks.json'), JSON.stringify({ tasks: [] }), 'utf-8');
    const configPath = join(dir, 'skill-optimizer.json');
    const config = {
      name: 'my-sdk',
      target: { surface: 'sdk' as const, discovery: { sources: ['./index.ts'], language: 'typescript' as const } },
      benchmark: {
        format: 'pi' as const,
        models: [{ id: 'openrouter/openai/gpt-4o', name: 'GPT-4o', tier: 'flagship' as const }],
        tasks: './tasks.json',
      },
    };
    const issues = await checkConfig(config as any, configPath);
    // Filter out api-key-not-set warning (env-dependent) and focus on real errors
    const errors = issues.filter(i => i.severity === 'error');
    assert(errors.length === 0, `expected 0 errors, got: ${errors.map(i => i.message).join(', ')}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

await test('checkConfig: missing name returns error', async () => {
  const { checkConfig } = await import('../src/project/validate.js');
  const config = {
    target: { surface: 'sdk' as const },
    benchmark: { models: [] },
  };
  const issues = await checkConfig(config as any, '/fake/path/skill-optimizer.json');
  const err = issues.find(i => i.code === 'missing-name');
  assert(err !== undefined, 'expected missing-name error');
  assert(err!.severity === 'error', 'should be error severity');
});

await test('checkConfig: invalid surface returns error', async () => {
  const { checkConfig } = await import('../src/project/validate.js');
  const config = {
    name: 'test',
    target: { surface: 'grpc' },
    benchmark: { models: [{ id: 'openrouter/openai/gpt-4o', name: 'GPT-4o', tier: 'flagship' }] },
  };
  const issues = await checkConfig(config as any, '/fake/path/skill-optimizer.json');
  const err = issues.find(i => i.code === 'invalid-surface');
  assert(err !== undefined, 'expected invalid-surface issue');
  assert(err!.severity === 'error', 'should be error severity');
});

await test('checkConfig: empty models array returns error', async () => {
  const { checkConfig } = await import('../src/project/validate.js');
  const config = {
    name: 'test',
    target: { surface: 'sdk' as const },
    benchmark: { models: [] },
  };
  const issues = await checkConfig(config as any, '/fake/path/skill-optimizer.json');
  const err = issues.find(i => i.code === 'missing-models');
  assert(err !== undefined, 'expected missing-models error for benchmark.models');
});

await test('checkConfig: model ID missing openrouter/ prefix → fixable error', async () => {
  const { checkConfig } = await import('../src/project/validate.js');
  const config = {
    name: 'test',
    target: { surface: 'cli' as const, discovery: { sources: ['./src/cli.ts'] } },
    benchmark: {
      format: 'pi' as const,
      models: [{ id: 'z-ai/glm-5.1', name: 'GLM', tier: 'mid' as const }],
      taskGeneration: { enabled: true, maxTasks: 5 },
    },
  };
  const issues = await checkConfig(config as any, '/fake/skill-optimizer.json');
  const err = issues.find(i => i.code === 'model-id-missing-prefix');
  assert(err !== undefined, 'expected model-id-missing-prefix issue');
  assert(err!.fixable === true, 'model-id-missing-prefix should be fixable');
  assert(err!.severity === 'error', 'model-id-missing-prefix should be error severity');
  assert(err!.hint?.includes('openrouter/z-ai/glm-5.1'), `hint should show corrected ID, got: ${err!.hint}`);
});

await test('checkConfig: model ID with dot version → fixable warning', async () => {
  const { checkConfig } = await import('../src/project/validate.js');
  const config = {
    name: 'test',
    target: { surface: 'cli' as const, discovery: { sources: ['./src/cli.ts'] } },
    benchmark: {
      format: 'pi' as const,
      models: [{ id: 'openrouter/anthropic/claude-sonnet-4.6', name: 'Claude', tier: 'flagship' as const }],
      taskGeneration: { enabled: true, maxTasks: 5 },
    },
  };
  const issues = await checkConfig(config as any, '/fake/skill-optimizer.json');
  const warn = issues.find(i => i.code === 'model-id-bad-format');
  assert(warn !== undefined, 'expected model-id-bad-format issue');
  assert(warn!.severity === 'warning', 'should be warning severity');
  assert(warn!.fixable === true, 'model-id-bad-format should be fixable');
  assert(warn!.hint?.includes('4-6'), `hint should show hyphen version, got: ${warn!.hint}`);
});

await test('checkConfig: direct openai model IDs do not get OpenRouter dot-version warning', async () => {
  const { checkConfig } = await import('../src/project/validate.js');
  const config = {
    name: 'test',
    target: { surface: 'cli' as const, discovery: { sources: ['./src/cli.ts'] } },
    benchmark: {
      format: 'pi' as const,
      models: [{ id: 'openai/gpt-5.4', name: 'GPT-5.4', tier: 'flagship' as const }],
      taskGeneration: { enabled: true, maxTasks: 5 },
    },
  };
  const issues = await checkConfig(config as any, '/fake/skill-optimizer.json');
  const warn = issues.find(i => i.code === 'model-id-bad-format');
  assert(warn === undefined, 'direct openai model IDs should not be warned as OpenRouter dot versions');
});

await test('checkConfig: codex auth rejects non-openai benchmark models', async () => {
  const { checkConfig } = await import('../src/project/validate.js');
  const config = {
    name: 'test',
    target: { surface: 'sdk' as const, discovery: { sources: ['./src/index.ts'], language: 'typescript' as const } },
    benchmark: {
      format: 'pi' as const,
      authMode: 'codex' as const,
      models: [
        { id: 'openai/gpt-5.4', name: 'GPT-5.4', tier: 'flagship' as const },
        { id: 'openrouter/openai/gpt-5.4', name: 'OpenRouter GPT-5.4', tier: 'flagship' as const },
      ],
      tasks: './tasks.json',
    },
  };
  const issues = await checkConfig(config as any, '/fake/skill-optimizer.json');
  const err = issues.find(i => i.code === 'codex-auth-provider-mismatch' && i.field.includes('benchmark.models'));
  assert(err !== undefined, 'expected codex-auth-provider-mismatch for benchmark.models');
  assert(err!.severity === 'error', 'benchmark model/provider mismatch should be an error');
});

await test('checkConfig: codex auth rejects non-openai optimize model', async () => {
  const { checkConfig } = await import('../src/project/validate.js');
  const config = {
    name: 'test',
    target: { surface: 'sdk' as const, discovery: { sources: ['./src/index.ts'], language: 'typescript' as const } },
    benchmark: {
      format: 'pi' as const,
      models: [{ id: 'openai/gpt-5.4', name: 'GPT-5.4', tier: 'flagship' as const }],
      tasks: './tasks.json',
    },
    optimize: {
      authMode: 'codex' as const,
      model: 'openrouter/anthropic/claude-sonnet-4-6',
      allowedPaths: ['SKILL.md'],
    },
  };
  const issues = await checkConfig(config as any, '/fake/skill-optimizer.json');
  const err = issues.find(i => i.code === 'codex-auth-provider-mismatch' && i.field === 'optimize.model');
  assert(err !== undefined, 'expected codex-auth-provider-mismatch for optimize.model');
  assert(err!.severity === 'error', 'optimize model/provider mismatch should be an error');
});

await test('checkConfig: inherited codex auth rejects non-openai optimize model', async () => {
  const { checkConfig } = await import('../src/project/validate.js');
  const config = {
    name: 'test',
    target: { surface: 'sdk' as const, discovery: { sources: ['./src/index.ts'], language: 'typescript' as const } },
    benchmark: {
      format: 'pi' as const,
      authMode: 'codex' as const,
      models: [{ id: 'openai/gpt-5.4', name: 'GPT-5.4', tier: 'flagship' as const }],
      tasks: './tasks.json',
    },
    optimize: {
      model: 'openrouter/anthropic/claude-sonnet-4-6',
      allowedPaths: ['SKILL.md'],
    },
  };
  const issues = await checkConfig(config as any, '/fake/skill-optimizer.json');
  const err = issues.find(i => i.code === 'codex-auth-provider-mismatch' && i.field === 'optimize.model');
  assert(err !== undefined, 'expected inherited codex-auth-provider-mismatch for optimize.model');
  assert(err!.severity === 'error', 'inherited optimize model/provider mismatch should be an error');
});

await test('applyFixes: adds openrouter/ prefix to model IDs', async () => {
  const { applyFixes } = await import('../src/project/fix.js');
  const { checkConfig } = await import('../src/project/validate.js');
  const rawJson = {
    name: 'test',
    target: { surface: 'cli', discovery: { sources: ['./src/cli.ts'] } },
    benchmark: {
      format: 'pi',
      models: [
        { id: 'z-ai/glm-5.1', name: 'GLM', tier: 'mid' },
        { id: 'openrouter/openai/gpt-4o', name: 'GPT', tier: 'flagship' },
      ],
      taskGeneration: { enabled: true, maxTasks: 5 },
    },
  };
  const issues = await checkConfig(rawJson as any, '/fake/skill-optimizer.json');
  const fixed = applyFixes(rawJson as any, issues, '/fake');
  const models = (fixed.benchmark as any).models as Array<{ id: string }>;
  assertEqual(models[0]!.id, 'openrouter/z-ai/glm-5.1', 'prefix should be prepended');
  assertEqual(models[1]!.id, 'openrouter/openai/gpt-4o', 'already-prefixed ID should be unchanged');
});

await test('applyFixes: normalises dot versions in model IDs', async () => {
  const { applyFixes } = await import('../src/project/fix.js');
  const { checkConfig } = await import('../src/project/validate.js');
  const rawJson = {
    name: 'test',
    target: { surface: 'cli', discovery: { sources: ['./src/cli.ts'] } },
    benchmark: {
      format: 'pi',
      models: [{ id: 'openrouter/anthropic/claude-sonnet-4.6', name: 'Claude', tier: 'flagship' }],
      taskGeneration: { enabled: true, maxTasks: 5 },
    },
  };
  const issues = await checkConfig(rawJson as any, '/fake/skill-optimizer.json');
  const fixed = applyFixes(rawJson as any, issues, '/fake');
  const models = (fixed.benchmark as any).models as Array<{ id: string }>;
  assertEqual(models[0]!.id, 'openrouter/anthropic/claude-sonnet-4-6', 'dots should be replaced with hyphens');
});

await test('applyFixes: does not mutate input', async () => {
  const { applyFixes } = await import('../src/project/fix.js');
  const { checkConfig } = await import('../src/project/validate.js');
  const rawJson = {
    name: 'test',
    target: { surface: 'cli', discovery: { sources: ['./src/cli.ts'] } },
    benchmark: {
      format: 'pi',
      models: [{ id: 'z-ai/glm-5.1', name: 'GLM', tier: 'mid' }],
      taskGeneration: { enabled: true, maxTasks: 5 },
    },
  };
  const issues = await checkConfig(rawJson as any, '/fake/skill-optimizer.json');
  applyFixes(rawJson as any, issues, '/fake');
  assertEqual((rawJson.benchmark.models[0] as any).id, 'z-ai/glm-5.1', 'input should not be mutated');
});

console.log('\n=== Doctor command smoke tests ===\n');

await test('doctor --static: exits 1 for config with model-id error', async () => {
  const { runDoctor } = await import('../src/doctor/index.js');
  const dir = mkdtempSync(join(tmpdir(), 'skill-optimizer-doctor-'));
  try {
    const configPath = join(dir, 'skill-optimizer.json');
    writeFileSync(configPath, JSON.stringify({
      name: 'test-bad',
      target: { surface: 'cli', discovery: { sources: ['./src/cli.ts'] } },
      benchmark: {
        format: 'pi',
        models: [{ id: 'z-ai/glm-5.1', name: 'GLM', tier: 'mid' }],
        taskGeneration: { enabled: true, maxTasks: 5 },
      },
    }, null, 2), 'utf-8');

    const exitCode = await runDoctor(configPath, { staticOnly: true });
    assertEqual(exitCode, 1, 'should exit 1 for model-id-missing-prefix error');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

await test('doctor --static: exits 0 or 1 (not 2) for readable config', async () => {
  const { runDoctor } = await import('../src/doctor/index.js');
  const dir = mkdtempSync(join(tmpdir(), 'skill-optimizer-doctor-'));
  try {
    const configPath = join(dir, 'skill-optimizer.json');
    writeFileSync(configPath, JSON.stringify({
      name: 'test-ok',
      target: { surface: 'mcp', discovery: { sources: ['./src/server.ts'] } },
      benchmark: {
        format: 'pi',
        models: [{ id: 'openrouter/openai/gpt-4o', name: 'GPT-4o', tier: 'flagship' }],
        taskGeneration: { enabled: true, maxTasks: 10 },
      },
    }, null, 2), 'utf-8');

    const exitCode = await runDoctor(configPath, { staticOnly: true });
    // discovery-source-missing fires (./src/server.ts doesn't exist in tmpdir)
    // but config is readable JSON so it must not be exit code 2
    assert(exitCode === 0 || exitCode === 1, `should exit 0 or 1 (config is readable JSON), got ${exitCode}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

await test('doctor --fix: corrects model ID in-place', async () => {
  const { runDoctor } = await import('../src/doctor/index.js');
  const dir = mkdtempSync(join(tmpdir(), 'skill-optimizer-doctor-'));
  try {
    const configPath = join(dir, 'skill-optimizer.json');
    writeFileSync(configPath, JSON.stringify({
      name: 'test-fix',
      target: { surface: 'cli', discovery: { sources: ['./src/cli.ts'] } },
      benchmark: {
        format: 'pi',
        models: [{ id: 'z-ai/glm-5.1', name: 'GLM', tier: 'mid' }],
        taskGeneration: { enabled: true, maxTasks: 5 },
      },
    }, null, 2), 'utf-8');

    await runDoctor(configPath, { staticOnly: true, fix: true });

    const fixed = JSON.parse(readFileSync(configPath, 'utf-8')) as { benchmark: { models: Array<{ id: string }> } };
    // Fixed-point loop applies both prefix and dot-normalisation fixes in sequence
    assertEqual(fixed.benchmark.models[0]!.id, 'openrouter/z-ai/glm-5-1', '--fix should write corrected model ID');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

await test('checkModelReachability: mixed list skips non-openrouter and probes only openrouter models', async () => {
  const { checkModelReachability } = await import('../src/doctor/checks.js');

  const project = {
    configPath: '/fake/skill-optimizer.json',
    configDir: '/fake',
    name: 'test-mixed',
    target: {
      surface: 'mcp',
      repoPath: '/fake',
      scope: { include: ['.*'], exclude: [] },
    },
    benchmark: {
      format: 'pi',
      authMode: 'env',
      timeout: 30000,
      models: [
        { id: 'anthropic/claude-sonnet-4-6', name: 'Claude', tier: 'flagship' as const },
        { id: 'openrouter/openai/gpt-4o', name: 'GPT-4o', tier: 'flagship' as const },
      ],
      taskGeneration: { enabled: false, maxTasks: 10, useExisting: false },
      output: { dir: '/fake/.results' },
      verdict: { perModelFloor: 0.5, targetWeightedAverage: 0.6 },
    },
  } as unknown as ResolvedProjectConfig;

  // Without OPENROUTER_API_KEY set the key resolution throws, so the function
  // returns early after emitting reachability-skipped. We verify:
  //   1. A reachability-skipped issue appears (for the 1 non-openrouter model)
  //   2. No reachability-skipped with field 'benchmark.format' (wrong early-exit path)
  //   3. No model-unreachable for the anthropic model
  const savedKey = process.env['OPENROUTER_API_KEY'];
  delete process.env['OPENROUTER_API_KEY'];
  try {
    const issues = await checkModelReachability(project);
    const skipped = issues.filter((i) => i.code === 'reachability-skipped');
    assert(skipped.length >= 1, 'should have at least one reachability-skipped issue');
    const modelSkipped = skipped.find((i) => i.field === 'benchmark.models');
    assert(modelSkipped !== undefined, 'reachability-skipped issue should reference benchmark.models field');
    assert(
      modelSkipped!.message.includes('1 non-OpenRouter'),
      `message should count 1 skipped, got: ${modelSkipped!.message}`,
    );
    const anthropicUnreachable = issues.find(
      (i) => i.code === 'model-unreachable' && i.message.includes('anthropic/'),
    );
    assert(anthropicUnreachable === undefined, 'anthropic model must not produce a model-unreachable issue');
  } finally {
    if (savedKey !== undefined) process.env['OPENROUTER_API_KEY'] = savedKey;
  }
});

// ── Summary ────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);

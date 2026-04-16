import { extractSdkCodeBlock } from '../src/benchmark/extractors/code-extractor.js';
import { extractSdkFromCode } from '../src/benchmark/extractors/sdk/registry.js';
import { extract } from '../src/benchmark/extractors/index.js';
import { evaluateTask } from '../src/benchmark/evaluator.js';
import type { BenchmarkConfig, LLMResponse } from '../src/benchmark/types.js';

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

console.log('\n=== Python SDK Smoke Tests ===\n');

await test('python block extraction', () => {
  const result = extractSdkCodeBlock('```python\nclient = FastClient()\n```', 'python');
  assertEqual(result, 'client = FastClient()', 'should extract python fenced block');
});

await test('python: constructor call', async () => {
  const { calls } = await extractSdkFromCode('client = FastClient("testnet")', 'python');
  assertEqual(calls.length, 1, 'one call expected');
  assertEqual(calls[0].method, 'FastClient.constructor', 'constructor normalized');
  assertEqual(calls[0].args._positional_0 as string, 'testnet', 'constructor arg preserved');
});

await test('python: class and instance methods', async () => {
  const code = [
    'wallet = FastWallet.from_keyfile(provider)',
    'await wallet.send(to="fast1abc", amount="5")',
  ].join('\n');
  const { calls } = await extractSdkFromCode(code, 'python');
  assertEqual(calls.length, 2, 'two calls expected');
  assertEqual(calls[0].method, 'FastWallet.from_keyfile', 'class method normalized');
  assertEqual(calls[1].method, 'FastWallet.send', 'instance method resolved through binding');
  assertEqual(calls[1].args.to as string, 'fast1abc', 'keyword arg to preserved');
  assertEqual(calls[1].args.amount as string, '5', 'keyword arg amount preserved');
});

await test('python: async assignment preserves instance binding', async () => {
  const code = [
    'wallet = await FastWallet.from_keyfile(provider)',
    'await wallet.send(to="fast1abc")',
  ].join('\n');
  const { calls } = await extractSdkFromCode(code, 'python');
  assertEqual(calls.length, 2, 'two calls expected');
  assertEqual(calls[0].method, 'FastWallet.from_keyfile', 'async assignment source call preserved');
  assertEqual(calls[1].method, 'FastWallet.send', 'instance call should resolve through async binding');
});

await test('python: factory methods do not mislabel returned instance type', async () => {
  const code = [
    'client = FastClient("testnet")',
    'wallet = client.wallet()',
    'await wallet.send(to="fast1abc")',
  ].join('\n');
  const extraction = await extractSdkFromCode(code, 'python');

  const task = {
    id: 'python-factory-binding',
    prompt: 'send a payment',
    expected_actions: [
      { name: 'FastClient.constructor', args: { _positional_0: 'testnet' } },
      { name: 'FastWallet.send', args: { to: 'fast1abc' } },
    ],
  };
  const result = evaluateTask({
    task,
    model: { id: 'test/model', name: 'Test Model', tier: 'flagship' },
    generatedCode: code,
    rawResponse: code,
    extractedCalls: extraction.calls,
    llmLatencyMs: 1,
    knownMethods: new Set(['FastClient.constructor', 'FastWallet.send']),
    bindings: extraction.bindings,
    surface: 'sdk',
  });

  assertEqual(result.metrics.taskPassed, true, 'factory-bound wallet.send should resolve to FastWallet.send');
});

await test('python: standalone function with nested literals', async () => {
  const code = 'result = fast(network="testnet", wallets=[{"type": "fast"}])';
  const { calls } = await extractSdkFromCode(code, 'python');
  assertEqual(calls.length, 1, 'one function call expected');
  assertEqual(calls[0].method, 'fast', 'standalone function kept');
  assertEqual(calls[0].args.network as string, 'testnet', 'keyword arg preserved');
  const wallets = calls[0].args.wallets as Array<Record<string, unknown>>;
  assert(Array.isArray(wallets), 'wallets should be an array');
  assertEqual(wallets[0].type as string, 'fast', 'nested dict value preserved');
});

await test('python: extract() dispatches sdk language', async () => {
  const config: BenchmarkConfig = {
    name: 'python-sdk',
    surface: 'sdk',
    sdk: { language: 'python' },
    tasks: 'tasks.json',
    llm: {
      baseUrl: '',
      apiKeyEnv: 'OPENROUTER_API_KEY',
      format: 'openai',
      models: [],
    },
  };
  const response: LLMResponse = {
    content: '```python\nwallet = FastWallet.from_keyfile(provider)\n```',
  };
  const { calls, generatedCode } = await extract(response, config);
  assertEqual(generatedCode, 'wallet = FastWallet.from_keyfile(provider)', 'should preserve python code block');
  assertEqual(calls.length, 1, 'one call expected');
  assertEqual(calls[0].method, 'FastWallet.from_keyfile', 'python sdk call extracted');
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);

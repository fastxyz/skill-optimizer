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

console.log('\n=== Rust SDK Smoke Tests ===\n');

await test('rust block extraction', () => {
  const result = extractSdkCodeBlock('```rust\nlet client = FastClient::new("testnet");\n```', 'rust');
  assertEqual(result, 'let client = FastClient::new("testnet");', 'should extract rust fenced block');
});

await test('rust: associated function call', async () => {
  const { calls } = await extractSdkFromCode('let client = FastClient::new("testnet");', 'rust');
  assertEqual(calls.length, 1, 'one call expected');
  assertEqual(calls[0].method, 'FastClient.new', 'associated function normalized');
  assertEqual(calls[0].args._positional_0 as string, 'testnet', 'associated function arg preserved');
});

await test('rust: instance method with struct arg', async () => {
  const code = [
    'let wallet = FastWallet::from_keyfile(provider);',
    'wallet.send(SendArgs { to: "fast1abc".into(), amount: "5".into() })?;',
  ].join('\n');
  const { calls } = await extractSdkFromCode(code, 'rust');
  assertEqual(calls.length, 2, 'two calls expected');
  assertEqual(calls[0].method, 'FastWallet.from_keyfile', 'associated constructor-like method normalized');
  assertEqual(calls[1].method, 'FastWallet.send', 'instance method resolved through binding');
  assertEqual(calls[1].args.to as string, 'fast1abc', 'struct field to preserved');
  assertEqual(calls[1].args.amount as string, '5', 'struct field amount preserved');
});

await test('rust: chained receiver preserves owner type', async () => {
  const code = 'FastWallet::from_keyfile(provider).send(SendArgs { to: "fast1abc".into(), amount: "5".into() })?;';
  const { calls } = await extractSdkFromCode(code, 'rust');
  assertEqual(calls.length, 2, 'two calls expected for chained receiver');
  assertEqual(calls[0].method, 'FastWallet.from_keyfile', 'inner associated call preserved');
  assertEqual(calls[1].method, 'FastWallet.send', 'outer method should resolve from chained receiver');
});

await test('rust: try-wrapped binding preserves instance type', async () => {
  const code = [
    'let wallet = FastWallet::from_keyfile(provider)?;',
    'wallet.send(SendArgs { to: "fast1abc".into(), amount: "5".into() })?;',
  ].join('\n');
  const { calls } = await extractSdkFromCode(code, 'rust');
  assertEqual(calls.length, 2, 'two calls expected');
  assertEqual(calls[0].method, 'FastWallet.from_keyfile', 'try-wrapped source call preserved');
  assertEqual(calls[1].method, 'FastWallet.send', 'try-wrapped binding should resolve instance method');
});

await test('rust: factory methods on instances resolve through evaluator bindings', async () => {
  const code = [
    'let client = FastClient::new("testnet");',
    'let wallet = client.wallet();',
    'wallet.send(SendArgs { to: "fast1abc".into(), amount: "5".into() })?;',
  ].join('\n');
  const extraction = await extractSdkFromCode(code, 'rust');
  const task = {
    id: 'rust-factory-binding',
    prompt: 'send a payment',
    expected_tools: [
      { method: 'FastClient.new', args: { _positional_0: 'testnet' } },
      { method: 'FastWallet.send', args: { to: 'fast1abc', amount: '5' } },
    ],
  };
  const result = evaluateTask({
    task,
    model: { id: 'test/model', name: 'Test Model', tier: 'flagship' },
    generatedCode: code,
    rawResponse: code,
    extractedCalls: extraction.calls,
    llmLatencyMs: 1,
    knownMethods: new Set(['FastClient.new', 'FastWallet.send']),
    bindings: extraction.bindings,
    surface: 'sdk',
  });

  assertEqual(result.metrics.taskPassed, true, 'instance factory bindings should resolve to FastWallet.send');
});

await test('rust: standalone function call', async () => {
  const { calls } = await extractSdkFromCode('let result = fast("testnet");', 'rust');
  assertEqual(calls.length, 1, 'one function call expected');
  assertEqual(calls[0].method, 'fast', 'standalone function kept');
  assertEqual(calls[0].args._positional_0 as string, 'testnet', 'function arg preserved');
});

await test('rust: extract() dispatches sdk language', async () => {
  const config: BenchmarkConfig = {
    name: 'rust-sdk',
    surface: 'sdk',
    sdk: { language: 'rust' },
    tasks: 'tasks.json',
    llm: {
      baseUrl: '',
      apiKeyEnv: 'OPENROUTER_API_KEY',
      format: 'openai',
      models: [],
    },
  };
  const response: LLMResponse = {
    content: '```rust\nlet client = FastClient::new("testnet");\n```',
  };
  const { calls, generatedCode } = await extract(response, config);
  assertEqual(generatedCode, 'let client = FastClient::new("testnet");', 'should preserve rust code block');
  assertEqual(calls.length, 1, 'one call expected');
  assertEqual(calls[0].method, 'FastClient.new', 'rust sdk call extracted');
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);

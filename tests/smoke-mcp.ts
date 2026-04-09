import { extractFromToolCalls } from '../src/extractors/mcp-extractor.js';
import { extract } from '../src/extractors/index.js';
import { evaluateTask, matchTools } from '../src/evaluator.js';
import type {
  ExtractedCall,
  LLMResponse,
  BenchmarkConfig,
  TaskDefinition,
  ExpectedTool,
  ModelConfig,
  ToolMatch,
} from '../src/types.js';

// ── Test harness ──────────────────────────────────────────────────────────

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

// ── Tests ─────────────────────────────────────────────────────────────────

console.log('\n=== MCP Surface Smoke Tests ===\n');

// ── Group 1: extractFromToolCalls ─────────────────────────────────────────

await test('extractFromToolCalls: basic extraction', () => {
  const response: LLMResponse = {
    content: '',
    toolCalls: [
      { name: 'send_tokens', arguments: { to: 'addr1', amount: '5' } },
    ],
  };

  const calls = extractFromToolCalls(response);

  assertEqual(calls.length, 1, 'should return 1 ExtractedCall');
  assertEqual(calls[0].method, 'send_tokens', 'method should be send_tokens');
  assertEqual(calls[0].args.to as string, 'addr1', 'args.to should be addr1');
  assertEqual(calls[0].args.amount as string, '5', 'args.amount should be "5"');
});

await test('extractFromToolCalls: multiple tool calls', () => {
  const response: LLMResponse = {
    content: '',
    toolCalls: [
      { name: 'create_wallet', arguments: {} },
      { name: 'get_balance', arguments: { address: 'addr2' } },
      { name: 'send_tokens', arguments: { to: 'addr3', amount: '10' } },
    ],
  };

  const calls = extractFromToolCalls(response);

  assertEqual(calls.length, 3, 'should return 3 ExtractedCalls');
  assertEqual(calls[0].method, 'create_wallet', 'first call method');
  assertEqual(calls[1].method, 'get_balance', 'second call method');
  assertEqual(calls[2].method, 'send_tokens', 'third call method');
});

await test('extractFromToolCalls: empty toolCalls', () => {
  const response: LLMResponse = {
    content: 'some text',
    toolCalls: [],
  };

  const calls = extractFromToolCalls(response);

  assertEqual(calls.length, 0, 'should return empty array for empty toolCalls');
});

await test('extractFromToolCalls: undefined toolCalls', () => {
  const response: LLMResponse = {
    content: 'some text',
  };

  const calls = extractFromToolCalls(response);

  assertEqual(calls.length, 0, 'should return empty array when toolCalls is undefined');
});

// ── Group 2: matchTools (arg validation) ──────────────────────────────────

await test('matchTools: regex arg matching', () => {
  const expectedTools: ExpectedTool[] = [
    { method: 'send_tokens', args: { to: '/fast1.+/' } },
  ];

  const extractedCalls: ExtractedCall[] = [
    { method: 'send_tokens', args: { to: 'fast1abc123def' }, line: 0, raw: '' },
  ];

  const matches = matchTools(expectedTools, extractedCalls);

  assertEqual(matches.length, 1, 'should return 1 ToolMatch');
  assert(matches[0].methodFound === true, 'methodFound should be true');
  assert(matches[0].argsCorrect === true, 'argsCorrect should be true — regex /fast1.+/ should match "fast1abc123def"');
});

await test('matchTools: dynamic sentinel passes', () => {
  const expectedTools: ExpectedTool[] = [
    { method: 'get_balance', args: { address: '<dynamic>' } },
  ];

  const extractedCalls: ExtractedCall[] = [
    { method: 'get_balance', args: { address: 'literally_anything' }, line: 0, raw: '' },
  ];

  const matches = matchTools(expectedTools, extractedCalls);

  assertEqual(matches.length, 1, 'should return 1 ToolMatch');
  assert(matches[0].methodFound === true, 'methodFound should be true');
  // <dynamic> in expected acts as a wildcard — any value from the LLM is acceptable.
  assert(
    matches[0].argsCorrect === true,
    'argsCorrect should be true: <dynamic> sentinel in expected means any value matches',
  );
});

// ── Group 3: evaluateTask (MCP surface) ──────────────────────────────────

const mockModel: ModelConfig = {
  id: 'test/model',
  name: 'TestModel',
  tier: 'flagship' as const,
};

const knownMethods = new Set<string>(['send_tokens', 'get_balance', 'create_wallet']);

await test('evaluateTask: MCP perfect match', () => {
  const task: TaskDefinition = {
    id: 'task-perfect',
    prompt: 'Create a wallet and check its balance',
    expected_tools: [
      { method: 'create_wallet' },
      { method: 'get_balance' },
    ],
  };

  const extractedCalls: ExtractedCall[] = [
    { method: 'create_wallet', args: {}, line: 0, raw: '{"name":"create_wallet","arguments":{}}' },
    { method: 'get_balance', args: { address: 'addr1' }, line: 1, raw: '{"name":"get_balance","arguments":{"address":"addr1"}}' },
  ];

  const result = evaluateTask({
    task,
    model: mockModel,
    surface: 'mcp',
    generatedCode: null,
    rawResponse: '',
    extractedCalls,
    llmLatencyMs: 0,
    error: undefined,
    knownMethods,
  });

  assert(result.metrics.taskPassed === true, 'taskPassed should be true');
  assertEqual(result.metrics.toolSelectionAccuracy, 1.0, 'toolSelectionAccuracy should be 1.0');
  assertEqual(result.metrics.hallucinationRate, 0, 'hallucinationRate should be 0');
});

await test('evaluateTask: MCP hallucinated tool', () => {
  const task: TaskDefinition = {
    id: 'task-hallucination',
    prompt: 'Send some tokens',
    expected_tools: [
      { method: 'send_tokens' },
    ],
  };

  const extractedCalls: ExtractedCall[] = [
    { method: 'send_tokens', args: { to: 'addr1', amount: '5' }, line: 0, raw: '{"name":"send_tokens","arguments":{"to":"addr1","amount":"5"}}' },
    { method: 'delete_everything', args: {}, line: 1, raw: '{"name":"delete_everything","arguments":{}}' },
  ];

  const result = evaluateTask({
    task,
    model: mockModel,
    surface: 'mcp',
    generatedCode: null,
    rawResponse: '',
    extractedCalls,
    llmLatencyMs: 0,
    error: undefined,
    knownMethods,
  });

  assert(
    result.metrics.hallucinatedCalls.includes('delete_everything'),
    'hallucinatedCalls should include "delete_everything"',
  );
  assert(result.metrics.hallucinationRate > 0, 'hallucinationRate should be > 0');
});

// ── Group 4: extract factory (MCP surface) ────────────────────────────────

await test('extract factory: MCP surface returns null generatedCode', async () => {
  const config: BenchmarkConfig = {
    name: 'test-mcp-benchmark',
    surface: 'mcp',
    mcp: { tools: 'tools.json' },
    tasks: 'tasks.json',
    llm: {
      baseUrl: '',
      apiKeyEnv: 'OPENROUTER_API_KEY',
      format: 'openai',
      models: [],
    },
  };

  const response: LLMResponse = {
    content: '',
    toolCalls: [
      { name: 'send_tokens', arguments: { to: 'addr1', amount: '5' } },
      { name: 'get_balance', arguments: { address: 'addr1' } },
    ],
  };

  const { calls, generatedCode } = await extract(response, config);

  assertEqual(generatedCode, null, 'generatedCode should be null in MCP surface');
  assertEqual(calls.length, 2, 'calls should have 2 items matching the toolCalls');
});

// ── Summary ───────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);

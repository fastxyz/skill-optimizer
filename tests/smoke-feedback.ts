import { strict as assert } from 'node:assert';

import type { TaskResult } from '../src/benchmark/types.js';
import { extractFailureDetails } from '../src/optimizer/feedback/failure-details.js';
import { detectPatterns } from '../src/optimizer/feedback/patterns.js';
import { buildPassingFailingDiff } from '../src/optimizer/feedback/passing-failing-diff.js';

function mkResult(opts: {
  taskId: string;
  modelId: string;
  modelName: string;
  passed: boolean;
  expected: { name: string; args?: Record<string, unknown> };
  extracted?: Array<{ name: string; args?: Record<string, unknown> }>;
  error?: string;
}): TaskResult {
  return {
    task: { id: opts.taskId, prompt: 'p', expected_actions: [opts.expected] },
    model: { id: opts.modelId, name: opts.modelName, tier: 'mid' },
    generatedCode: null,
    rawResponse: '',
    extractedCalls: (opts.extracted ?? []).map((c) => ({ method: c.name, args: c.args ?? {} })) as any,
    actionMatches: [{
      expected: opts.expected,
      found: opts.passed ? ({ method: opts.expected.name, args: opts.expected.args ?? {} } as any) : null,
      methodFound: opts.passed,
      argsCorrect: opts.passed,
      matched: opts.passed,
    }],
    metrics: {
      toolPrecision: 0,
      toolRecall: 0,
      taskPassed: opts.passed,
      toolSelectionAccuracy: opts.passed ? 1 : 0,
      argAccuracy: opts.passed ? 1 : 0,
      unnecessaryActions: [],
      hallucinatedActions: opts.extracted?.filter((c) => c.name !== opts.expected.name).map((c) => c.name) ?? [],
      hallucinationRate: 0,
    },
    llmLatencyMs: 0,
    error: opts.error,
  };
}

function testMissingToolKind() {
  const result = mkResult({
    taskId: 't1', modelId: 'm1', modelName: 'M1', passed: false,
    expected: { name: 'Wallet.send', args: { amount: 10 } },
    extracted: [{ name: 'Wallet.transfer' }],
  });
  const [detail] = extractFailureDetails([result]);
  assert.strictEqual(detail.kind, 'missing-tool');
  assert.ok(detail.mismatch_detail.includes('Wallet.transfer'));
  console.log('PASS: missing-tool detail');
}

function testBadArgsKind() {
  const result = mkResult({
    taskId: 't2', modelId: 'm1', modelName: 'M1', passed: false,
    expected: { name: 'Wallet.send', args: { amount: 10 } },
    extracted: [{ name: 'Wallet.send', args: { amount: 'ten' } }],
  });
  const [detail] = extractFailureDetails([result]);
  assert.strictEqual(detail.kind, 'bad-args');
  console.log('PASS: bad-args detail');
}

function testErrorKind() {
  const result = mkResult({
    taskId: 't3', modelId: 'm1', modelName: 'M1', passed: false,
    expected: { name: 'Wallet.send' },
    error: 'rate limited',
  });
  const [detail] = extractFailureDetails([result]);
  assert.strictEqual(detail.kind, 'error');
  assert.ok(detail.mismatch_detail.includes('rate limited'));
  console.log('PASS: error detail');
}

function testPatternDetection() {
  const details = [
    { task_id: 't1', model_id: 'a', kind: 'missing-tool' as const, expected_action: 'Wallet.send', expected_args: {}, actual_calls: [{ action: 'Wallet.transfer', args: {} }], mismatch_detail: '' },
    { task_id: 't1', model_id: 'b', kind: 'missing-tool' as const, expected_action: 'Wallet.send', expected_args: {}, actual_calls: [{ action: 'Wallet.transfer', args: {} }], mismatch_detail: '' },
    { task_id: 't2', model_id: 'c', kind: 'missing-tool' as const, expected_action: 'Wallet.send', expected_args: {}, actual_calls: [{ action: 'Wallet.transfer', args: {} }], mismatch_detail: '' },
  ];
  const patterns = detectPatterns(details);
  assert.ok(patterns.some((p) => p.kind === 'systematic-hallucination' && p.summary.includes('Wallet.transfer')));
  console.log('PASS: systematic hallucination pattern detected');
}

function testPassingFailingDiff() {
  const passing = mkResult({ taskId: 't1', modelId: 'a', modelName: 'A', passed: true, expected: { name: 'Wallet.send' }, extracted: [{ name: 'Wallet.send' }] });
  const failing = mkResult({ taskId: 't1', modelId: 'b', modelName: 'B', passed: false, expected: { name: 'Wallet.send' }, extracted: [{ name: 'Wallet.transfer' }] });
  const diff = buildPassingFailingDiff([passing, failing]);
  const t1 = diff.find((d) => d.task_id === 't1');
  assert.ok(t1);
  assert.deepStrictEqual(t1!.passing_models.sort(), ['A']);
  assert.deepStrictEqual(t1!.failing_models.sort(), ['B']);
  console.log('PASS: passing/failing diff split by model');
}

async function main() {
  testMissingToolKind();
  testBadArgsKind();
  testErrorKind();
  testPatternDetection();
  testPassingFailingDiff();
  console.log('\nALL PASS: smoke-feedback');
}

main().catch((err) => { console.error('FAIL: smoke-feedback', err); process.exit(1); });

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildTrialSummary, buildWorkbenchMetrics } from '../src/workbench/metrics.js';
import type { WorkbenchResult, WorkbenchTrace } from '../src/workbench/types.js';

test('buildWorkbenchMetrics counts tool calls and sums usage', () => {
  const trace: WorkbenchTrace = {
    caseName: 'metrics-case',
    model: 'openrouter/test/model',
    startedAt: '2026-04-27T10:00:00.000Z',
    endedAt: '2026-04-27T10:00:02.500Z',
    entries: [
      { type: 'message', role: 'user', text: 'task' },
      {
        type: 'message',
        role: 'assistant',
        usage: {
          input: 10,
          output: 5,
          cacheRead: 2,
          cacheWrite: 1,
          totalTokens: 18,
          cost: { input: 0.1, output: 0.2, cacheRead: 0.03, cacheWrite: 0.04, total: 0.37 },
        },
        stopReason: 'toolUse',
      },
      { type: 'tool_call', name: 'bash', arguments: { command: 'npm test' } },
      { type: 'tool_call', name: 'read', arguments: { path: 'file.ts' } },
      { type: 'tool_result', name: 'bash', text: 'ok' },
      { type: 'message', role: 'assistant', text: 'done', stopReason: 'stop' },
    ],
  };

  const metrics = buildWorkbenchMetrics(trace);
  assert.equal(metrics.durationMs, 2500);
  assert.equal(metrics.turns, 3);
  assert.equal(metrics.toolCalls, 2);
  assert.equal(metrics.toolResults, 1);
  assert.equal(metrics.bashCalls, 1);
  assert.equal(metrics.readCalls, 1);
  assert.equal(metrics.stopReason, 'stop');
  assert.equal(metrics.tokens.total, 18);
  assert.equal(metrics.cost.total, 0.37);
});

test('buildTrialSummary extracts final text, failed graders, and bash commands', () => {
  const trace: WorkbenchTrace = {
    caseName: 'summary-case',
    model: 'openrouter/test/model',
    startedAt: '2026-04-27T10:00:00.000Z',
    endedAt: '2026-04-27T10:00:01.000Z',
    entries: [
      { type: 'tool_call', name: 'bash', arguments: { command: 'firecrawl search "x"' } },
      { type: 'message', role: 'assistant', text: 'final answer', stopReason: 'stop' },
    ],
  };
  const result: WorkbenchResult = {
    caseName: 'summary-case',
    model: 'openrouter/test/model',
    pass: false,
    score: 0.5,
    evidence: ['missing output'],
    graders: [
      { name: 'uses-tool', command: 'true', pass: true, score: 1, evidence: [] },
      { name: 'saves-output', command: 'false', pass: false, score: 0, evidence: ['missing output'] },
    ],
  };

  const summary = buildTrialSummary({ trace, result });
  assert.equal(summary.finalAssistantMessage, 'final answer');
  assert.deepEqual(summary.failedGraders, ['saves-output']);
  assert.deepEqual(summary.bashCommands, ['firecrawl search "x"']);
  assert.equal(summary.metrics.bashCalls, 1);
});

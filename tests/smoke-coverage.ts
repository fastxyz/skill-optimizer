import { strict as assert } from 'node:assert';

import type { ActionDefinition } from '../src/actions/types.js';
import type { GeneratedTask } from '../src/tasks/types.js';
import {
  computeCoverage,
  computeUncovered,
  buildRetryPrompt,
} from '../src/tasks/coverage.js';

function mkAction(name: string): ActionDefinition {
  return { key: name, name, args: [] };
}

function mkTask(id: string, actions: string[]): GeneratedTask {
  return {
    id,
    prompt: `do ${id}`,
    expected_actions: actions.map((name) => ({ name, method: name })),
    expected_tools: actions.map((name) => ({ name, method: name })),
  };
}

function testFullCoverage() {
  const actions = [mkAction('Wallet.send'), mkAction('Wallet.receive')];
  const tasks = [mkTask('t1', ['Wallet.send']), mkTask('t2', ['Wallet.receive'])];
  const coverage = computeCoverage(actions, tasks);
  assert.strictEqual(coverage.uncoveredActions.length, 0);
  assert.strictEqual(coverage.coverageViolation, false);
  assert.deepStrictEqual(Object.keys(coverage.tasksPerAction).sort(), ['Wallet.receive', 'Wallet.send']);
  console.log('PASS: full coverage reports zero uncovered');
}

function testPartialCoverage() {
  const actions = [mkAction('Wallet.send'), mkAction('Wallet.receive'), mkAction('Token.mint')];
  const tasks = [mkTask('t1', ['Wallet.send'])];
  const coverage = computeCoverage(actions, tasks);
  assert.deepStrictEqual(coverage.uncoveredActions.sort(), ['Token.mint', 'Wallet.receive']);
  assert.strictEqual(coverage.coverageViolation, true);
  console.log('PASS: partial coverage flags uncovered');
}

function testUncoveredDriver() {
  const actions = [mkAction('A'), mkAction('B'), mkAction('C')];
  const tasks = [mkTask('t1', ['A'])];
  const uncovered = computeUncovered(actions, tasks);
  assert.deepStrictEqual(uncovered.sort(), ['B', 'C']);
  console.log('PASS: computeUncovered returns action names');
}

function testRetryPromptMentionsActions() {
  const prompt = buildRetryPrompt(['Wallet.receive', 'Token.mint']);
  assert.ok(prompt.includes('Wallet.receive'));
  assert.ok(prompt.includes('Token.mint'));
  console.log('PASS: retry prompt names uncovered actions');
}

async function main() {
  testFullCoverage();
  testPartialCoverage();
  testUncoveredDriver();
  testRetryPromptMentionsActions();
  console.log('\nALL PASS: smoke-coverage');
}

main().catch((err) => {
  console.error('FAIL: smoke-coverage', err);
  process.exit(1);
});

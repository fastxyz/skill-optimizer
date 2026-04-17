import { strict as assert } from 'node:assert';
import { resolveCriteriaForTask } from '../src/benchmark/prompt-criteria.js';
import type { GeneratedTask } from '../src/tasks/types.js';
import type { PromptCapabilityWithSection } from '../src/project/discover-prompt.js';
import type { ActionDefinition } from '../src/actions/types.js';

function cap(actionKey: string, section: string): PromptCapabilityWithSection {
  const action: ActionDefinition = { key: actionKey, name: actionKey, args: [], source: 'prompt' };
  return { action, section };
}

function task(id: string, capabilityId: string): GeneratedTask {
  return { id, prompt: `do ${capabilityId}`, expected_actions: [], capabilityId };
}

function testResolvesCriteriaForMatchingCapability() {
  const caps = [
    cap('summarize', '## summarize\n\nInclude: date, author. Use a numbered list.'),
    cap('translate', '## translate\n\nInclude: source language, target.'),
  ];
  const result = resolveCriteriaForTask(task('t1', 'summarize'), caps);
  assert.ok(result.criteria, 'criteria must be returned for matched capability');
  assert.strictEqual(result.noActiveCriteria, false);
  console.log('PASS: resolves criteria for matching capability');
}

function testDistinctCriteriaPerCapability() {
  const caps = [
    cap('alpha', '## alpha\n\nInclude: x, y. Numbered list required.'),
    cap('beta', '## beta\n\nInclude: totally-different-thing.'),
  ];
  const a = resolveCriteriaForTask(task('t1', 'alpha'), caps);
  const b = resolveCriteriaForTask(task('t2', 'beta'), caps);
  assert.notDeepStrictEqual(a.criteria, b.criteria,
    'different capabilities must produce different criteria (caps[0]-collapse guard)');
  console.log('PASS: distinct criteria per capability');
}

function testThrowsOnUnknownCapabilityId() {
  const caps = [cap('known', '## known\n\nInclude: foo.')];
  assert.throws(
    () => resolveCriteriaForTask(task('t1', 'unknown'), caps),
    /capabilityId "unknown"/,
    'unknown capabilityId must throw loudly — no silent fallback',
  );
  console.log('PASS: throws on unknown capabilityId');
}

function testThrowsOnMissingCapabilityId() {
  const caps = [cap('known', '## known\n\nInclude: foo.')];
  const taskWithoutId: GeneratedTask = { id: 't1', prompt: 'test', expected_actions: [] };
  assert.throws(
    () => resolveCriteriaForTask(taskWithoutId, caps),
    /missing capabilityId/,
    'task without capabilityId must throw loudly',
  );
  console.log('PASS: throws on missing capabilityId');
}

function testNoActiveCriteriaFlag() {
  const caps = [cap('empty', '')];
  const result = resolveCriteriaForTask(task('t1', 'empty'), caps);
  assert.strictEqual(result.noActiveCriteria, true,
    'capability with no extractable criteria must set noActiveCriteria: true');
  console.log('PASS: flags noActiveCriteria when criteria are empty');
}

async function main() {
  testResolvesCriteriaForMatchingCapability();
  testDistinctCriteriaPerCapability();
  testThrowsOnUnknownCapabilityId();
  testThrowsOnMissingCapabilityId();
  testNoActiveCriteriaFlag();
  console.log('\nALL PASS: smoke-prompt-criteria');
}

main().catch((err) => {
  console.error('FAIL: smoke-prompt-criteria', err);
  process.exit(1);
});

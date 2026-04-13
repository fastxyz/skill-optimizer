import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { WizardAnswers } from '../src/init/answers.js';
import { buildDefaultAnswers, readAnswersFile } from '../src/init/answers.js';

// Type check
const _a: WizardAnswers = {
  surface: 'sdk',
  repoPath: '/tmp/repo',
  models: ['openrouter/openai/gpt-4o'],
  maxTasks: 20,
  maxIterations: 5,
};
assert.strictEqual(typeof _a.surface, 'string');

// buildDefaultAnswers
{
  const defaults = buildDefaultAnswers('cli');
  assert.strictEqual(defaults.surface, 'cli');
  assert.ok(defaults.models.length >= 1, 'should have at least one default model');
  assert.strictEqual(typeof defaults.maxTasks, 'number');
  assert.strictEqual(typeof defaults.maxIterations, 'number');
}

// readAnswersFile
{
  const dir = mkdtempSync(join(tmpdir(), 'answers-test-'));
  try {
    const answers: WizardAnswers = {
      surface: 'mcp',
      repoPath: '/tmp/myrepo',
      models: ['openrouter/openai/gpt-4o'],
      maxTasks: 15,
      maxIterations: 3,
      entryFile: 'src/server.ts',
    };
    const file = join(dir, 'answers.json');
    writeFileSync(file, JSON.stringify(answers), 'utf-8');
    const loaded = readAnswersFile(file);
    assert.strictEqual(loaded.surface, 'mcp');
    assert.strictEqual(loaded.entryFile, 'src/server.ts');
    assert.strictEqual(loaded.maxIterations, 3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// readAnswersFile error: missing surface
{
  const dir = mkdtempSync(join(tmpdir(), 'answers-err-'));
  try {
    const bad = join(dir, 'bad.json');
    writeFileSync(bad, JSON.stringify({ repoPath: '/tmp', models: ['openrouter/openai/gpt-4o'], maxTasks: 5, maxIterations: 1 }), 'utf-8');
    let threw = false;
    try { readAnswersFile(bad); } catch { threw = true; }
    assert.ok(threw, 'readAnswersFile should throw on missing surface');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log('smoke-init: all tests passed');

import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { WizardAnswers } from '../src/init/answers.js';
import { buildDefaultAnswers, readAnswersFile } from '../src/init/answers.js';
import { scaffoldInit } from '../src/init/scaffold.js';

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

// scaffoldInit sdk
{
  const dir = mkdtempSync(join(tmpdir(), 'scaffold-sdk-'));
  try {
    await scaffoldInit({
      surface: 'sdk',
      repoPath: dir,
      models: ['openrouter/openai/gpt-4o'],
      maxTasks: 10,
      maxIterations: 3,
    }, dir);
    const configPath = join(dir, 'skill-optimizer', 'skill-optimizer.json');
    assert.ok(existsSync(configPath), 'sdk scaffold should create skill-optimizer.json');
    const config = JSON.parse(readFileSync(configPath, 'utf-8')) as {
      target: { surface: string; repoPath: string };
      benchmark: { models: Array<{ id: string }>; taskGeneration: { maxTasks: number } };
      optimize: { maxIterations: number };
    };
    assert.strictEqual(config.target.surface, 'sdk');
    assert.strictEqual(config.benchmark.models[0]?.id, 'openrouter/openai/gpt-4o');
    assert.strictEqual(config.benchmark.taskGeneration.maxTasks, 10);
    assert.strictEqual(config.optimize.maxIterations, 3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// scaffoldInit cli — no entryFile, writes template
{
  const dir = mkdtempSync(join(tmpdir(), 'scaffold-cli-'));
  try {
    await scaffoldInit({
      surface: 'cli',
      repoPath: dir,
      models: ['openrouter/openai/gpt-4o'],
      maxTasks: 15,
      maxIterations: 2,
    }, dir);
    const configPath = join(dir, 'skill-optimizer', 'skill-optimizer.json');
    const commandsPath = join(dir, 'skill-optimizer', '.skill-optimizer', 'cli-commands.json');
    assert.ok(existsSync(configPath), 'cli scaffold should create skill-optimizer.json');
    assert.ok(existsSync(commandsPath), 'cli scaffold should create .skill-optimizer/cli-commands.json');
    const config = JSON.parse(readFileSync(configPath, 'utf-8')) as {
      target: { surface: string; cli?: { commands?: string } };
    };
    assert.strictEqual(config.target.surface, 'cli');
    assert.ok(config.target.cli?.commands?.includes('cli-commands.json'), 'config should reference cli-commands.json');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// scaffoldInit mcp — writes template tools.json
{
  const dir = mkdtempSync(join(tmpdir(), 'scaffold-mcp-'));
  try {
    await scaffoldInit({
      surface: 'mcp',
      repoPath: dir,
      models: ['openrouter/openai/gpt-4o'],
      maxTasks: 5,
      maxIterations: 1,
    }, dir);
    const toolsPath = join(dir, 'skill-optimizer', '.skill-optimizer', 'tools.json');
    assert.ok(existsSync(toolsPath), 'mcp scaffold should create .skill-optimizer/tools.json');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// --answers equivalent: readAnswersFile + scaffoldInit mcp
{
  const dir = mkdtempSync(join(tmpdir(), 'scaffold-answers-'));
  try {
    const answersObj = {
      surface: 'mcp',
      repoPath: dir,
      models: ['openrouter/openai/gpt-4o'],
      maxTasks: 5,
      maxIterations: 1,
    };
    const answersFile = join(dir, 'answers.json');
    writeFileSync(answersFile, JSON.stringify(answersObj), 'utf-8');
    const answers = readAnswersFile(answersFile);
    await scaffoldInit(answers, dir);
    const toolsPath = join(dir, 'skill-optimizer', '.skill-optimizer', 'tools.json');
    assert.ok(existsSync(toolsPath), 'mcp scaffold via readAnswersFile should create tools.json');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log('smoke-init: all tests passed');

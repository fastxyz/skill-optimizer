import { strict as assert } from 'node:assert';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectProject, detectedToPreseed } from '../src/init/detect-project.js';
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

// --yes equivalent test (buildDefaultAnswers + scaffoldInit)
{
  const dir = mkdtempSync(join(tmpdir(), 'scaffold-yes-'));
  try {
    const answers = buildDefaultAnswers('sdk', dir);
    await scaffoldInit(answers, dir);
    const configPath = join(dir, 'skill-optimizer', 'skill-optimizer.json');
    assert.ok(existsSync(configPath), '--yes sdk should create skill-optimizer.json');
    const config = JSON.parse(readFileSync(configPath, 'utf-8')) as { target: { surface: string }; optimize: { maxIterations: number }; benchmark: { taskGeneration: { maxTasks: number } } };
    assert.strictEqual(config.target.surface, 'sdk');
    assert.strictEqual(config.optimize.maxIterations, 5);
    assert.strictEqual(config.benchmark.taskGeneration.maxTasks, 20);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// MODEL_PRESETS count check
{
  const { MODEL_PRESETS } = await import('../src/init/wizard.js');
  assert.strictEqual(MODEL_PRESETS.length, 12, `Expected 12 presets, got ${MODEL_PRESETS.length}`);
  assert.ok(MODEL_PRESETS.every(p => p.value.startsWith('openrouter/')), 'All presets should be openrouter/ IDs');
}

// detectProject: TypeScript SDK (package.json with main, no bin)
{
  const dir = mkdtempSync(join(tmpdir(), 'detect-ts-sdk-'));
  try {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'my-sdk',
      main: './dist/index.js',
    }), 'utf-8');
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src', 'index.ts'), '');
    const result = detectProject(dir);
    assert.strictEqual(result.surface, 'sdk');
    assert.strictEqual(result.name, 'my-sdk');
    assert.ok(result.entryFile.includes('index'), `entryFile should reference index, got: ${result.entryFile}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// detectProject: TypeScript CLI (package.json with bin)
{
  const dir = mkdtempSync(join(tmpdir(), 'detect-ts-cli-'));
  try {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'my-cli',
      bin: { 'my-cli': './dist/cli.js' },
    }), 'utf-8');
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src', 'cli.ts'), '');
    const result = detectProject(dir);
    assert.strictEqual(result.surface, 'cli');
    assert.strictEqual(result.name, 'my-cli');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// detectProject: MCP server (package.json with @modelcontextprotocol/sdk dep)
{
  const dir = mkdtempSync(join(tmpdir(), 'detect-mcp-'));
  try {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'my-mcp',
      dependencies: { '@modelcontextprotocol/sdk': '^1.0.0' },
    }), 'utf-8');
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src', 'server.ts'), '');
    const result = detectProject(dir);
    assert.strictEqual(result.surface, 'mcp');
    assert.strictEqual(result.name, 'my-mcp');
    assert.ok(result.entryFile.includes('server'), `entryFile should reference server.ts, got: ${result.entryFile}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// detectProject: unknown dir (no manifest) → defaults to sdk with low confidence
{
  const dir = mkdtempSync(join(tmpdir(), 'detect-empty-'));
  try {
    const result = detectProject(dir);
    assert.strictEqual(result.surface, 'sdk');
    assert.strictEqual(result.confidence, 'low');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// detectProject: SKILL.md found → skillFile set
{
  const dir = mkdtempSync(join(tmpdir(), 'detect-skill-'));
  try {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x' }), 'utf-8');
    writeFileSync(join(dir, 'SKILL.md'), '# skill');
    const result = detectProject(dir);
    assert.strictEqual(result.skillFile, 'SKILL.md');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// SkillOptimizerError — structured error with fix hints
{
  const { ERRORS, SkillOptimizerError, printError } = await import('../src/errors.js');

  // Basic throw/catch
  let caught: InstanceType<typeof SkillOptimizerError> | undefined;
  try {
    throw new SkillOptimizerError(ERRORS.E_MISSING_API_KEY);
  } catch (err) {
    if (err instanceof SkillOptimizerError) caught = err;
  }
  assert.ok(caught, 'should have caught SkillOptimizerError');
  assert.strictEqual(caught.name, 'E_MISSING_API_KEY');
  assert.ok(caught.message.includes('API key'), `message should mention API key, got: ${caught.message}`);

  // Detail appended
  const withDetail = new SkillOptimizerError(ERRORS.E_MAXTASKS_TOO_LOW, 'scope has 5 actions, maxTasks is 3');
  assert.ok(withDetail.message.includes('scope has 5'), `detail should be appended, got: ${withDetail.message}`);

  // ERRORS registry: all entries have code, message, fix array
  for (const [key, def] of Object.entries(ERRORS)) {
    assert.strictEqual(def.code, key, `code mismatch for ${key}`);
    assert.ok(typeof def.message === 'string' && def.message.length > 0, `${key} needs a message`);
    assert.ok(Array.isArray(def.fix) && def.fix.length > 0, `${key} needs at least one fix step`);
  }

  // printError is callable (won't throw)
  const orig = console.error;
  let printed = '';
  console.error = (...args: unknown[]) => { printed += args.join(' '); };
  printError(new SkillOptimizerError(ERRORS.E_DIRTY_GIT));
  console.error = orig;
  assert.ok(printed.includes('E_DIRTY_GIT'), `printError should include code, got: ${printed}`);
}

// detectedToPreseed maps DetectedProject to Partial<WizardAnswers>
{
  const dir = mkdtempSync(join(tmpdir(), 'preseed-'));
  try {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'preseed-cli',
      bin: { 'preseed-cli': './dist/cli.js' },
    }), 'utf-8');
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src', 'cli.ts'), '');
    const detected = detectProject(dir);
    const preseed = detectedToPreseed(detected);
    assert.strictEqual(preseed.surface, 'cli');
    assert.strictEqual(preseed.repoPath, dir);
    assert.ok(typeof preseed.name === 'string' && preseed.name.length > 0, 'preseed.name should be set');
    assert.ok(preseed.entryFile !== undefined, 'preseed.entryFile should be set for cli');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// --auto --yes high confidence path: scaffoldInit called without wizard
{
  const dir = mkdtempSync(join(tmpdir(), 'auto-yes-'));
  try {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'auto-test',
      dependencies: { '@modelcontextprotocol/sdk': '^1.0.0' },
    }), 'utf-8');
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src', 'server.ts'), '');
    const detected = detectProject(dir);
    assert.strictEqual(detected.confidence, 'high', 'mcp with dep should be high confidence');
    assert.strictEqual(detected.surface, 'mcp');
    const answers = {
      ...buildDefaultAnswers(detected.surface, detected.repoPath),
      ...detectedToPreseed(detected),
    };
    await scaffoldInit(answers, dir);
    const configPath = join(dir, 'skill-optimizer', 'skill-optimizer.json');
    assert.ok(existsSync(configPath), '--auto --yes should scaffold config');
    const config = JSON.parse(readFileSync(configPath, 'utf-8')) as { target: { surface: string } };
    assert.strictEqual(config.target.surface, 'mcp');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// --auto --yes low confidence: verifies error infrastructure (E_INIT_AUTO_LOW_CONFIDENCE exists and can be thrown)
// Note: this simulates the guard logic in cli.ts rather than calling through the CLI handler,
// since the full CLI path requires process.argv and process.exit mocking.
{
  const { detectProject } = await import('../src/init/detect-project.js');
  const { ERRORS, SkillOptimizerError } = await import('../src/errors.js');
  const dir = mkdtempSync(join(tmpdir(), 'auto-low-'));
  try {
    const detected = detectProject(dir);
    assert.strictEqual(detected.confidence, 'low');
    let threw = false;
    try {
      if (detected.confidence !== 'high') {
        throw new SkillOptimizerError(ERRORS.E_INIT_AUTO_LOW_CONFIDENCE, `confidence is ${detected.confidence}`);
      }
    } catch (err) {
      if (err instanceof SkillOptimizerError && err.def.code === 'E_INIT_AUTO_LOW_CONFIDENCE') threw = true;
      else throw err;
    }
    assert.ok(threw, 'low confidence with --yes should throw E_INIT_AUTO_LOW_CONFIDENCE');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log('smoke-init: all tests passed');

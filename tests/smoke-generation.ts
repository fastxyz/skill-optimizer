import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import type { BenchmarkConfig, LLMResponse } from '../src/benchmark/types.js';
import { evaluateTask } from '../src/benchmark/evaluator.js';
import { extract } from '../src/benchmark/extractors/index.js';
import {
  discoverTaskSurface,
  freezeTaskArtifacts,
  generateCandidateTasks,
  generateTasksForProject,
  groundTasks,
} from '../src/tasks/index.js';
import type { GeneratedTask, TaskGeneratorDeps } from '../src/tasks/types.js';

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

function makeFixture(): {
  root: string;
  benchmarkConfigPath: string;
  skillPath: string;
  sourcePath: string;
} {
  const root = mkdtempSync(join(tmpdir(), 'skill-optimizer-generation-'));
  const skillPath = join(root, 'SKILL.md');
  const sourcePath = join(root, 'server.ts');
  const benchmarkConfigPath = join(root, 'skill-optimizer.json');

  writeFileSync(skillPath, '# Wallet skill\nUse MCP tools only.\n', 'utf-8');
  writeFileSync(sourcePath, [
    'export const TOOLS = [',
    '  {',
    "    type: 'function',",
    '    function: {',
    "      name: 'create_wallet',",
    "      description: 'Create wallet',",
    '      parameters: {',
    "        type: 'object',",
    '        properties: {',
    "          label: { type: 'string' },",
    '        },',
    "        required: ['label'],",
    '      },',
    '    },',
    '  },',
    '  {',
    "    type: 'function',",
    '    function: {',
    "      name: 'get_balance',",
    "      description: 'Get balance',",
    '      parameters: {',
    "        type: 'object',",
    '        properties: {',
    "          address: { type: 'string' },",
    '        },',
    "        required: ['address'],",
    '      },',
    '    },',
    '  },',
    '] as const;',
  ].join('\n'), 'utf-8');

  writeFileSync(benchmarkConfigPath, JSON.stringify({
    name: 'gen-smoke',
    target: {
      surface: 'mcp',
      repoPath: '.',
      skill: './SKILL.md',
      discovery: {
        mode: 'auto',
        sources: ['./server.ts'],
      },
    },
    benchmark: {
      tasks: './tasks.json',
      format: 'pi',
      models: [{ id: 'openai/test', name: 'Test', tier: 'flagship' }],
    },
  }, null, 2), 'utf-8');

  return { root, benchmarkConfigPath, skillPath, sourcePath };
}

console.log('\n=== Task Generation Smoke Tests ===\n');

await test('discoverTaskSurface: resolves and loads skill/snapshot', async () => {
  const fixture = makeFixture();
  try {
    const surface = await discoverTaskSurface(fixture.benchmarkConfigPath);
    assertEqual(surface.skillPath, resolve(fixture.skillPath), 'skill path should resolve absolute');
    assert(surface.skillMarkdown.includes('Wallet skill'), 'skill markdown should be loaded');
    assertEqual(surface.snapshot.surface, 'mcp', 'surface should be mcp');
    assertEqual(surface.snapshot.actions.length, 2, 'should load discovered actions');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

await test('generateCandidateTasks: parses strict JSON response', async () => {
  const fixture = makeFixture();
  try {
    const surface = await discoverTaskSurface(fixture.benchmarkConfigPath);
    const deps: TaskGeneratorDeps = {
      async complete() {
        return JSON.stringify({
          tasks: [
            {
              id: 'task-create',
              prompt: 'Create a wallet named alpha.',
              expected_actions: [
                { name: 'create_wallet', args: { label: 'alpha' } },
              ],
            },
          ],
        });
      },
    };

    const generated = await generateCandidateTasks(surface, { maxTasks: 5, seed: 7 }, deps);
    assertEqual(generated.length, 1, 'should parse one task');
    // ID is derived from action names (content-stable hash), not the LLM-supplied id field
    assert(/^[0-9a-f]{12}$/.test(generated[0].id), 'task id should be a 12-char hex hash of action names');
    assertEqual(generated[0].prompt, 'Create a wallet named alpha.', 'task prompt should match');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

await test('generateCandidateTasks: enforces maxTasks cap after parsing', async () => {
  const fixture = makeFixture();
  try {
    const surface = await discoverTaskSurface(fixture.benchmarkConfigPath);
    const deps: TaskGeneratorDeps = {
      async complete() {
        return JSON.stringify({
          tasks: [
            { id: 't1', prompt: 'one', expected_actions: [{ name: 'create_wallet', args: { label: 'one' } }] },
            { id: 't2', prompt: 'two', expected_actions: [{ name: 'create_wallet', args: { label: 'two' } }] },
            { id: 't3', prompt: 'three', expected_actions: [{ name: 'create_wallet', args: { label: 'three' } }] },
          ],
        });
      },
    };

    const generated = await generateCandidateTasks(surface, { maxTasks: 2, seed: 7 }, deps);
    assertEqual(generated.length, 2, 'generator output should be capped to maxTasks');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

await test('generateCandidateTasks: sanitizes unsafe task ids instead of throwing', async () => {
  const fixture = makeFixture();
  try {
    const surface = await discoverTaskSurface(fixture.benchmarkConfigPath);
    const deps: TaskGeneratorDeps = {
      async complete() {
        return JSON.stringify({
          tasks: [
            { id: '../../escape', prompt: 'bad', expected_actions: [{ name: 'create_wallet', args: { label: 'bad' } }] },
          ],
        });
      },
    };
    // Should not throw — sanitizes the id instead
    const tasks = await generateCandidateTasks(surface, { maxTasks: 2, seed: 7 }, deps);
    assert(tasks.length === 1, 'should return one task');
    assert(!tasks[0].id.includes('/'), 'sanitized id must not contain path separators');
    assert(tasks[0].id !== '..' && tasks[0].id !== '.', 'sanitized id must not be a dot-segment');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

await test('generateCandidateTasks: sanitizes dot-segment task ids instead of throwing', async () => {
  const fixture = makeFixture();
  try {
    const surface = await discoverTaskSurface(fixture.benchmarkConfigPath);
    const deps: TaskGeneratorDeps = {
      async complete() {
        return JSON.stringify({
          tasks: [
            { id: '..', prompt: 'bad', expected_actions: [{ name: 'create_wallet', args: { label: 'bad' } }] },
          ],
        });
      },
    };
    // Should not throw — falls back to index-based id
    const tasks = await generateCandidateTasks(surface, { maxTasks: 2, seed: 7 }, deps);
    assert(tasks.length === 1, 'should return one task');
    assert(tasks[0].id !== '..', 'dot-segment id must be replaced');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

await test('generateCandidateTasks: rejects malformed top-level shape', async () => {
  const fixture = makeFixture();
  try {
    const surface = await discoverTaskSurface(fixture.benchmarkConfigPath);
    const deps: TaskGeneratorDeps = {
      async complete() {
        return JSON.stringify({ not_tasks: [] });
      },
    };

    let threw = false;
    try {
      await generateCandidateTasks(surface, { maxTasks: 3, seed: 1 }, deps);
    } catch (error: any) {
      threw = true;
      assert(error.message.includes('top-level "tasks" array'), 'error should mention tasks array shape');
    }

    assert(threw, 'malformed response should throw');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

await test('groundTasks: rejects unknown methods and invalid args', async () => {
  const fixture = makeFixture();
  try {
    const surface = await discoverTaskSurface(fixture.benchmarkConfigPath);
    const tasks: GeneratedTask[] = [
      {
        id: 'ok-task',
        prompt: 'Create a wallet.',
        expected_actions: [{ name: 'create_wallet', args: { label: 'alpha' } }],
      },
      {
        id: 'bad-method',
        prompt: 'Call made up method.',
        expected_actions: [{ name: 'delete_wallet', args: { id: 'x' } }],
      },
      {
        id: 'bad-arg',
        prompt: 'Use unknown arg key.',
        expected_actions: [{ name: 'get_balance', args: { walletId: 'w1' } }],
      },
    ];

    const result = groundTasks(tasks, surface.snapshot);
    assertEqual(result.kept.length, 1, 'only valid task should remain');
    assertEqual(result.rejected.length, 2, 'two tasks should be rejected');
    assert(result.rejected.some((entry) => entry.reason.includes('unknown method')), 'should include unknown method rejection');
    assert(result.rejected.some((entry) => entry.reason.includes('unknown arg key')), 'should include unknown arg key rejection');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

await test('freezeGeneratedBenchmark: writes artifacts and absolute paths', async () => {
  const fixture = makeFixture();
  try {
    writeFileSync(fixture.benchmarkConfigPath, JSON.stringify({
      name: 'gen-smoke',
      target: {
        surface: 'mcp',
        repoPath: '.',
        skill: { source: './SKILL.md', cache: false },
        discovery: {
          mode: 'auto',
          sources: ['./server.ts'],
        },
      },
      benchmark: {
        tasks: './tasks.json',
        format: 'pi',
        models: [{ id: 'openai/test', name: 'Test', tier: 'flagship' }],
      },
    }, null, 2), 'utf-8');

    const outDir = join(fixture.root, 'generated');
    const kept: GeneratedTask[] = [
      {
        id: 'frozen-task',
        prompt: 'Create wallet and check balance.',
        expected_actions: [
          { name: 'create_wallet', args: { label: 'frozen' } },
          { name: 'get_balance', args: { address: '<dynamic>' } },
        ],
      },
    ];
    const rejected = [{ task: kept[0], reason: 'example reason' }];

    const surface = await discoverTaskSurface(fixture.benchmarkConfigPath);
    const frozen = freezeTaskArtifacts({
      project: surface.project,
      snapshot: surface.snapshot,
      outputDir: outDir,
      kept,
      rejected,
    });

    assert(existsSync(frozen.tasksPath), 'tasks.generated.json should exist');
    assert(existsSync(frozen.benchmarkPath), 'benchmark.generated.json should exist');
    assert(existsSync(frozen.logPath), 'generation.log.json should exist');
    assert(existsSync(frozen.snapshotPath), 'surface.snapshot.json should exist');

    const benchmark = JSON.parse(readFileSync(frozen.benchmarkPath, 'utf-8')) as {
      target: { skill: { source: string; cache: boolean } };
      benchmark: { authMode?: string; tasks: string; surfaceSnapshot: string };
      optimize?: unknown;
    };

    assert(benchmark.target.skill.source.startsWith('/'), 'target.skill.source should be absolute');
    assertEqual(benchmark.target.skill.cache, false, 'target.skill.cache should be preserved');
    assertEqual(benchmark.benchmark.authMode, 'env', 'benchmark authMode should be preserved in generated config');
    assertEqual(benchmark.benchmark.tasks, frozen.tasksPath, 'tasks should point at generated tasks path');
    assertEqual(benchmark.benchmark.surfaceSnapshot, frozen.snapshotPath, 'surface snapshot should be pinned in generated config');
    assertEqual(benchmark.optimize, undefined, 'generated benchmark config should omit optimize-only settings');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

await test('generateTasksForProject: runs discover -> generate -> ground -> freeze', async () => {
  const fixture = makeFixture();
  try {
    const outDir = join(fixture.root, 'end-to-end');
    const deps: TaskGeneratorDeps = {
      async complete() {
        return JSON.stringify({
          tasks: [
            {
              id: 'kept-task',
              prompt: 'Create wallet called beta.',
              expected_actions: [{ name: 'create_wallet', args: { label: 'beta' } }],
            },
            {
              id: 'balance-task',
              prompt: 'Get balance for address 0x1.',
              expected_actions: [{ name: 'get_balance', args: { address: '0x1' } }],
            },
            {
              id: 'rejected-task',
              prompt: 'Use unknown method.',
              expected_actions: [{ name: 'delete_wallet', args: { id: 'x' } }],
            },
          ],
        });
      },
    };

    const result = await generateTasksForProject({
      configPath: fixture.benchmarkConfigPath,
      maxTasks: 10,
      seed: 1,
      outputDir: outDir,
      deps,
    });

    assertEqual(result.kept.length, 2, 'two tasks should remain after grounding');
    // IDs are now content-based hashes; verify by the action the task covers
    assert(result.kept.some((t) => t.expected_actions.some(a => a.name === 'create_wallet')), 'task covering create_wallet should be kept');
    assert(result.kept.some((t) => t.expected_actions.some(a => a.name === 'get_balance')), 'task covering get_balance should be kept');
    assert(result.rejected.length >= 1, 'at least one rejected task expected');
    assert(existsSync(result.artifacts.benchmarkPath), 'generated benchmark config should exist');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

await test('discoverTaskSurface: supports sdk code-first projects', async () => {
  const root = mkdtempSync(join(tmpdir(), 'skill-optimizer-sdk-generation-'));
  try {
    writeFileSync(join(root, 'SKILL.md'), '# SDK skill\nUse SDK methods.\n', 'utf-8');
    writeFileSync(join(root, 'index.ts'), 'export class Client { constructor(key: string) {} getBalance(accountId: string) {} }\n', 'utf-8');
    writeFileSync(join(root, 'skill-optimizer.json'), JSON.stringify({
      name: 'sdk-gen-smoke',
      target: {
        surface: 'sdk',
        repoPath: '.',
        skill: './SKILL.md',
        discovery: { mode: 'auto', sources: ['./index.ts'], language: 'typescript' },
        sdk: { language: 'typescript' },
      },
      benchmark: {
        tasks: './tasks.json',
        format: 'pi',
        models: [{ id: 'openai/test', name: 'Test', tier: 'flagship' }],
      },
    }, null, 2), 'utf-8');

    const surface = await discoverTaskSurface(join(root, 'skill-optimizer.json'));
    assertEqual(surface.snapshot.surface, 'sdk', 'surface should be sdk');
    assert(surface.snapshot.actions.some((action) => action.name === 'Client.getBalance'), 'sdk action should be discovered');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('discoverTaskSurface: supports cli code-first projects', async () => {
  const root = mkdtempSync(join(tmpdir(), 'skill-optimizer-cli-generation-'));
  try {
    writeFileSync(join(root, 'SKILL.md'), '# CLI skill\nUse commands.\n', 'utf-8');
    writeFileSync(join(root, 'commands.ts'), [
      'export const COMMANDS = [',
      '  {',
      "    command: 'wallet:create',",
      '    options: [',
      "      { name: '--label', takesValue: true },",
      '    ],',
      '  },',
      '];',
    ].join('\n'), 'utf-8');
    writeFileSync(join(root, 'skill-optimizer.json'), JSON.stringify({
      name: 'cli-gen-smoke',
      target: {
        surface: 'cli',
        repoPath: '.',
        skill: './SKILL.md',
        discovery: { mode: 'auto', sources: ['./commands.ts'] },
      },
      benchmark: {
        tasks: './tasks.json',
        format: 'pi',
        models: [{ id: 'openai/test', name: 'Test', tier: 'flagship' }],
      },
    }, null, 2), 'utf-8');

    const surface = await discoverTaskSurface(join(root, 'skill-optimizer.json'));
    assertEqual(surface.snapshot.surface, 'cli', 'surface should be cli');
    assert(surface.snapshot.actions.some((action) => action.name === 'wallet:create'), 'cli action should be discovered');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('cli discovery/task generation canonicalizes option keys for extraction and evaluation', async () => {
  const root = mkdtempSync(join(tmpdir(), 'skill-optimizer-cli-eval-'));
  try {
    writeFileSync(join(root, 'SKILL.md'), '# CLI skill\nUse commands.\n', 'utf-8');
    writeFileSync(join(root, 'commands.ts'), [
      'export const COMMANDS = [',
      '  {',
      "    command: 'wallet:create',",
      '    options: [',
      "      { name: '--label', takesValue: true },",
      '    ],',
      '  },',
      '];',
    ].join('\n'), 'utf-8');
    writeFileSync(join(root, 'skill-optimizer.json'), JSON.stringify({
      name: 'cli-eval-smoke',
      target: {
        surface: 'cli',
        repoPath: '.',
        skill: './SKILL.md',
        discovery: { mode: 'auto', sources: ['./commands.ts'] },
      },
      benchmark: {
        tasks: './tasks.json',
        format: 'pi',
        models: [{ id: 'openai/test', name: 'Test', tier: 'flagship' }],
      },
    }, null, 2), 'utf-8');

    const surface = await discoverTaskSurface(join(root, 'skill-optimizer.json'));
    assertEqual(surface.snapshot.actions[0]?.args[0]?.name, 'label', 'CLI arg names should be canonicalized without dashes');

    const grounded = groundTasks([
      {
        id: 'cli-task',
        prompt: 'Create a wallet.',
        expected_actions: [{ name: 'wallet:create', args: { label: 'demo' } }],
      },
    ], surface.snapshot);
    assertEqual(grounded.kept.length, 1, 'CLI task should ground against canonical arg name');

    const config: BenchmarkConfig & { surface: 'cli'; cli: { commands: string; commandDefinitions: Array<{ command: string }> } } = {
      name: 'cli-eval-smoke',
      surface: 'cli',
      cli: {
        commands: 'commands.json',
        commandDefinitions: [{ command: 'wallet:create' }],
      },
      tasks: 'tasks.json',
      llm: {
        baseUrl: '',
        apiKeyEnv: 'OPENROUTER_API_KEY',
        format: 'openai',
        models: [{ id: 'openai/test', name: 'Test', tier: 'flagship' }],
      },
    };
    const response: LLMResponse = {
      content: '```bash\nwallet:create --label demo\n```',
    };
    const { calls } = await extract(response, config);
    const result = evaluateTask({
      task: grounded.kept[0],
      model: config.llm.models[0],
      surface: 'cli',
      generatedCode: null,
      rawResponse: response.content,
      extractedCalls: calls,
      llmLatencyMs: 0,
      error: undefined,
      knownMethods: new Set(['wallet:create']),
    });
    assertEqual(result.metrics.taskPassed, true, 'CLI canonical arg names should still match extracted command args');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── Prompt surface fixture ────────────────────────────────────────────────────

function makePromptFixture(): {
  root: string;
  benchmarkConfigPath: string;
  skillPath: string;
  // Capability keys produced by the phase headings in the skill file.
  capabilityKeys: { summarize: string; translate: string };
} {
  const root = mkdtempSync(join(tmpdir(), 'skill-optimizer-prompt-'));
  const skillPath = join(root, 'SKILL.md');
  const benchmarkConfigPath = join(root, 'skill-optimizer.json');

  // Two ## Phase headings produce exactly two capabilities:
  //   phase_1_summarize  and  phase_2_translate
  // Body text avoids imperative verbs and decision-point words so no extra
  // instruction / decision capabilities are generated alongside the phases.
  writeFileSync(skillPath, [
    '# Translation Service Skill',
    '',
    '## Phase 1: Summarize',
    'Condenses long documents into brief summaries for quick reading.',
    '',
    '## Phase 2: Translate',
    'Converts text from one language to another while preserving meaning.',
  ].join('\n'), 'utf-8');

  writeFileSync(benchmarkConfigPath, JSON.stringify({
    name: 'prompt-smoke',
    target: {
      surface: 'prompt',
      repoPath: '.',
      skill: './SKILL.md',
    },
    benchmark: {
      tasks: './tasks.json',
      format: 'pi',
      models: [{ id: 'openai/test', name: 'Test', tier: 'flagship' }],
    },
  }, null, 2), 'utf-8');

  return {
    root,
    benchmarkConfigPath,
    skillPath,
    capabilityKeys: { summarize: 'phase_1_summarize', translate: 'phase_2_translate' },
  };
}

// ── Prompt surface: capabilityId tagging ─────────────────────────────────────

await test('prompt surface: generator tags tasks with capabilityId', async () => {
  const fixture = makePromptFixture();
  try {
    const surface = await discoverTaskSurface(fixture.benchmarkConfigPath);
    assertEqual(surface.snapshot.surface, 'prompt', 'surface should be prompt');

    const { summarize, translate } = fixture.capabilityKeys;
    const deps: TaskGeneratorDeps = {
      async complete() {
        return JSON.stringify({
          tasks: [
            {
              id: 'summarize_long_doc',
              prompt: 'Summarize this long research paper into three bullet points.',
              expected_actions: [],
              capabilityId: summarize,
            },
            {
              id: 'translate_spanish',
              prompt: 'Translate the following paragraph from English to Spanish.',
              expected_actions: [],
              capabilityId: translate,
            },
          ],
        });
      },
    };

    const generated = await generateCandidateTasks(surface, { maxTasks: 5, seed: 7 }, deps);
    assertEqual(generated.length, 2, 'should produce 2 tasks');

    const summarizeTask = generated.find((t) => t.capabilityId === summarize);
    const translateTask = generated.find((t) => t.capabilityId === translate);

    assert(summarizeTask !== undefined, `task with capabilityId "${summarize}" should exist`);
    assert(translateTask !== undefined, `task with capabilityId "${translate}" should exist`);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

// ── Prompt surface: grounding rejects unknown capabilityId ───────────────────

await test('prompt surface: grounding rejects unknown capabilityId', async () => {
  const fixture = makePromptFixture();
  try {
    const surface = await discoverTaskSurface(fixture.benchmarkConfigPath);
    const { summarize } = fixture.capabilityKeys;

    const deps: TaskGeneratorDeps = {
      async complete() {
        return JSON.stringify({
          tasks: [
            {
              id: 'bad_task',
              prompt: 'Use an unknown capability.',
              expected_actions: [],
              capabilityId: 'not-real',
            },
            {
              id: 'good_task',
              prompt: 'Summarize this document into bullet points.',
              expected_actions: [],
              capabilityId: summarize,
            },
          ],
        });
      },
    };

    const generated = await generateCandidateTasks(surface, { maxTasks: 5, seed: 7 }, deps);

    // Only the task with a valid capabilityId passes grounding.
    const grounded = groundTasks(generated, surface.snapshot);
    assertEqual(grounded.kept.length, 1, 'only the valid capabilityId task should be kept');
    assertEqual(grounded.rejected.length, 1, 'task with unknown capabilityId should be rejected');
    assert(
      grounded.rejected[0].reason.includes('unknown capabilityId'),
      `rejection reason should mention unknown capabilityId, got: ${grounded.rejected[0].reason}`,
    );
    assertEqual(grounded.kept[0].capabilityId, summarize, 'kept task should have the valid capabilityId');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

await test('prompt surface: grounding rejects task with missing capabilityId', async () => {
  const fixture = makePromptFixture();
  try {
    const surface = await discoverTaskSurface(fixture.benchmarkConfigPath);
    const deps: TaskGeneratorDeps = {
      async complete() {
        return JSON.stringify({
          tasks: [
            // capabilityId field is entirely absent from this task
            { id: 't1', prompt: 'Do something.', expected_actions: [] },
          ],
        });
      },
    };
    const generated = await generateCandidateTasks(surface, { maxTasks: 5, seed: 7 }, deps);
    const result = groundTasks(generated, surface.snapshot);
    assertEqual(result.kept.length, 0, 'task without capabilityId must be rejected');
    assertEqual(result.rejected.length, 1, 'rejected list must have one entry');
    assert(result.rejected[0]!.reason.includes('capabilityId'),
      `rejection reason must mention capabilityId, got: "${result.rejected[0]!.reason}"`);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import {
  discoverMcpSurface,
  freezeGeneratedBenchmark,
  generateCandidateTasks,
  generateTasksForManifest,
  groundTasks,
} from '../src/optimizer/generation/index.js';
import type { GeneratedTask, TaskGeneratorDeps } from '../src/optimizer/generation/task-generator.js';

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
  toolsPath: string;
} {
  const root = mkdtempSync(join(tmpdir(), 'skill-optimizer-generation-'));
  const skillPath = join(root, 'SKILL.md');
  const toolsPath = join(root, 'tools.json');
  const benchmarkConfigPath = join(root, 'benchmark.config.json');

  writeFileSync(skillPath, '# Wallet skill\nUse MCP tools only.\n', 'utf-8');
  writeFileSync(toolsPath, JSON.stringify([
    {
      type: 'function',
      function: {
        name: 'create_wallet',
        description: 'Create wallet',
        parameters: {
          type: 'object',
          properties: {
            label: { type: 'string' },
          },
          required: ['label'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_balance',
        description: 'Get balance',
        parameters: {
          type: 'object',
          properties: {
            address: { type: 'string' },
          },
          required: ['address'],
        },
      },
    },
  ], null, 2), 'utf-8');

  writeFileSync(benchmarkConfigPath, JSON.stringify({
    name: 'gen-smoke',
    surface: 'mcp',
    skill: { source: './SKILL.md' },
    mcp: { tools: './tools.json' },
    tasks: './tasks.json',
    llm: {
      format: 'pi',
      models: [{ id: 'openai/test', name: 'Test', tier: 'flagship' }],
    },
  }, null, 2), 'utf-8');

  return { root, benchmarkConfigPath, skillPath, toolsPath };
}

console.log('\n=== Task Generation Smoke Tests ===\n');

await test('discoverMcpSurface: resolves and loads skill/tools', () => {
  const fixture = makeFixture();
  try {
    const surface = discoverMcpSurface(fixture.benchmarkConfigPath);
    assertEqual(surface.skillPath, resolve(fixture.skillPath), 'skill path should resolve absolute');
    assertEqual(surface.toolsPath, resolve(fixture.toolsPath), 'tools path should resolve absolute');
    assert(surface.skillMarkdown.includes('Wallet skill'), 'skill markdown should be loaded');
    assertEqual(surface.tools.length, 2, 'should load tool definitions');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

await test('generateCandidateTasks: parses strict JSON response', async () => {
  const fixture = makeFixture();
  try {
    const surface = discoverMcpSurface(fixture.benchmarkConfigPath);
    const deps: TaskGeneratorDeps = {
      async complete() {
        return JSON.stringify({
          tasks: [
            {
              id: 'task-create',
              prompt: 'Create a wallet named alpha.',
              expected_tools: [
                { method: 'create_wallet', args: { label: 'alpha' } },
              ],
            },
          ],
        });
      },
    };

    const generated = await generateCandidateTasks(surface, { maxGenerated: 5, seed: 7 }, deps);
    assertEqual(generated.length, 1, 'should parse one task');
    assertEqual(generated[0].id, 'task-create', 'task id should match');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

await test('generateCandidateTasks: rejects malformed top-level shape', async () => {
  const fixture = makeFixture();
  try {
    const surface = discoverMcpSurface(fixture.benchmarkConfigPath);
    const deps: TaskGeneratorDeps = {
      async complete() {
        return JSON.stringify({ not_tasks: [] });
      },
    };

    let threw = false;
    try {
      await generateCandidateTasks(surface, { maxGenerated: 3, seed: 1 }, deps);
    } catch (error: any) {
      threw = true;
      assert(error.message.includes('top-level "tasks" array'), 'error should mention tasks array shape');
    }

    assert(threw, 'malformed response should throw');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

await test('groundTasks: rejects unknown methods and invalid args', () => {
  const fixture = makeFixture();
  try {
    const surface = discoverMcpSurface(fixture.benchmarkConfigPath);
    const tasks: GeneratedTask[] = [
      {
        id: 'ok-task',
        prompt: 'Create a wallet.',
        expected_tools: [{ method: 'create_wallet', args: { label: 'alpha' } }],
      },
      {
        id: 'bad-method',
        prompt: 'Call made up method.',
        expected_tools: [{ method: 'delete_wallet', args: { id: 'x' } }],
      },
      {
        id: 'bad-arg',
        prompt: 'Use unknown arg key.',
        expected_tools: [{ method: 'get_balance', args: { walletId: 'w1' } }],
      },
    ];

    const result = groundTasks(tasks, surface.tools);
    assertEqual(result.kept.length, 1, 'only valid task should remain');
    assertEqual(result.rejected.length, 2, 'two tasks should be rejected');
    assert(result.rejected.some((entry) => entry.reason.includes('unknown method')), 'should include unknown method rejection');
    assert(result.rejected.some((entry) => entry.reason.includes('unknown arg key')), 'should include unknown arg key rejection');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

await test('freezeGeneratedBenchmark: writes artifacts and absolute paths', () => {
  const fixture = makeFixture();
  try {
    const outDir = join(fixture.root, 'generated');
    const kept: GeneratedTask[] = [
      {
        id: 'frozen-task',
        prompt: 'Create wallet and check balance.',
        expected_tools: [
          { method: 'create_wallet', args: { label: 'frozen' } },
          { method: 'get_balance', args: { address: '<dynamic>' } },
        ],
      },
    ];
    const rejected = [{ task: kept[0], reason: 'example reason' }];

    const frozen = freezeGeneratedBenchmark({
      benchmarkConfigPath: fixture.benchmarkConfigPath,
      outputDir: outDir,
      kept,
      rejected,
    });

    assert(existsSync(frozen.tasksPath), 'tasks.generated.json should exist');
    assert(existsSync(frozen.benchmarkPath), 'benchmark.generated.json should exist');
    assert(existsSync(frozen.logPath), 'generation.log.json should exist');

    const benchmark = JSON.parse(readFileSync(frozen.benchmarkPath, 'utf-8')) as {
      skill: { source: string };
      mcp: { tools: string };
      tasks: string;
    };

    assert(benchmark.skill.source.startsWith('/'), 'skill.source should be absolute');
    assert(benchmark.mcp.tools.startsWith('/'), 'mcp.tools should be absolute');
    assertEqual(benchmark.tasks, frozen.tasksPath, 'tasks should point at generated tasks path');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

await test('generateTasksForManifest: runs discover -> generate -> ground -> freeze', async () => {
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
              expected_tools: [{ method: 'create_wallet', args: { label: 'beta' } }],
            },
            {
              id: 'rejected-task',
              prompt: 'Use unknown method.',
              expected_tools: [{ method: 'delete_wallet', args: { id: 'x' } }],
            },
          ],
        });
      },
    };

    const result = await generateTasksForManifest({
      benchmarkConfig: fixture.benchmarkConfigPath,
      optimizer: { taskGeneration: { maxGenerated: 10, seed: 1 } },
    }, {
      outputDir: outDir,
      deps,
    });

    assertEqual(result.kept.length, 1, 'one task should remain after grounding');
    assertEqual(result.kept[0].id, 'kept-task', 'kept task should match');
    assert(result.rejected.length >= 1, 'at least one rejected task expected');
    assert(existsSync(result.artifacts.benchmarkPath), 'generated benchmark config should exist');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);

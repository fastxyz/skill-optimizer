import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { discoverMcpSurfaceFromSources } from '../src/discovery/mcp.js';
import { discoverActions } from '../src/actions/index.js';
import { loadProjectConfig, buildSurfaceSnapshot } from '../src/project/index.js';

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
    console.log(`  + ${name}`);
  } catch (error: any) {
    failed++;
    console.log(`  - ${name}`);
    console.log(`    ${error.message}`);
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

console.log('\n=== MCP Discovery Smoke Tests ===\n');

await test('discovers MCP actions from tracker mock server source', () => {
  const sourcePath = resolve(process.cwd(), 'mock-repos/mcp-tracker-demo/src/server.ts');
  const snapshot = discoverMcpSurfaceFromSources([sourcePath]);

  assertEqual(snapshot.surface, 'mcp', 'surface should be mcp');
  assertEqual(snapshot.actions.length, 4, 'should discover all tracker tools');

  const actionNames = snapshot.actions.map((action) => action.name).sort();
  assertEqual(actionNames.join(','), 'add_cmnt,get_tkt,tkt_new,update_tkt_state', 'discovered action names should match');
});

await test('extracts argument names and required flags for tkt_new', () => {
  const sourcePath = resolve(process.cwd(), 'mock-repos/mcp-tracker-demo/src/server.ts');
  const snapshot = discoverMcpSurfaceFromSources([sourcePath]);
  const action = snapshot.actions.find((candidate) => candidate.name === 'tkt_new');

  assert(action !== undefined, 'tkt_new should be discovered');
  if (!action) {
    throw new Error('tkt_new should be discovered');
  }

  const requiredByName = new Map(action.args.map((arg) => [arg.name, arg.required]));
  assertEqual(requiredByName.get('t'), true, 't should be required');
  assertEqual(requiredByName.get('d'), true, 'd should be required');
  assertEqual(requiredByName.get('p'), true, 'p should be required');
  assertEqual(requiredByName.get('usr'), false, 'usr should be optional');
});

await test('discovery remains static and does not execute source file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mcp-discovery-'));
  const filePath = join(dir, 'server.ts');

  try {
    writeFileSync(
      filePath,
      [
        "throw new Error('this file must never execute during discovery');",
        'export const TOOLS = [',
        '  {',
        "    type: 'function',",
        '    function: {',
        "      name: 'safe_tool',",
        "      description: 'safe',",
        '      parameters: {',
        "        type: 'object',",
        '        properties: {',
        "          id: { type: 'string' },",
        '        },',
        "        required: ['id'],",
        '      },',
        '    },',
        '  },',
        '];',
      ].join('\n'),
      'utf-8',
    );

    const snapshot = discoverMcpSurfaceFromSources([filePath]);
    assertEqual(snapshot.actions.length, 1, 'should discover one tool from static source');
    assertEqual(snapshot.actions[0].name, 'safe_tool', 'discovered tool should match exported literal');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

await test('code-first MCP project config works without fallback manifest', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mcp-project-config-'));
  try {
    const serverPath = join(dir, 'server.ts');
    const configPath = join(dir, 'skill-benchmark.json');

    writeFileSync(serverPath, readFileSync(resolve(process.cwd(), 'mock-repos/mcp-tracker-demo/src/server.ts'), 'utf-8'), 'utf-8');
    writeFileSync(configPath, JSON.stringify({
      name: 'code-first-mcp',
      target: {
        surface: 'mcp',
        repoPath: '.',
        discovery: {
          mode: 'auto',
          sources: ['./server.ts'],
        },
      },
      benchmark: {
        tasks: './tasks.json',
        format: 'pi',
        models: [{ id: 'openrouter/openai/gpt-5.4', name: 'GPT-5.4', tier: 'flagship' }],
      },
    }, null, 2), 'utf-8');

    const project = loadProjectConfig(configPath);
    const snapshot = buildSurfaceSnapshot(project);
    assertEqual(snapshot.actions.length, 4, 'code-first config should discover tools without fallback manifest');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

await test('code-first discovery fails fast when MCP source is missing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mcp-project-config-'));
  try {
    const configPath = join(dir, 'skill-benchmark.json');

    writeFileSync(configPath, JSON.stringify({
      name: 'missing-source-mcp',
      target: {
        surface: 'mcp',
        repoPath: '.',
        discovery: {
          mode: 'auto',
          sources: ['./missing-server.ts'],
        },
      },
      benchmark: {
        tasks: './tasks.json',
        format: 'pi',
        models: [{ id: 'openrouter/openai/gpt-5.4', name: 'GPT-5.4', tier: 'flagship' }],
      },
    }, null, 2), 'utf-8');

    const project = loadProjectConfig(configPath);
    let threw = false;
    try {
      buildSurfaceSnapshot(project);
    } catch (error: any) {
      threw = true;
      assert(error.message.includes('not found'), 'missing source error should mention not found');
    }
    assert(threw, 'missing discovery source should fail fast');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

await test('discovers mcp actions via public action discovery entrypoint', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mcp-discovery-actions-'));
  const sourcePath = join(dir, 'server.ts');
  const configPath = join(dir, 'skill-benchmark.json');

  try {
    writeFileSync(
      sourcePath,
      [
        'export const TOOLS = [',
        '  {',
        "    type: 'function',",
        '    function: {',
        "      name: 'create_ticket',",
        '      parameters: {',
        "        type: 'object',",
        '        properties: {',
        "          title: { type: 'string' },",
        '        },',
        "        required: ['title'],",
        '      },',
        '    },',
        '  },',
        '];',
      ].join('\n'),
      'utf-8',
    );

    writeFileSync(configPath, JSON.stringify({
      name: 'mcp-actions-entrypoint',
      target: {
        surface: 'mcp',
        repoPath: '.',
        discovery: {
          mode: 'auto',
          sources: ['./server.ts'],
        },
      },
      benchmark: {
        tasks: './tasks.json',
        format: 'pi',
        models: [{ id: 'openrouter/openai/gpt-5.4', name: 'GPT-5.4', tier: 'flagship' }],
      },
    }, null, 2), 'utf-8');

    const project = loadProjectConfig(configPath);
    const catalog = discoverActions(project);
    assertEqual(catalog.surface, 'mcp', 'surface should be mcp');
    assertEqual(catalog.actions.length, 1, 'should discover one mcp action');
    assertEqual(catalog.actions[0].key, 'create_ticket', 'action key should match tool name');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

await test('discoverActions fails fast when MCP discovery source is missing and no fallback exists', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mcp-actions-missing-source-'));
  const configPath = join(dir, 'skill-benchmark.json');

  try {
    writeFileSync(configPath, JSON.stringify({
      name: 'missing-source-mcp-actions',
      target: {
        surface: 'mcp',
        repoPath: '.',
        discovery: {
          mode: 'auto',
          sources: ['./missing-server.ts'],
        },
      },
      benchmark: {
        tasks: './tasks.json',
        format: 'pi',
        models: [{ id: 'openrouter/openai/gpt-5.4', name: 'GPT-5.4', tier: 'flagship' }],
      },
    }, null, 2), 'utf-8');

    const project = loadProjectConfig(configPath);
    let threw = false;
    try {
      discoverActions(project);
    } catch (error: any) {
      threw = true;
      assert(error.message.includes('not found'), 'missing source error should mention not found');
    }

    assert(threw, 'missing discovery source should fail fast when no fallback exists');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);

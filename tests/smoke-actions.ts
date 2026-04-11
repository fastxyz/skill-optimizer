import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  ACTION_SNAPSHOT_VERSION,
  fromSurfaceSnapshot,
  loadActionSnapshotFile,
  toSurfaceSnapshot,
  writeActionSnapshotFile,
} from '../src/actions/snapshot.js';
import { diffActionCatalog } from '../src/actions/diff.js';
import { buildSurfaceSnapshot, loadProjectConfig, loadSurfaceSnapshotFile } from '../src/project/index.js';
import type { SurfaceSnapshot } from '../src/project/types.js';

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (error: any) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${error.message}`);
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

console.log('\n=== Action Core Smoke Tests ===\n');

await test('snapshot write/load roundtrip includes artifact version', () => {
  const root = mkdtempSync(join(tmpdir(), 'skill-optimizer-actions-'));
  try {
    const snapshotPath = join(root, 'actions.snapshot.json');
    writeActionSnapshotFile(snapshotPath, {
      surface: 'mcp',
      actions: [
        {
          key: 'wallet.create',
          name: 'create_wallet',
          args: [
            { name: 'label', required: true, type: 'string' },
            { name: 'network', required: false, type: 'string' },
          ],
        },
      ],
    });

    const raw = JSON.parse(readFileSync(snapshotPath, 'utf-8')) as { version?: number };
    assertEqual(raw.version, ACTION_SNAPSHOT_VERSION, 'snapshot file should include expected version field');

    const loaded = loadActionSnapshotFile(snapshotPath);
    assertEqual(loaded.version, ACTION_SNAPSHOT_VERSION, 'loaded snapshot version should match constant');
    assertEqual(loaded.catalog.actions[0].key, 'wallet.create', 'action key should roundtrip');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('diffActionCatalog ignores arg reordering and catches schema changes', () => {
  const before = {
    surface: 'mcp' as const,
    actions: [
      {
        key: 'wallet.send',
        name: 'send_tokens',
        args: [
          { name: 'amount', required: true, type: 'string' },
          { name: 'to', required: true, type: 'string' },
        ],
      },
    ],
  };

  const reordered = {
    ...before,
    actions: [
      {
        ...before.actions[0],
        args: [...before.actions[0].args].reverse(),
      },
    ],
  };

  const noOpDiff = diffActionCatalog(before, reordered);
  assertEqual(noOpDiff.changed.length, 0, 'arg reordering should not count as schema change');
  assertEqual(noOpDiff.added.length, 0, 'arg reordering should not add actions');
  assertEqual(noOpDiff.removed.length, 0, 'arg reordering should not remove actions');

  const changed = {
    ...before,
    actions: [
      {
        ...before.actions[0],
        args: [
          { name: 'amount', required: false, type: 'string' },
          { name: 'to', required: true, type: 'string' },
        ],
      },
    ],
  };

  const changedDiff = diffActionCatalog(before, changed);
  assertEqual(changedDiff.changed.length, 1, 'required-flag changes should count as schema changes');
});

await test('surface snapshot compatibility mapping preserves legacy shape', () => {
  const legacy: SurfaceSnapshot = {
    surface: 'cli',
    actions: [
      {
        name: 'wallet create',
        args: [
          { name: 'label', required: true, type: 'string' },
          { name: 'network', required: false, type: 'string' },
        ],
      },
    ],
  };

  const catalog = fromSurfaceSnapshot(legacy);
  assertEqual(catalog.actions[0].key, 'wallet create', 'legacy action name should map to canonical key by default');

  const roundtrip = toSurfaceSnapshot(catalog);
  assertEqual(roundtrip.actions[0].name, 'wallet create', 'legacy action name should roundtrip');
  assert(!('key' in roundtrip.actions[0]), 'legacy surface snapshot actions should not include key field');
});

await test('fromSurfaceSnapshot trims keys so legacy conversions diff stably', () => {
  const legacy: SurfaceSnapshot = {
    surface: 'mcp',
    actions: [
      {
        name: '  wallet.send  ',
        args: [
          { name: 'amount', required: true, type: 'string' },
          { name: 'to', required: true, type: 'string' },
        ],
      },
    ],
  };

  const converted = fromSurfaceSnapshot(legacy);
  assertEqual(converted.actions[0].key, 'wallet.send', 'legacy conversion should trim derived canonical keys');

  const normalized = {
    surface: 'mcp' as const,
    actions: [
      {
        key: 'wallet.send',
        name: 'wallet.send',
        args: [
          { name: 'to', required: true, type: 'string' },
          { name: 'amount', required: true, type: 'string' },
        ],
      },
    ],
  };

  const diff = diffActionCatalog(converted, normalized);
  assertEqual(diff.added.length, 0, 'trimmed key normalization should avoid false additions');
  assertEqual(diff.removed.length, 0, 'trimmed key normalization should avoid false removals');
  assertEqual(diff.changed.length, 0, 'trimmed key normalization should avoid false schema changes');
});

await test('diffActionCatalog reports added and removed actions', () => {
  const before = {
    surface: 'cli' as const,
    actions: [
      { key: 'wallet.create', name: 'wallet create', args: [] },
      { key: 'wallet.balance', name: 'wallet balance', args: [] },
    ],
  };

  const after = {
    surface: 'cli' as const,
    actions: [
      { key: 'wallet.create', name: 'wallet create', args: [] },
      { key: 'wallet.send', name: 'wallet send', args: [] },
    ],
  };

  const diff = diffActionCatalog(before, after);
  assertEqual(diff.added.length, 1, 'should report newly added actions');
  assertEqual(diff.added[0].key, 'wallet.send', 'added action key should match');
  assertEqual(diff.removed.length, 1, 'should report removed actions');
  assertEqual(diff.removed[0].key, 'wallet.balance', 'removed action key should match');
});

await test('diffActionCatalog normalizes key whitespace during comparison', () => {
  const before = {
    surface: 'sdk' as const,
    actions: [
      {
        key: '  FastWallet.send  ',
        name: 'FastWallet.send',
        args: [{ name: 'to', required: true, type: 'string' }],
      },
    ],
  };
  const after = {
    surface: 'sdk' as const,
    actions: [
      {
        key: 'FastWallet.send',
        name: 'FastWallet.send',
        args: [{ name: 'to', required: true, type: 'string' }],
      },
    ],
  };

  const diff = diffActionCatalog(before, after);
  assertEqual(diff.added.length, 0, 'whitespace-only key differences should not add actions');
  assertEqual(diff.removed.length, 0, 'whitespace-only key differences should not remove actions');
  assertEqual(diff.changed.length, 0, 'whitespace-only key differences should not change schema');
});

await test('diffActionCatalog throws on duplicate keys', () => {
  const before = {
    surface: 'mcp' as const,
    actions: [
      { key: 'wallet.send', name: 'wallet.send', args: [] },
      { key: 'wallet.send', name: 'wallet.send.v2', args: [] },
    ],
  };
  const after = {
    surface: 'mcp' as const,
    actions: [{ key: 'wallet.send', name: 'wallet.send', args: [] }],
  };

  let threw = false;
  try {
    diffActionCatalog(before, after);
  } catch (error: any) {
    threw = true;
    assert(error.message.includes('Duplicate action key'), 'error should mention duplicate action keys');
    assert(error.message.includes('wallet.send'), 'error should include the offending key');
    assert(error.message.includes('before'), 'error should include side context');
  }

  assert(threw, 'duplicate keys must throw instead of being silently collapsed');
});

await test('loadActionSnapshotFile fails clearly on malformed snapshot shape', () => {
  const root = mkdtempSync(join(tmpdir(), 'skill-optimizer-actions-malformed-'));
  try {
    const snapshotPath = join(root, 'actions.snapshot.json');
    writeFileSync(snapshotPath, JSON.stringify({ version: ACTION_SNAPSHOT_VERSION, catalog: { surface: 'mcp' } }, null, 2), 'utf-8');

    let threw = false;
    try {
      loadActionSnapshotFile(snapshotPath);
    } catch (error: any) {
      threw = true;
      assert(error.message.includes('Invalid action snapshot file'), 'error should classify malformed snapshot shape');
      assert(error.message.includes(snapshotPath), 'error should include file context');
      assert(error.message.includes('catalog.actions'), 'error should include failing shape detail');
    }

    assert(threw, 'malformed snapshot should throw');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('loadActionSnapshotFile validates malformed action entries with context', () => {
  const root = mkdtempSync(join(tmpdir(), 'skill-optimizer-actions-malformed-action-'));
  try {
    const snapshotPath = join(root, 'actions.snapshot.json');
    writeFileSync(snapshotPath, JSON.stringify({
      version: ACTION_SNAPSHOT_VERSION,
      catalog: {
        surface: 'mcp',
        actions: [
          {
            key: 'wallet.send',
            name: 'wallet.send',
            args: 'not-an-array',
          },
        ],
      },
    }, null, 2), 'utf-8');

    let threw = false;
    try {
      loadActionSnapshotFile(snapshotPath);
    } catch (error: any) {
      threw = true;
      assert(error.message.includes('Invalid action snapshot file'), 'error should classify malformed action shape');
      assert(error.message.includes(snapshotPath), 'error should include file context');
      assert(error.message.includes('catalog.actions[0].args'), 'error should include malformed field path');
    }

    assert(threw, 'malformed action entry should throw');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('loadActionSnapshotFile includes path on invalid JSON', () => {
  const root = mkdtempSync(join(tmpdir(), 'skill-optimizer-actions-invalid-json-'));
  try {
    const snapshotPath = join(root, 'actions.snapshot.json');
    writeFileSync(snapshotPath, '{ "version": 1, "catalog": ', 'utf-8');

    let threw = false;
    try {
      loadActionSnapshotFile(snapshotPath);
    } catch (error: any) {
      threw = true;
      assert(error.message.includes('Invalid action snapshot file'), 'error should classify invalid JSON');
      assert(error.message.includes(snapshotPath), 'error should include snapshot path');
    }

    assert(threw, 'invalid JSON should throw');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('buildSurfaceSnapshot returns expected legacy snapshot fields from discovery fixture', () => {
  const root = mkdtempSync(join(tmpdir(), 'skill-optimizer-snapshot-bridge-'));
  try {
    const sourcePath = join(root, 'server.ts');
    const configPath = join(root, 'skill-benchmark.json');

    writeFileSync(
      sourcePath,
      [
        'export const TOOLS = [',
        '  {',
        "    type: 'function',",
        '    function: {',
        "      name: 'create_wallet',",
        "      parameters: {",
        "        type: 'object',",
        '        properties: {',
        "          label: { type: 'string' },",
        '        },',
        "        required: ['label'],",
        '      },',
        '    },',
        '  },',
        '];',
      ].join('\n'),
      'utf-8',
    );

    writeFileSync(configPath, JSON.stringify({
      name: 'snapshot-bridge',
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
    const actual = buildSurfaceSnapshot(project);

    assertEqual(actual.surface, 'mcp', 'snapshot surface should be mcp');
    assertEqual(actual.actions.length, 1, 'snapshot should include discovered action');
    assertEqual(actual.actions[0].name, 'create_wallet', 'action name should match discovered tool');
    assertEqual(actual.actions[0].args.length, 1, 'snapshot should include tool args');
    assertEqual(actual.actions[0].args[0].name, 'label', 'arg name should match discovered schema');
    assertEqual(actual.actions[0].args[0].required, true, 'required arg flag should be preserved');
    assert(!('key' in actual.actions[0]), 'legacy snapshot action should not expose canonical key field');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('loadSurfaceSnapshotFile supports legacy plain snapshot shape', () => {
  const root = mkdtempSync(join(tmpdir(), 'skill-optimizer-snapshot-legacy-'));
  try {
    const snapshotPath = join(root, 'surface.snapshot.json');
    writeFileSync(snapshotPath, JSON.stringify({
      surface: 'cli',
      actions: [
        {
          name: 'wallet create',
          args: [{ name: '--label', required: true, type: 'string' }],
        },
      ],
    }, null, 2), 'utf-8');

    const loaded = loadSurfaceSnapshotFile(snapshotPath);
    assertEqual(loaded.surface, 'cli', 'legacy file should load as cli snapshot');
    assertEqual(loaded.actions.length, 1, 'legacy file should include actions');
    assertEqual(loaded.actions[0].args[0].name, 'label', 'legacy cli arg names should be normalized');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('loadSurfaceSnapshotFile supports versioned action snapshot artifact', () => {
  const root = mkdtempSync(join(tmpdir(), 'skill-optimizer-snapshot-versioned-'));
  try {
    const snapshotPath = join(root, 'actions.snapshot.json');
    writeActionSnapshotFile(snapshotPath, {
      surface: 'cli',
      actions: [
        {
          key: 'wallet create',
          name: 'wallet create',
          args: [{ name: '--label', required: true, type: 'string' }],
        },
      ],
    });

    const loaded = loadSurfaceSnapshotFile(snapshotPath);
    assertEqual(loaded.surface, 'cli', 'versioned file should map to cli snapshot');
    assertEqual(loaded.actions[0].name, 'wallet create', 'action name should map from action catalog');
    assertEqual(loaded.actions[0].args[0].name, 'label', 'converted cli arg names should be normalized');
    assert(!('key' in loaded.actions[0]), 'converted legacy snapshot should not expose key field');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('loadSurfaceSnapshotFile prefers valid legacy snapshot shape even with version/catalog keys present', () => {
  const root = mkdtempSync(join(tmpdir(), 'skill-optimizer-snapshot-legacy-extra-'));
  try {
    const snapshotPath = join(root, 'surface.snapshot.json');
    writeFileSync(snapshotPath, JSON.stringify({
      surface: 'cli',
      actions: [
        {
          name: 'wallet create',
          args: [{ name: '--label', required: true, type: 'string' }],
        },
      ],
      version: ACTION_SNAPSHOT_VERSION,
      catalog: {
        this: 'should be ignored for legacy shape',
      },
    }, null, 2), 'utf-8');

    const loaded = loadSurfaceSnapshotFile(snapshotPath);
    assertEqual(loaded.surface, 'cli', 'valid legacy snapshot should load as legacy shape');
    assertEqual(loaded.actions.length, 1, 'legacy action list should be preserved');
    assertEqual(loaded.actions[0].args[0].name, 'label', 'legacy CLI arg normalization should still apply');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('loadSurfaceSnapshotFile includes file context on invalid JSON', () => {
  const root = mkdtempSync(join(tmpdir(), 'skill-optimizer-snapshot-invalid-json-'));
  try {
    const snapshotPath = join(root, 'surface.snapshot.json');
    writeFileSync(snapshotPath, '{ "surface": "mcp", "actions": ', 'utf-8');

    let threw = false;
    try {
      loadSurfaceSnapshotFile(snapshotPath);
    } catch (error: any) {
      threw = true;
      assert(error.message.includes('Invalid surface snapshot file'), 'error should classify invalid JSON');
      assert(error.message.includes(snapshotPath), 'error should include snapshot path');
    }

    assert(threw, 'invalid JSON should throw');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

if (failed > 0) {
  console.log(`\n${failed}/${passed + failed} tests failed`);
  process.exit(1);
}

console.log(`\n${passed}/${passed + failed} tests passed`);

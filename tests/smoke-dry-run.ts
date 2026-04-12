import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const MOCK_CONFIG_REL = 'mock-repos/mcp-tracker-demo/skill-optimizer.json';
const MOCK_CONFIG_ABS = resolve(REPO_ROOT, MOCK_CONFIG_REL);

function run(args: string[]) {
  return spawnSync('npx', ['tsx', 'src/cli.ts', ...args], {
    encoding: 'utf-8',
    env: {
      ...process.env,
      // Intentionally wipe API keys — dry-run must not need them.
      OPENROUTER_API_KEY: '',
    },
    cwd: REPO_ROOT,
  });
}

function testDryRunNoLLM() {
  const result = run(['--dry-run', '--config', MOCK_CONFIG_REL]);
  assert.strictEqual(result.status, 0, `dry-run failed: ${result.stderr}`);
  assert.ok(result.stdout.includes('=== skill-optimizer dry run ==='));
  assert.ok(result.stdout.includes('No LLM calls made'));
  console.log('PASS: --dry-run succeeds with zero API keys, zero LLM calls');
}

function testDryRunMaxTasksTooSmall() {
  const dir = mkdtempSync(join(tmpdir(), 'skill-opt-dry-'));
  try {
    const base = JSON.parse(readFileSync(MOCK_CONFIG_ABS, 'utf-8')) as Record<string, unknown>;
    const mockDir = resolve(REPO_ROOT, 'mock-repos/mcp-tracker-demo');
    const baseTarget = base.target as Record<string, unknown>;
    const baseDiscovery = (baseTarget.discovery ?? {}) as Record<string, unknown>;
    const baseSources = (baseDiscovery.sources ?? []) as string[];
    // Resolve discovery sources to absolute paths so they work from the temp dir
    const absoluteSources = baseSources.map((s) => resolve(mockDir, s));
    (base as Record<string, unknown>).target = {
      ...baseTarget,
      repoPath: mockDir,
      discovery: {
        ...baseDiscovery,
        sources: absoluteSources,
      },
    };
    (base as Record<string, unknown>).benchmark = {
      ...(base.benchmark as object),
      taskGeneration: {
        ...((base.benchmark as Record<string, unknown>).taskGeneration as object ?? {}),
        enabled: true,
        maxTasks: 1,
      },
    };
    const cfgPath = join(dir, 'skill-optimizer.json');
    writeFileSync(cfgPath, JSON.stringify(base, null, 2));

    const result = run(['--dry-run', '--config', cfgPath]);
    assert.notStrictEqual(result.status, 0, `expected non-zero exit, got: ${result.stdout}`);
    const combined = result.stderr + result.stdout;
    assert.ok(combined.includes('maxTasks'), `expected maxTasks in output, got: ${combined}`);
    assert.ok(combined.includes('in-scope'), `expected in-scope in output, got: ${combined}`);
    console.log('PASS: --dry-run rejects maxTasks < scope_size');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  testDryRunNoLLM();
  testDryRunMaxTasksTooSmall();
  console.log('\nALL PASS: smoke-dry-run');
}

main().catch((err) => { console.error('FAIL: smoke-dry-run', err); process.exit(1); });

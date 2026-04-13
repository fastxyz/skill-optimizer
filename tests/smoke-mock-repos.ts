import { existsSync, readFileSync, rmSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { loadConfig } from '../src/benchmark/config.js';
import { loadOptimizeManifest } from '../src/optimizer/manifest.js';
import { createValidationRunner } from '../src/optimizer/validation.js';
import { getMockRepoTemplatePath, listMockRepoTemplates, materializeMockRepo } from '../src/optimizer/mock-repos.js';

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

console.log('\n=== Mock Repo Smoke Tests ===\n');

await test('listMockRepoTemplates: exposes tracked templates that exist in the worktree', () => {
  const templates = listMockRepoTemplates();
  assert(templates.length >= 1, 'should expose at least one template');
  assert(templates.includes('mcp-tracker-demo'), 'should include mcp-tracker-demo');
  assert(templates.includes('sdk-counter-demo'), 'should include sdk-counter-demo');
});

for (const name of listMockRepoTemplates()) {
  await test(`materializeMockRepo: ${name} becomes a standalone git repo`, async () => {
    const destRoot = mkdtempSync(join(tmpdir(), 'skill-optimizer-mock-'));
    try {
      const materializedPath = await materializeMockRepo(name, destRoot);
      const projectConfigPath = join(materializedPath, 'skill-optimizer.json');

      assert(existsSync(join(materializedPath, '.git')), 'materialized mock repo should be git-initialized');
      assert(existsSync(projectConfigPath), 'unified project config should exist');

      const { config: benchmarkConfig } = loadConfig(projectConfigPath);

      if (name === 'mcp-tracker-demo') {
        assertEqual(benchmarkConfig.surface, 'mcp', 'tracker demo should materialize an MCP benchmark');
        const projectConfigRaw = JSON.parse(readFileSync(projectConfigPath, 'utf-8')) as {
          target?: { repoPath?: string };
          benchmark?: { taskGeneration?: { outputDir?: string } };
          optimize?: { validation?: string[] };
        };
        assert(Array.isArray(projectConfigRaw.optimize?.validation), 'tracker demo optimize config should define validation array');
        assertEqual(projectConfigRaw.optimize?.validation?.length, 0, 'tracker demo should allow empty validation commands');
        assertEqual(projectConfigRaw.target?.repoPath, '.', 'tracker demo config should keep repoPath relative');
        assertEqual(
          projectConfigRaw.benchmark?.taskGeneration?.outputDir,
          './.skill-optimizer',
          'tracker demo should declare task generation output directory',
        );
        assert(existsSync(join(materializedPath, 'SKILL.md')), 'tracker demo should include SKILL.md');
        assert(existsSync(join(materializedPath, 'tools.json')), 'tracker demo should include tools.json');
        const optimizeManifest = loadOptimizeManifest(projectConfigPath);
        assertEqual(optimizeManifest.targetRepo.path, materializedPath, 'optimize target should point at the materialized repo');

        const validation = await createValidationRunner().run(optimizeManifest.targetRepo);
        assert(validation.ok, 'materialized mock repo validation should pass');
      }

      if (name === 'sdk-counter-demo') {
        assertEqual(benchmarkConfig.surface, 'sdk', 'sdk-counter-demo should materialize an SDK benchmark');
        const projectConfigRaw = JSON.parse(readFileSync(projectConfigPath, 'utf-8')) as {
          target?: { surface?: string; scope?: { include?: string[] } };
          benchmark?: { verdict?: { perModelFloor?: number } };
        };
        assert(projectConfigRaw.target?.surface === 'sdk', 'sdk-counter-demo should have sdk surface');
        assert(Array.isArray(projectConfigRaw.target?.scope?.include), 'sdk-counter-demo should define scope.include');
        assert(typeof projectConfigRaw.benchmark?.verdict?.perModelFloor === 'number', 'sdk-counter-demo should define verdict.perModelFloor');
        assert(existsSync(join(materializedPath, 'SKILL.md')), 'sdk-counter-demo should include SKILL.md');
        assert(existsSync(join(materializedPath, 'src', 'counter.ts')), 'sdk-counter-demo should include src/counter.ts');
      }
    } finally {
      rmSync(destRoot, { recursive: true, force: true });
    }
  });
}

await test('materializeMockRepo: replacing an existing destination stays deterministic', async () => {
  const destRoot = mkdtempSync(join(tmpdir(), 'skill-optimizer-mock-'));
  try {
    const template = listMockRepoTemplates()[0]!;
    const materializedPath = await materializeMockRepo(template, destRoot);
    const staleFilePath = join(materializedPath, 'stale.txt');
    await import('node:fs/promises').then(({ writeFile }) => writeFile(staleFilePath, 'stale\n', 'utf-8'));

    const rematerializedPath = await materializeMockRepo(template, destRoot);
    assertEqual(rematerializedPath, materializedPath, 'materialized path should be stable');
    assert(!existsSync(staleFilePath), 'stale files should be removed before re-materializing');
  } finally {
    rmSync(destRoot, { recursive: true, force: true });
  }
});

await test('materializeMockRepo: rejects destinations that overlap the tracked template path', async () => {
  const template = listMockRepoTemplates()[0]!;
  const templatePath = getMockRepoTemplatePath(template);
  const destinationRoot = join(templatePath, '..');

  let threw = false;
  try {
    await materializeMockRepo(template, destinationRoot);
  } catch (error: any) {
    threw = true;
    assert(error.message.includes('overlaps'), 'error should explain the overlap');
  }

  assert(threw, 'should reject overlapping destination paths');
});

await test('mock repo templates keep benchmark and target files together', () => {
  for (const name of listMockRepoTemplates()) {
    const readmePath = join(process.cwd(), 'mock-repos', name, 'README.md');
    const readme = readFileSync(readmePath, 'utf-8');
    assert(readme.includes('skill-optimizer.json'), `${name} README should mention skill-optimizer.json`);
  }
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);

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

await test('listMockRepoTemplates: exposes sdk, cli, and mcp demos', () => {
  const templates = listMockRepoTemplates();
  assertEqual(templates.length, 3, 'should expose exactly 3 templates');
  assert(templates.includes('sdk-demo'), 'should include sdk-demo');
  assert(templates.includes('cli-demo'), 'should include cli-demo');
  assert(templates.includes('mcp-demo'), 'should include mcp-demo');
});

for (const name of ['sdk-demo', 'cli-demo', 'mcp-demo'] as const) {
  await test(`materializeMockRepo: ${name} becomes a standalone git repo`, async () => {
    const destRoot = mkdtempSync(join(tmpdir(), 'skill-benchmark-mock-'));
    try {
      const materializedPath = await materializeMockRepo(name, destRoot);
      const benchmarkConfigPath = join(materializedPath, 'benchmark.config.json');
      const optimizeConfigPath = join(materializedPath, 'optimize.config.json');

      assert(existsSync(join(materializedPath, '.git')), 'materialized mock repo should be git-initialized');
      assert(existsSync(benchmarkConfigPath), 'benchmark config should exist');
      assert(existsSync(optimizeConfigPath), 'optimize config should exist');

      const { config: benchmarkConfig } = loadConfig(benchmarkConfigPath);
      assertEqual(benchmarkConfig.surface, name.startsWith('sdk') ? 'sdk' : name.startsWith('cli') ? 'cli' : 'mcp', 'surface should match template type');

      const optimizeManifest = loadOptimizeManifest(optimizeConfigPath);
      assertEqual(optimizeManifest.targetRepo.path, materializedPath, 'optimize target should point at the materialized repo');

      const validation = await createValidationRunner().run(optimizeManifest.targetRepo);
      assert(validation.ok, 'materialized mock repo validation should pass');
    } finally {
      rmSync(destRoot, { recursive: true, force: true });
    }
  });
}

await test('materializeMockRepo: replacing an existing destination stays deterministic', async () => {
  const destRoot = mkdtempSync(join(tmpdir(), 'skill-benchmark-mock-'));
  try {
    const materializedPath = await materializeMockRepo('sdk-demo', destRoot);
    const staleFilePath = join(materializedPath, 'stale.txt');
    await import('node:fs/promises').then(({ writeFile }) => writeFile(staleFilePath, 'stale\n', 'utf-8'));

    const rematerializedPath = await materializeMockRepo('sdk-demo', destRoot);
    assertEqual(rematerializedPath, materializedPath, 'materialized path should be stable');
    assert(!existsSync(staleFilePath), 'stale files should be removed before re-materializing');
  } finally {
    rmSync(destRoot, { recursive: true, force: true });
  }
});

await test('materializeMockRepo: rejects destinations that overlap the tracked template path', async () => {
  const templatePath = getMockRepoTemplatePath('sdk-demo');
  const destinationRoot = join(templatePath, '..');

  let threw = false;
  try {
    await materializeMockRepo('sdk-demo', destinationRoot);
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
    assert(readme.includes('benchmark.config.json'), `${name} README should mention benchmark.config.json`);
    assert(readme.includes('optimize.config.json'), `${name} README should mention optimize.config.json`);
  }
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);

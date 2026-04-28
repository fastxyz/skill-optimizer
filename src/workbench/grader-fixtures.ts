import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { runCheckCommand } from './check-runner.js';
import { loadWorkbenchCase } from './case-loader.js';
import { getFlag, positionals } from './cli-args.js';
import { loadWorkbenchSuite } from './suite-loader.js';
import type { GraderFixtureResultFile, GraderFixtureSuiteResultFile, ResolvedWorkbenchCase } from './types.js';
import { isRecord, readJsonFile, timestampSlug, writeJsonFile } from './utils.js';
import { buildWorkbenchEnv } from './workspace.js';

export interface RunWorkbenchGraderFixturesParams {
  suitePath: string;
  outDir?: string;
  now?: Date;
}

export async function runWorkbenchGraderFixtures(params: RunWorkbenchGraderFixturesParams): Promise<void> {
  const suite = loadWorkbenchSuite(params.suitePath);
  const startedAt = new Date().toISOString();
  const resultsDir = join(resolve(params.outDir ?? join(suite.configDir, '.results')), timestampSlug(params.now ?? new Date()));
  const results: GraderFixtureResultFile[] = [];
  mkdirSync(resultsDir, { recursive: true });

  for (const suiteCase of suite.cases) {
    const resolved = resolveSuiteCase(suiteCase.path, suiteCase.case);
    const fixtureRoot = join(resolved.configDir, 'grader-fixtures', suiteCase.slug);
    if (!existsSync(fixtureRoot)) {
      results.push({
        caseName: suiteCase.slug,
        fixtureName: '(missing)',
        pass: false,
        evidence: [`grader fixture directory not found: ${fixtureRoot}`],
        graders: [],
      });
      continue;
    }

    for (const entry of readdirSync(fixtureRoot, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const fixtureDir = join(fixtureRoot, entry.name);
        results.push(await runFixture(resolved, suiteCase.slug, entry.name, fixtureDir));
      }
    }
  }

  const passed = results.filter((result) => result.pass).length;
  const failed = results.length - passed;
  const aggregate: GraderFixtureSuiteResultFile = {
    name: suite.name,
    startedAt,
    endedAt: new Date().toISOString(),
    summary: {
      total: results.length,
      passed,
      failed,
      passRate: results.length === 0 ? 0 : passed / results.length,
    },
    results,
  };

  writeJsonFile(join(resultsDir, 'grader-fixture-result.json'), aggregate);
  console.log(`Results: ${resultsDir}`);
  console.log(`Grader fixtures: ${failed === 0 ? 'PASS' : 'FAIL'}`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

export async function runWorkbenchGraderFixturesFromCli(args: string[]): Promise<void> {
  const suitePath = positionals(args, { valueFlags: ['--out'] })[0];
  if (!suitePath) {
    throw new Error('Missing suite path. Usage: skill-optimizer test-graders <suite.yml> [--out <dir>]');
  }
  const outDir = getFlag(args, '--out');
  await runWorkbenchGraderFixtures({
    suitePath: resolve(suitePath),
    outDir: outDir ? resolve(outDir) : undefined,
  });
}

async function runFixture(
  resolved: ResolvedWorkbenchCase,
  caseName: string,
  fixtureName: string,
  fixtureDir: string,
): Promise<GraderFixtureResultFile> {
  const expected = readExpected(join(fixtureDir, 'expected.json'));
  const graders: GraderFixtureResultFile['graders'] = [];
  const evidence: string[] = [];
  const env = buildWorkbenchEnv({ caseDir: resolved.configDir, workDir: fixtureDir, resultsDir: fixtureDir });

  for (const grader of resolved.graders) {
    if (!(grader.name in expected.graders)) {
      evidence.push(`expected.json missing grader: ${grader.name}`);
      continue;
    }

    const grade = await runCheckCommand(grader.command, {
      cwd: fixtureDir,
      env,
      timeoutSeconds: 120,
    });
    const expectedPass = expected.graders[grader.name];
    if (grade.pass !== expectedPass) {
      evidence.push(`${grader.name}: expected ${expectedPass ? 'PASS' : 'FAIL'}, got ${grade.pass ? 'PASS' : 'FAIL'}`);
    }
    graders.push({
      ...grade,
      name: grader.name,
      expected: expectedPass,
    });
  }

  for (const name of Object.keys(expected.graders)) {
    if (!resolved.graders.some((grader) => grader.name === name)) {
      evidence.push(`expected.json references unknown grader: ${name}`);
    }
  }

  return {
    caseName,
    fixtureName,
    pass: evidence.length === 0,
    evidence,
    graders,
  };
}

function readExpected(filePath: string): { graders: Record<string, boolean> } {
  if (!existsSync(filePath)) {
    throw new Error(`grader fixture expected.json not found: ${filePath}`);
  }
  const parsed = readJsonFile(filePath);
  if (!isRecord(parsed)) {
    throw new Error(`grader fixture expected.json must contain an object: ${filePath}`);
  }
  const graders = parsed.graders;
  if (!isRecord(graders)) {
    throw new Error(`grader fixture expected.json must contain a graders object: ${filePath}`);
  }
  const result: Record<string, boolean> = {};
  for (const [name, value] of Object.entries(graders)) {
    if (typeof value !== 'boolean') {
      throw new Error(`expected grader value must be boolean: ${name} in ${filePath}`);
    }
    result[name] = value;
  }
  return { graders: result };
}

function resolveSuiteCase(casePath: string | undefined, inlineCase: ResolvedWorkbenchCase | undefined): ResolvedWorkbenchCase {
  if (inlineCase) return inlineCase;
  if (casePath) return loadWorkbenchCase(casePath);
  throw new Error('Suite case is missing both path and inline case');
}

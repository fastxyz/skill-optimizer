import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { runGraderCommands } from './check-runner.js';
import { loadWorkbenchCase } from './case-loader.js';
import { getFlag, positionals } from './cli-args.js';
import { runShellCommand } from './process.js';
import { loadWorkbenchSuite } from './suite-loader.js';
import type { ReferenceCaseResultFile, ReferenceSuiteResultFile, ResolvedWorkbenchCase, WorkbenchGrade } from './types.js';
import { shellQuote, timestampSlug, writeJsonFile } from './utils.js';
import { buildWorkbenchEnv, prepareWorkbenchDirectory } from './workspace.js';

export interface RunWorkbenchReferenceSolutionsParams {
  suitePath: string;
  outDir?: string;
  now?: Date;
}

export async function runWorkbenchReferenceSolutions(params: RunWorkbenchReferenceSolutionsParams): Promise<void> {
  const suite = loadWorkbenchSuite(params.suitePath);
  const startedAt = new Date().toISOString();
  const resultsDir = join(resolve(params.outDir ?? join(suite.configDir, '.results')), timestampSlug(params.now ?? new Date()));
  const results: ReferenceCaseResultFile[] = [];
  mkdirSync(resultsDir, { recursive: true });

  for (const suiteCase of suite.cases) {
    const resolved = resolveSuiteCase(suiteCase.path, suiteCase.case);
    const caseResultsDir = join(resultsDir, 'references', suiteCase.slug);
    const workDir = join(caseResultsDir, 'work');
    const solutionPath = join(resolved.configDir, 'solutions', suiteCase.slug, 'solution.sh');
    mkdirSync(caseResultsDir, { recursive: true });

    let grade: WorkbenchGrade;
    if (!existsSync(solutionPath)) {
      grade = {
        pass: false,
        score: 0,
        evidence: [`reference solution not found: ${solutionPath}`],
      };
    } else {
      prepareWorkbenchDirectory({
        referencesDir: resolved.referencesDir,
        workspaceDir: join(resolved.configDir, 'workspace'),
        workDir,
      });
      const env = buildWorkbenchEnv({ caseDir: resolved.configDir, workDir, resultsDir: caseResultsDir });
      const solution = await runShellCommand(`sh ${shellQuote(solutionPath)}`, { cwd: workDir, env });
      if (solution.exitCode !== 0) {
        grade = {
          pass: false,
          score: 0,
          evidence: [
            `reference solution failed: ${solutionPath}`,
            solution.stdout.trim(),
            solution.stderr.trim(),
          ].filter(Boolean),
        };
      } else {
        grade = await runGraderCommands(resolved.graders, {
          cwd: workDir,
          env,
          timeoutSeconds: 120,
        });
      }
    }

    const result: ReferenceCaseResultFile = {
      caseName: suiteCase.slug,
      solutionPath,
      resultPath: join('references', suiteCase.slug, 'result.json'),
      ...grade,
    };
    writeJsonFile(join(caseResultsDir, 'result.json'), result);
    results.push(result);
    console.log(`${suiteCase.slug} reference: ${result.pass ? 'PASS' : 'FAIL'}`);
  }

  const passed = results.filter((result) => result.pass).length;
  const failed = results.length - passed;
  const aggregate: ReferenceSuiteResultFile = {
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

  writeJsonFile(join(resultsDir, 'reference-result.json'), aggregate);
  console.log(`Results: ${resultsDir}`);
  console.log(`Reference grade: ${failed === 0 ? 'PASS' : 'FAIL'}`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

export async function runWorkbenchReferenceSolutionsFromCli(args: string[]): Promise<void> {
  const suitePath = positionals(args, { valueFlags: ['--out'] })[0];
  if (!suitePath) {
    throw new Error('Missing suite path. Usage: skill-optimizer verify-suite <suite.yml> [--out <dir>]');
  }
  const outDir = getFlag(args, '--out');
  await runWorkbenchReferenceSolutions({
    suitePath: resolve(suitePath),
    outDir: outDir ? resolve(outDir) : undefined,
  });
}

function resolveSuiteCase(casePath: string | undefined, inlineCase: ResolvedWorkbenchCase | undefined): ResolvedWorkbenchCase {
  if (inlineCase) return inlineCase;
  if (casePath) return loadWorkbenchCase(casePath);
  throw new Error('Suite case is missing both path and inline case');
}

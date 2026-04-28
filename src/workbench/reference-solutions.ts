import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { runGraderCommands } from './check-runner.js';
import { loadWorkbenchCase } from './case-loader.js';
import { positionals } from './cli-args.js';
import { runShellCommand } from './process.js';
import { loadWorkbenchSuite } from './suite-loader.js';
import type { ReferenceCaseResultFile, ReferenceSuiteResultFile, ResolvedWorkbenchCase, WorkbenchGrade } from './types.js';
import { shellQuote } from './utils.js';
import { buildWorkbenchEnv, prepareWorkbenchDirectory } from './workspace.js';

export interface RunWorkbenchReferenceSolutionsParams {
  suitePath: string;
  now?: Date;
}

export async function runWorkbenchReferenceSolutions(params: RunWorkbenchReferenceSolutionsParams): Promise<ReferenceSuiteResultFile> {
  const suite = loadWorkbenchSuite(params.suitePath);
  const startedAt = (params.now ?? new Date()).toISOString();
  const tempDir = mkdtempSync(join(tmpdir(), 'skill-opt-reference-solutions-'));
  const results: ReferenceCaseResultFile[] = [];

  // TODO: add optional known-bad reference checks so verify-suite can prove graders reject obvious wrong outputs.

  try {
    for (const suiteCase of suite.cases) {
      const resolved = resolveSuiteCase(suiteCase.path, suiteCase.case);
      const caseTempDir = join(tempDir, suiteCase.slug);
      const caseResultsDir = join(caseTempDir, 'results');
      const workDir = join(caseTempDir, 'work');
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
        const setupFailure = await runCommands(resolved.setup, { cwd: workDir, env, label: 'setup' });
        if (setupFailure) {
          grade = setupFailure;
        } else {
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
      }

      const result: ReferenceCaseResultFile = {
        caseName: suiteCase.slug,
        solutionPath,
        ...grade,
      };
      results.push(result);
      console.log(`${suiteCase.slug} reference: ${result.pass ? 'PASS' : 'FAIL'}`);
      if (!result.pass) {
        for (const evidence of result.evidence) {
          console.log(`  - ${evidence}`);
        }
      }
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

    console.log(`Reference grade: ${failed === 0 ? 'PASS' : 'FAIL'}`);

    if (failed > 0) {
      process.exitCode = 1;
    }
    return aggregate;
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

async function runCommands(
  commands: string[],
  opts: { cwd: string; env: NodeJS.ProcessEnv; label: string },
): Promise<WorkbenchGrade | undefined> {
  for (const command of commands) {
    const result = await runShellCommand(command, { cwd: opts.cwd, env: opts.env, timeoutSeconds: 120 });
    if (result.exitCode !== 0) {
      return {
        pass: false,
        score: 0,
        evidence: [
          `${opts.label} command failed: ${command}`,
          result.stdout.trim(),
          result.stderr.trim(),
        ].filter(Boolean),
      };
    }
  }

  return undefined;
}

export async function runWorkbenchReferenceSolutionsFromCli(args: string[]): Promise<void> {
  const suitePath = positionals(args, { valueFlags: [] })[0];
  if (!suitePath) {
    throw new Error('Missing suite path. Usage: skill-optimizer verify-suite <suite.yml>');
  }
  await runWorkbenchReferenceSolutions({
    suitePath: resolve(suitePath),
  });
}

function resolveSuiteCase(casePath: string | undefined, inlineCase: ResolvedWorkbenchCase | undefined): ResolvedWorkbenchCase {
  if (inlineCase) return inlineCase;
  if (casePath) return loadWorkbenchCase(casePath);
  throw new Error('Suite case is missing both path and inline case');
}

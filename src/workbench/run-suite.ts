import { mkdirSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';

import { getFlag, positionals } from './cli-args.js';
import { runDockerWorkbenchCase } from './docker-runner.js';
import type { DockerWorkbenchRunResult, RunDockerWorkbenchCaseOptions } from './docker-runner.js';
import { parseModelList, slugModelRef } from './models.js';
import { loadWorkbenchSuite } from './suite-loader.js';
import { aggregateTrials, formatTrialNumber, parseTrialsFlag, summarizeTrialAggregates } from './trials.js';
import type { RunSuiteAggregateResultFile, WorkbenchCaseModelAggregateResult, WorkbenchTrialResultRef } from './types.js';
import { readWorkbenchResultFile, slugPathSegment, timestampSlug, writeJsonFile } from './utils.js';

export interface RunWorkbenchSuiteParams {
  suitePath: string;
  outDir?: string;
  models?: string[];
  image?: string;
  keepWorkspace?: boolean;
  trials?: number;
}

export interface RunWorkbenchSuiteDeps {
  runDockerWorkbenchCase?: (options: RunDockerWorkbenchCaseOptions) => Promise<DockerWorkbenchRunResult>;
  now?: Date;
}

function caseSlugFromPath(casePath: string): string {
  const file = basename(casePath);
  const stem = file.slice(0, file.length - extname(file).length);
  return slugPathSegment(stem === 'case' ? basename(dirname(casePath)) : stem);
}

export async function runWorkbenchSuite(
  params: RunWorkbenchSuiteParams,
  deps: RunWorkbenchSuiteDeps = {},
): Promise<void> {
  const suite = loadWorkbenchSuite(params.suitePath);
  const models = params.models ?? suite.models;
  const trials = params.trials ?? 1;
  if (models.length === 0) {
    throw new Error('Workbench suite requires at least one model via suite models or --models');
  }

  const dockerRunner = deps.runDockerWorkbenchCase ?? runDockerWorkbenchCase;
  const startedAt = new Date().toISOString();
  const resultsDir = join(resolve(params.outDir ?? join(suite.configDir, '.results')), timestampSlug(deps.now ?? new Date()));
  const results: WorkbenchCaseModelAggregateResult[] = [];
  const caseSlugs = suite.cases.map((suiteCase) => suiteCase.slug);

  mkdirSync(resultsDir, { recursive: true });

  for (let caseIndex = 0; caseIndex < suite.cases.length; caseIndex += 1) {
    const suiteCase = suite.cases[caseIndex];
    if (!suiteCase) continue;
    const caseName = suiteCase.slug;
    for (const model of models) {
      const trialResults: WorkbenchTrialResultRef[] = [];
      for (let trial = 1; trial <= trials; trial += 1) {
        const trialDir = join(resultsDir, 'cases', caseName, slugModelRef(model), 'trials', formatTrialNumber(trial));
        const run = await dockerRunner({
          casePath: suiteCase.path,
          case: suiteCase.case,
          resultsDir: trialDir,
          model,
          image: params.image,
          keepWorkspace: params.keepWorkspace,
        });
        const result = readWorkbenchResultFile(run.resultPath);
        trialResults.push({
          trial,
          pass: result.pass,
          score: result.score,
          resultPath: relative(resultsDir, run.resultPath),
          tracePath: relative(resultsDir, run.tracePath),
          ...(run.summaryPath ? { summaryPath: relative(resultsDir, run.summaryPath) } : {}),
        });
        console.log(`${caseName} ${model} trial ${formatTrialNumber(trial)}: ${result.pass ? 'PASS' : 'FAIL'}`);
      }

      const aggregate = aggregateTrials(trialResults);
      results.push({
        caseName,
        model,
        totalTrials: aggregate.totalTrials,
        passedTrials: aggregate.passedTrials,
        failedTrials: aggregate.failedTrials,
        trialPassRate: aggregate.trialPassRate,
        meanScore: aggregate.meanScore,
        passAtK: aggregate.passAtK,
        passHatK: aggregate.passHatK,
        trials: trialResults,
      });
    }
  }

  const summary = summarizeTrialAggregates(results);
  const aggregate: RunSuiteAggregateResultFile = {
    name: suite.name,
    startedAt,
    endedAt: new Date().toISOString(),
    models,
    cases: caseSlugs,
    summary,
    results,
  };

  writeJsonFile(join(resultsDir, 'suite-result.json'), aggregate);
  console.log(`Results: ${resultsDir}`);
  console.log(`Grade: ${summary.failedTrials === 0 ? 'PASS' : 'FAIL'}`);

  if (summary.failedTrials > 0) {
    process.exitCode = 1;
  }
}

export async function runWorkbenchSuiteFromCli(args: string[]): Promise<void> {
  const suiteArg = positionals(args, {
    valueFlags: ['--out', '--models', '--image', '--trials'],
    booleanFlags: ['--keep-workspace'],
  })[0];
  if (!suiteArg) {
    throw new Error('Missing suite path. Usage: skill-optimizer run-suite <suite.yml> [--out <dir>] [--models <openrouter/...,openrouter/...>] [--trials <n>] [--image <name>] [--keep-workspace]');
  }

  const outDir = getFlag(args, '--out');
  const models = getFlag(args, '--models');
  const image = getFlag(args, '--image');
  const trials = parseTrialsFlag(getFlag(args, '--trials'));
  const keepWorkspace = args.includes('--keep-workspace');

  await runWorkbenchSuite({
    suitePath: resolve(suiteArg),
    outDir: outDir ? resolve(outDir) : undefined,
    models: models ? parseModelList(models) : undefined,
    trials,
    image,
    keepWorkspace,
  });
}

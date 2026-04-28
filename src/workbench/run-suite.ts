import { mkdirSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';

import { getFlag, positionals } from './cli-args.js';
import { runDockerWorkbenchCase } from './docker-runner.js';
import type { DockerWorkbenchRunResult, RunDockerWorkbenchCaseOptions } from './docker-runner.js';
import { slugModelRef } from './models.js';
import { loadWorkbenchSuite } from './suite-loader.js';
import { aggregateTrials, formatTrialNumber, parseTrialsFlag, summarizeTrialAggregates } from './trials.js';
import type { RunSuiteAggregateResultFile, WorkbenchCaseModelAggregateResult, WorkbenchTrialResultRef } from './types.js';
import { readWorkbenchResultFile, slugPathSegment, timestampSlug, writeJsonFile } from './utils.js';

export interface RunWorkbenchSuiteParams {
  suitePath: string;
  outDir?: string;
  image?: string;
  keepWorkspace?: boolean;
  trials?: number;
  concurrency?: number;
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

function parseConcurrencyFlag(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`--concurrency must be a positive integer, got: ${value}`);
  }
  return parsed;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(concurrency, items.length);

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      const item = items[index];
      if (item !== undefined) {
        results[index] = await worker(item);
      }
    }
  }));

  return results;
}

function trialDirName(caseName: string, model: string, trial: number): string {
  return `${caseName}--${slugModelRef(model)}--${formatTrialNumber(trial)}`;
}

export async function runWorkbenchSuite(
  params: RunWorkbenchSuiteParams,
  deps: RunWorkbenchSuiteDeps = {},
): Promise<void> {
  const suite = loadWorkbenchSuite(params.suitePath);
  const models = suite.models;
  const trials = params.trials ?? 1;
  if (models.length === 0) {
    throw new Error('Workbench suite requires at least one model via suite models or --models');
  }

  const dockerRunner = deps.runDockerWorkbenchCase ?? runDockerWorkbenchCase;
  const startedAt = new Date().toISOString();
  const resultsDir = join(resolve(params.outDir ?? join(suite.configDir, '.results')), timestampSlug(deps.now ?? new Date()));
  const caseSlugs = suite.cases.map((suiteCase) => suiteCase.slug);
  const concurrency = params.concurrency && params.concurrency > 0
    ? Math.floor(params.concurrency)
    : 1;

  mkdirSync(resultsDir, { recursive: true });

  const jobs = suite.cases.flatMap((suiteCase) => models.flatMap((model) => (
    Array.from({ length: trials }, (_, index) => ({
      suiteCase,
      caseName: suiteCase.slug,
      model,
      trial: index + 1,
    }))
  )));

  const completedTrials = await mapWithConcurrency(jobs, concurrency, async (job) => {
    const trialDir = join(resultsDir, 'trials', trialDirName(job.caseName, job.model, job.trial));
    const run = await dockerRunner({
      casePath: job.suiteCase.path,
      case: job.suiteCase.case,
      resultsDir: trialDir,
      model: job.model,
      image: params.image,
      keepWorkspace: params.keepWorkspace,
      appendSystemPrompt: suite.appendSystemPrompt,
    });
    const result = readWorkbenchResultFile(run.resultPath);
    const trialResult: WorkbenchTrialResultRef = {
      trial: job.trial,
      pass: result.pass,
      score: result.score,
      resultPath: relative(resultsDir, run.resultPath),
      tracePath: relative(resultsDir, run.tracePath),
      ...(run.summaryPath ? { summaryPath: relative(resultsDir, run.summaryPath) } : {}),
    };
    console.log(`${job.caseName} ${job.model} trial ${formatTrialNumber(job.trial)}: ${result.pass ? 'PASS' : 'FAIL'}`);
    return { ...job, trialResult };
  });

  const results: WorkbenchCaseModelAggregateResult[] = [];
  for (const suiteCase of suite.cases) {
    for (const model of models) {
      const trialResults = completedTrials
        .filter((trial) => trial.caseName === suiteCase.slug && trial.model === model)
        .map((trial) => trial.trialResult)
        .sort((left, right) => left.trial - right.trial);
      const aggregate = aggregateTrials(trialResults);
      results.push({
        caseName: suiteCase.slug,
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
    valueFlags: ['--out', '--image', '--trials', '--concurrency'],
    booleanFlags: ['--keep-workspace'],
  })[0];
  if (!suiteArg) {
    throw new Error('Missing suite path. Usage: skill-optimizer run-suite <suite.yml> [--out <dir>] [--trials <n>] [--concurrency <n>] [--image <name>] [--keep-workspace]');
  }

  const outDir = getFlag(args, '--out');
  const image = getFlag(args, '--image');
  const trials = parseTrialsFlag(getFlag(args, '--trials'));
  const concurrency = parseConcurrencyFlag(getFlag(args, '--concurrency'));
  const keepWorkspace = args.includes('--keep-workspace');

  await runWorkbenchSuite({
    suitePath: resolve(suiteArg),
    outDir: outDir ? resolve(outDir) : undefined,
    trials,
    concurrency,
    image,
    keepWorkspace,
  });
}

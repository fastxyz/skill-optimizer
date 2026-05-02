import { mkdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

import { loadWorkbenchCase } from './case-loader.js';
import { getFlag, positionals } from './cli-args.js';
import { runDockerWorkbenchCase } from './docker-runner.js';
import type { DockerWorkbenchRunResult, RunDockerWorkbenchCaseOptions } from './docker-runner.js';
import { ensureOpenRouterModelRef, parseModelList, slugModelRef } from './models.js';
import { aggregateTrials, formatTrialNumber, parseTrialsFlag, summarizeTrialAggregates } from './trials.js';
import type { RunCaseAggregateResultFile, WorkbenchModelAggregateResult, WorkbenchTrialResultRef } from './types.js';
import { readWorkbenchResultFile, timestampSlug, writeJsonFile } from './utils.js';

export interface RunWorkbenchCaseParams {
  casePath: string;
  outDir?: string;
  model?: string;
  models?: string[];
  image?: string;
  keepWorkspace?: boolean;
  trials?: number;
  concurrency?: number;
}

export interface RunWorkbenchCaseDeps {
  runDockerWorkbenchCase?: (options: RunDockerWorkbenchCaseOptions) => Promise<DockerWorkbenchRunResult>;
  now?: Date;
}

function runResultsDir(params: RunWorkbenchCaseParams, now: Date): string {
  const root = resolve(params.outDir ?? join(dirname(resolve(params.casePath)), '.results'));
  return join(root, timestampSlug(now));
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

function trialDirName(model: string, trial: number): string {
  return `${slugModelRef(model)}--${formatTrialNumber(trial)}`;
}

async function runWorkbenchCaseMatrix(
  params: RunWorkbenchCaseParams & { models: string[] },
  deps: RunWorkbenchCaseDeps,
): Promise<void> {
  const dockerRunner = deps.runDockerWorkbenchCase ?? runDockerWorkbenchCase;
  const startedAt = new Date().toISOString();
  const resultsDir = runResultsDir(params, deps.now ?? new Date());
  const trials = params.trials ?? 1;
  const concurrency = params.concurrency && params.concurrency > 0
    ? Math.floor(params.concurrency)
    : 1;

  mkdirSync(resultsDir, { recursive: true });

  const jobs = params.models.flatMap((model) => Array.from({ length: trials }, (_, index) => ({
    model,
    trial: index + 1,
  })));

  const completedTrials = await mapWithConcurrency(jobs, concurrency, async (job) => {
    const trialDir = join(resultsDir, 'trials', trialDirName(job.model, job.trial));
    const run = await dockerRunner({
      casePath: params.casePath,
      resultsDir: trialDir,
      model: job.model,
      image: params.image,
      keepWorkspace: params.keepWorkspace,
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

    console.log(`${job.model} trial ${formatTrialNumber(job.trial)}: ${result.pass ? 'PASS' : 'FAIL'}`);
    return { ...job, trialResult };
  });

  const results: WorkbenchModelAggregateResult[] = [];
  for (const model of params.models) {
    const trialResults = completedTrials
      .filter((trial) => trial.model === model)
      .map((trial) => trial.trialResult)
      .sort((left, right) => left.trial - right.trial);
    const aggregate = aggregateTrials(trialResults);
    results.push({
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

  const summary = summarizeTrialAggregates(results);
  const aggregate: RunCaseAggregateResultFile = {
    name: 'run-case',
    startedAt,
    endedAt: new Date().toISOString(),
    models: params.models,
    summary,
    results,
  };

  writeJsonFile(join(resultsDir, 'run-result.json'), aggregate);
  console.log(`Results: ${resultsDir}`);
  console.log(`Grade: ${summary.failedTrials === 0 ? 'PASS' : 'FAIL'}`);

  if (summary.failedTrials > 0) {
    process.exitCode = 1;
  }
}

export async function runWorkbenchCase(
  params: RunWorkbenchCaseParams,
  deps: RunWorkbenchCaseDeps = {},
): Promise<void> {
  const model = params.model ? ensureOpenRouterModelRef(params.model) : undefined;
  const models = params.models?.map((modelRef) => ensureOpenRouterModelRef(modelRef));

  if ((models && models.length > 0) || (params.trials ?? 1) > 1) {
    const matrixModels = models && models.length > 0
      ? models
      : [model ?? loadWorkbenchCase(params.casePath).model];
    await runWorkbenchCaseMatrix({ ...params, model, models: matrixModels }, deps);
    return;
  }

  const dockerRunner = deps.runDockerWorkbenchCase ?? runDockerWorkbenchCase;
  const selectedModel = models?.[0] ?? model;
  const run = await dockerRunner({
    casePath: params.casePath,
    outDir: params.outDir,
    model: selectedModel,
    image: params.image,
    keepWorkspace: params.keepWorkspace,
  });

  const result = readWorkbenchResultFile(run.resultPath);
  console.log(`Results: ${run.resultsDir}`);
  console.log(`Grade: ${result.pass ? 'PASS' : 'FAIL'}`);

  if (result.evidence.length > 0) {
    for (const line of result.evidence) {
      console.log(`- ${line}`);
    }
  } else {
    console.log('- (no evidence)');
  }

  if (!result.pass) {
    process.exitCode = 1;
  }
}

export async function runWorkbenchCaseFromCli(args: string[]): Promise<void> {
  const caseArg = positionals(args, {
    valueFlags: ['--out', '--model', '--models', '--image', '--trials', '--concurrency'],
    booleanFlags: ['--keep-workspace'],
  })[0];
  if (!caseArg) {
    throw new Error('Missing case path. Usage: skill-optimizer run-case <case.yml> [--out <dir>] [--model <openrouter/...>] [--models <openrouter/...,openrouter/...>] [--trials <n>] [--concurrency <n>] [--image <name>] [--keep-workspace]');
  }

  const outDir = getFlag(args, '--out');
  const model = getFlag(args, '--model');
  const models = getFlag(args, '--models');
  const image = getFlag(args, '--image');
  const trials = parseTrialsFlag(getFlag(args, '--trials'));
  const concurrency = parseConcurrencyFlag(getFlag(args, '--concurrency'));
  const keepWorkspace = args.includes('--keep-workspace');

  await runWorkbenchCase({
    casePath: resolve(caseArg),
    outDir: outDir ? resolve(outDir) : undefined,
    model: model ? ensureOpenRouterModelRef(model) : undefined,
    models: models ? parseModelList(models) : undefined,
    trials,
    concurrency,
    image,
    keepWorkspace,
  });
}

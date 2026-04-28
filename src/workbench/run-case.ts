import { mkdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

import { loadWorkbenchCase } from './case-loader.js';
import { getFlag, positionals } from './cli-args.js';
import { runDockerWorkbenchCase } from './docker-runner.js';
import type { DockerWorkbenchRunResult, RunDockerWorkbenchCaseOptions } from './docker-runner.js';
import { parseModelList, slugModelRef } from './models.js';
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
}

export interface RunWorkbenchCaseDeps {
  runDockerWorkbenchCase?: (options: RunDockerWorkbenchCaseOptions) => Promise<DockerWorkbenchRunResult>;
  now?: Date;
}

function runResultsDir(params: RunWorkbenchCaseParams, now: Date): string {
  const root = resolve(params.outDir ?? join(dirname(resolve(params.casePath)), '.results'));
  return join(root, timestampSlug(now));
}

async function runWorkbenchCaseMatrix(
  params: RunWorkbenchCaseParams & { models: string[] },
  deps: RunWorkbenchCaseDeps,
): Promise<void> {
  const dockerRunner = deps.runDockerWorkbenchCase ?? runDockerWorkbenchCase;
  const startedAt = new Date().toISOString();
  const resultsDir = runResultsDir(params, deps.now ?? new Date());
  const results: WorkbenchModelAggregateResult[] = [];
  const trials = params.trials ?? 1;

  mkdirSync(resultsDir, { recursive: true });

  for (const model of params.models) {
    const trialResults: WorkbenchTrialResultRef[] = [];
    for (let trial = 1; trial <= trials; trial += 1) {
      const trialDir = join(resultsDir, 'models', slugModelRef(model), 'trials', formatTrialNumber(trial));
      const run = await dockerRunner({
        casePath: params.casePath,
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

      console.log(`${model} trial ${formatTrialNumber(trial)}: ${result.pass ? 'PASS' : 'FAIL'}`);
    }

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
  if ((params.models && params.models.length > 0) || (params.trials ?? 1) > 1) {
    const matrixModels = params.models && params.models.length > 0
      ? params.models
      : [params.model ?? loadWorkbenchCase(params.casePath).model];
    await runWorkbenchCaseMatrix({ ...params, models: matrixModels }, deps);
    return;
  }

  const dockerRunner = deps.runDockerWorkbenchCase ?? runDockerWorkbenchCase;
  const model = params.models?.[0] ?? params.model;
  const run = await dockerRunner({
    casePath: params.casePath,
    outDir: params.outDir,
    model,
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
    valueFlags: ['--out', '--model', '--models', '--image', '--trials'],
    booleanFlags: ['--keep-workspace'],
  })[0];
  if (!caseArg) {
    throw new Error('Missing case path. Usage: skill-optimizer run-case <case.yml> [--out <dir>] [--model <openrouter/...>] [--models <openrouter/...,openrouter/...>] [--trials <n>] [--image <name>] [--keep-workspace]');
  }

  const outDir = getFlag(args, '--out');
  const model = getFlag(args, '--model');
  const models = getFlag(args, '--models');
  const image = getFlag(args, '--image');
  const trials = parseTrialsFlag(getFlag(args, '--trials'));
  const keepWorkspace = args.includes('--keep-workspace');

  await runWorkbenchCase({
    casePath: resolve(caseArg),
    outDir: outDir ? resolve(outDir) : undefined,
    model,
    models: models ? parseModelList(models) : undefined,
    trials,
    image,
    keepWorkspace,
  });
}

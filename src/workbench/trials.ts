import type { WorkbenchAggregateSummary } from './types.js';

export interface TrialScoreInput {
  trial: number;
  pass: boolean;
  score: number;
}

export interface TrialAggregate {
  totalTrials: number;
  passedTrials: number;
  failedTrials: number;
  trialPassRate: number;
  meanScore: number;
  passAtK: boolean;
  passHatK: boolean;
}

export function formatTrialNumber(trial: number): string {
  if (!Number.isInteger(trial) || trial <= 0) {
    throw new Error('Trial number must be a positive integer');
  }
  return String(trial).padStart(3, '0');
}

export function parseTrialsFlag(value: string | undefined): number {
  if (value === undefined) {
    return 1;
  }

  const trials = Number(value);
  if (!Number.isInteger(trials) || trials <= 0) {
    throw new Error('Field "trials" must be a positive integer');
  }
  return trials;
}

export function aggregateTrials(trials: TrialScoreInput[]): TrialAggregate {
  const totalTrials = trials.length;
  const passedTrials = trials.filter((trial) => trial.pass).length;
  const failedTrials = totalTrials - passedTrials;
  const scoreTotal = trials.reduce((sum, trial) => sum + trial.score, 0);

  return {
    totalTrials,
    passedTrials,
    failedTrials,
    trialPassRate: totalTrials === 0 ? 0 : passedTrials / totalTrials,
    meanScore: totalTrials === 0 ? 0 : scoreTotal / totalTrials,
    passAtK: totalTrials > 0 && passedTrials > 0,
    passHatK: totalTrials > 0 && passedTrials === totalTrials,
  };
}

export function summarizeTrialAggregates(results: TrialAggregate[]): WorkbenchAggregateSummary {
  const totalTrials = results.reduce((sum, result) => sum + result.totalTrials, 0);
  const passedTrials = results.reduce((sum, result) => sum + result.passedTrials, 0);
  const failedTrials = totalTrials - passedTrials;
  const scoreTotal = results.reduce((sum, result) => sum + result.meanScore * result.totalTrials, 0);
  const passed = results.filter((result) => result.passHatK).length;
  const failed = results.length - passed;

  return {
    total: results.length,
    passed,
    failed,
    passRate: results.length === 0 ? 0 : passed / results.length,
    totalTrials,
    passedTrials,
    failedTrials,
    trialPassRate: totalTrials === 0 ? 0 : passedTrials / totalTrials,
    meanScore: totalTrials === 0 ? 0 : scoreTotal / totalTrials,
  };
}

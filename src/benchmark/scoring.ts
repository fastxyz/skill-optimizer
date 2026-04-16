import type {
  BenchmarkReport,
  ModelConfig,
  Verdict,
  VerdictPolicy,
} from './types.js';

export function computePerModelPassRates(report: BenchmarkReport): Record<string, number> {
  const rates: Record<string, number> = {};
  for (const [id, summary] of Object.entries(report.summary.perModel)) {
    rates[id] = summary.passRate;
  }
  return rates;
}

export function computeWeightedAverage(report: BenchmarkReport, models: ModelConfig[]): number {
  if (models.length === 0) return 0;
  const rates = computePerModelPassRates(report);
  let num = 0;
  let den = 0;
  for (const model of models) {
    const w = model.weight ?? 1;
    num += w * (rates[model.id] ?? 0);
    den += w;
  }
  return den > 0 ? num / den : 0;
}

export function computeVerdict(
  report: BenchmarkReport,
  models: ModelConfig[],
  policy: VerdictPolicy,
): { result: Verdict; reasons: string[]; policy: VerdictPolicy } {
  const rates = computePerModelPassRates(report);
  const reasons: string[] = [];

  for (const model of models) {
    const rate = rates[model.id] ?? 0;
    if (rate < policy.perModelFloor) {
      reasons.push(
        `${model.name} (${model.id}) passes ${(rate * 100).toFixed(1)}% < floor ${(policy.perModelFloor * 100).toFixed(1)}%`,
      );
    }
  }

  const wavg = report.summary.weightedAverage ?? computeWeightedAverage(report, models);
  if (wavg < policy.targetWeightedAverage) {
    reasons.push(
      `weighted average ${(wavg * 100).toFixed(1)}% < target ${(policy.targetWeightedAverage * 100).toFixed(1)}%`,
    );
  }

  if (report.scopeCoverage?.coverageViolation) {
    reasons.push('coverage violation: some in-scope actions have zero tasks');
  }

  return {
    result: reasons.length === 0 ? 'PASS' : 'FAIL',
    reasons,
    policy,
  };
}

export function accept(
  before: BenchmarkReport,
  after: BenchmarkReport,
  models: ModelConfig[],
  policy: VerdictPolicy & { minImprovement: number },
): boolean {
  // When no model configs are provided, fall back to simple overall pass rate comparison
  if (models.length === 0) {
    return after.summary.overallPassRate - before.summary.overallPassRate >= policy.minImprovement;
  }
  const beforeRates = computePerModelPassRates(before);
  const afterRates = computePerModelPassRates(after);
  for (const model of models) {
    const afterRate = afterRates[model.id] ?? 0;
    if (afterRate < policy.perModelFloor) {
      const beforeRate = beforeRates[model.id] ?? 0;
      if (afterRate <= beforeRate) return false;
    }
  }
  const beforeAvg = before.summary.weightedAverage ?? computeWeightedAverage(before, models);
  const afterAvg = after.summary.weightedAverage ?? computeWeightedAverage(after, models);
  return (afterAvg - beforeAvg) >= policy.minImprovement;
}

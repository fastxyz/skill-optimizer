import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { runBenchmark } from '../benchmark/runner.js';
import type { BenchmarkReport } from '../benchmark/types.js';

interface BenchmarkAdapterRunOptions {
  outputDir: string;
  label: string;
  verdictPolicy?: { perModelFloor: number; targetWeightedAverage: number };
  /** Override the skill source for this benchmark run (local versioned copy). */
  skillOverride?: string;
  /** Override companion skill reference files while preserving stable skill_read paths. */
  skillReferenceOverrides?: Array<{ source: string; promptPath: string; baseSource?: string }>;
}

interface BenchmarkAdapterRunResult {
  report: BenchmarkReport;
  reportPath: string;
}

export function createBenchmarkAdapter(): {
  run(configPath: string, opts: BenchmarkAdapterRunOptions): Promise<BenchmarkAdapterRunResult>;
} {
  return {
    async run(configPath: string, opts: BenchmarkAdapterRunOptions) {
      const runOutputDir = resolve(opts.outputDir, opts.label);
      mkdirSync(runOutputDir, { recursive: true });

      const report = await runBenchmark({
        configPath,
        outputDir: runOutputDir,
        verdictPolicy: opts.verdictPolicy,
        skillOverride: opts.skillOverride,
        skillReferenceOverrides: opts.skillReferenceOverrides,
      });
      return {
        report,
        reportPath: resolve(runOutputDir, 'report.json'),
      };
    },
  };
}

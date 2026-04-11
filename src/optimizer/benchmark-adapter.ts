import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { runBenchmark } from '../benchmark/runner.js';
import type { BenchmarkReport } from '../benchmark/types.js';

export interface BenchmarkAdapterRunOptions {
  outputDir: string;
  label: string;
}

export interface BenchmarkAdapterRunResult {
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

      const report = await runBenchmark({ configPath, outputDir: runOutputDir });
      return {
        report,
        reportPath: resolve(runOutputDir, 'report.json'),
      };
    },
  };
}

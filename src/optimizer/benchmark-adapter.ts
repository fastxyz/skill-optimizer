import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { runBenchmark } from '../benchmark/runner.js';
import type { BenchmarkReport } from '../benchmark/types.js';

export function createBenchmarkAdapter(): { run(configPath: string): Promise<BenchmarkReport> } {
  return {
    async run(configPath: string) {
      const outputDir = mkdtempSync(join(tmpdir(), 'skill-benchmark-optimize-'));
      try {
        return await runBenchmark({ configPath, outputDir });
      } finally {
        rmSync(outputDir, { recursive: true, force: true });
      }
    },
  };
}

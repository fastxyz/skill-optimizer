#!/usr/bin/env node

import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

import type { Tier } from './types.js';
import { runBenchmark } from './runner.js';
import { loadReport, compareReports, printComparison } from './compare.js';
import { printSummary, generateMarkdown } from './reporter.js';
import { printCoverage } from './coverage.js';
import { initBenchmark } from './init.js';

// ── Arg parsing helpers ───────────────────────────────────────────────────────

/** Return the value of a named flag, e.g. --tier flagship → 'flagship' */
function getFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1) return undefined;
  const val = args[idx + 1];
  if (!val || val.startsWith('--')) {
    console.error(`ERROR: Flag ${flag} requires a value.`);
    process.exit(1);
  }
  return val;
}

/** Return true if a boolean flag is present, e.g. --no-cache */
function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

/** Return all positional (non-flag) arguments. */
function positionals(args: string[]): string[] {
  const result: string[] = [];
  let i = 0;
  while (i < args.length) {
    const arg = args[i]!;
    if (arg.startsWith('--')) {
      // skip flag + its value (if next token is not a flag)
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        i += 2;
      } else {
        i += 1;
      }
    } else {
      result.push(arg);
      i++;
    }
  }
  return result;
}

function printUsage(): void {
  console.log(`
Skill Benchmark CLI — Test SDK/MCP skill documentation quality

Usage:
  skill-benchmark init                          Scaffold config and example tasks
  skill-benchmark run [options]                 Run the benchmark
  skill-benchmark compare [options]             Compare two benchmark reports

Run options:
  --config <path>                               Config file (default: benchmark.config.json)
  --tier <flagship|mid|low>                     Filter models by tier
  --task <task-id>                              Run a single task
  --model <slug>                                Run a single model
  --no-cache                                    Force fresh skill fetch

Compare options:
  --baseline <path>                             Path to baseline report.json
  --current <path>                              Path to current report.json

Examples:
  skill-benchmark init
  skill-benchmark run
  skill-benchmark run --config ./my-config.json
  skill-benchmark run --tier flagship
  skill-benchmark run --task send-tokens
  skill-benchmark run --model gpt-4o
  skill-benchmark run --no-cache
  skill-benchmark compare --baseline results/old/report.json --current results/report.json
`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Strip node + script path from argv
  const args = process.argv.slice(2);

  if (hasFlag(args, '--help') || hasFlag(args, '-h')) {
    printUsage();
    process.exit(0);
  }

  const pos = positionals(args);
  const command = pos[0];

  // ── Init mode ────────────────────────────────────────────────────────────────
  if (command === 'init') {
    initBenchmark();
    process.exit(0);
  }

  // ── Compare mode ────────────────────────────────────────────────────────────
  if (command === 'compare') {
    const baselinePath = getFlag(args, '--baseline');
    const currentPath = getFlag(args, '--current');

    if (!baselinePath) {
      console.error('ERROR: --baseline <path> is required for compare mode.');
      console.error('  Example: skill-benchmark compare --baseline results/old/report.json --current results/report.json');
      process.exit(1);
    }
    if (!currentPath) {
      console.error('ERROR: --current <path> is required for compare mode.');
      console.error('  Example: skill-benchmark compare --baseline results/old/report.json --current results/report.json');
      process.exit(1);
    }

    let baseline;
    try {
      baseline = loadReport(resolve(baselinePath));
    } catch (err) {
      console.error(`ERROR: Could not load baseline report from '${baselinePath}': ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }

    let current;
    try {
      current = loadReport(resolve(currentPath));
    } catch (err) {
      console.error(`ERROR: Could not load current report from '${currentPath}': ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }

    const comparison = compareReports(baseline, current);
    printComparison(comparison);
    process.exit(0);
  }

  // ── Benchmark mode (default, also handles explicit 'run' command) ─────────────
  const tierRaw = getFlag(args, '--tier');
  const validTiers: Tier[] = ['flagship', 'mid', 'low'];
  if (tierRaw && !validTiers.includes(tierRaw as Tier)) {
    console.error(`ERROR: Invalid tier '${tierRaw}'. Must be one of: ${validTiers.join(', ')}`);
    process.exit(1);
  }

  const options = {
    configPath: getFlag(args, '--config'),
    tier: tierRaw as Tier | undefined,
    taskId: getFlag(args, '--task'),
    modelSlug: getFlag(args, '--model'),
    noCache: hasFlag(args, '--no-cache'),
  };

  let report;
  try {
    report = await runBenchmark(options);
  } catch (err) {
    console.error(`\nFATAL: Benchmark failed: ${err instanceof Error ? err.message : err}`);
    if (err instanceof Error && err.stack) {
      console.error(err.stack);
    }
    process.exit(1);
  }

  // Print console summary
  printSummary(report);

  // Print coverage
  printCoverage(report.coverage);

  // Determine output dir — resolve relative to the config file's directory (matching the runner)
  const configFileDir = options.configPath ? dirname(resolve(options.configPath)) : process.cwd();
  const reportConfig = report.config as { name: string; mode: string; outputDir?: string };
  const outputDir = resolve(configFileDir, reportConfig?.outputDir ?? 'benchmark-results');

  // Generate and save Markdown report alongside JSON
  const mdPath = resolve(outputDir, 'report.md');
  try {
    const markdown = generateMarkdown(report);
    writeFileSync(mdPath, markdown, 'utf-8');
    console.log(`[output] Markdown report saved to ${mdPath}`);
  } catch (err) {
    console.error(`WARNING: Could not write Markdown report: ${err instanceof Error ? err.message : err}`);
  }

  // Final summary line
  const { summary } = report;
  const passedCount = Math.round(summary.overallPassRate * summary.totalEvaluations);
  console.log(
    `\nDone. ${passedCount}/${summary.totalEvaluations} evaluations passed ` +
      `(${(summary.overallPassRate * 100).toFixed(1)}%). ` +
      `Coverage: ${(summary.methodCoveragePercent * 100).toFixed(1)}%.`,
  );

  process.exit(0);
}

main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});

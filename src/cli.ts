#!/usr/bin/env node

import { existsSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { config as loadDotenv } from 'dotenv';

loadDotenv({ override: true, quiet: true });

import type { Tier } from './benchmark/types.js';
import type { ResolvedProjectConfig } from './project/types.js';
import { runBenchmark } from './benchmark/runner.js';
import { loadReport, compareReports, printComparison } from './benchmark/compare.js';
import { printSummary, generateMarkdown } from './benchmark/reporter.js';
import { printCoverage } from './benchmark/coverage.js';
import { printOptimizeSummary, runOptimizeFromConfig } from './optimizer/main.js';
import { DEFAULT_PROJECT_CONFIG_NAME, loadProjectConfig, parseModelRef } from './project/index.js';
import { runDoctor } from './doctor/index.js';
import { createDefaultPiTaskGenerator, generateTasksForProject, createDefaultPiCritic, discoverActionsOnly, resolveScope } from './tasks/index.js';
import type { Recommendation } from './verdict/recommendations.js';
import { generateRecommendations } from './verdict/recommendations.js';
import { renderVerdictConsole, renderVerdictMarkdown } from './verdict/render.js';
import { importCommands } from './import/index.js';
import { scaffoldInit } from './init/scaffold.js';
import { buildDefaultAnswers, readAnswersFile } from './init/answers.js';
import type { WizardAnswers } from './init/answers.js';
import { runWizard } from './init/wizard.js';
import { detectProject, detectedToPreseed, printDetectionSummary } from './init/detect-project.js';
import { ERRORS, SkillOptimizerError, printError } from './errors.js';

// ── Error handling ────────────────────────────────────────────────────────────

/** Print an error and exit. SkillOptimizerErrors render their fix list; others
 * are wrapped in E_UNEXPECTED and include the stack trace. */
function fatalError(err: unknown): never {
  if (err instanceof SkillOptimizerError) {
    printError(err);
  } else {
    printError(new SkillOptimizerError(ERRORS.E_UNEXPECTED, err instanceof Error ? err.message : String(err)));
    if (err instanceof Error && err.stack) console.error(err.stack);
  }
  process.exit(1);
}

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
const BOOLEAN_FLAGS = new Set([
  '--help',
  '-h',
  '--auto',
  '--dry-run',
  '--no-cache',
  '--skip-generation',
  '--check-models',
  '--fix',
  '--static',
  '--scrape',
  '--yes',
]);

const VALUE_FLAGS = new Set([
  '--answers',
  '--baseline',
  '--config',
  '--current',
  '--depth',
  '--from',
  '--max-iterations',
  '--model',
  '--out',
  '--task',
  '--tier',
]);

export function positionals(args: string[]): string[] {
  const result: string[] = [];
  let i = 0;
  while (i < args.length) {
    const arg = args[i]!;
    if (BOOLEAN_FLAGS.has(arg)) {
      i += 1;
      continue;
    }

    if (VALUE_FLAGS.has(arg)) {
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        i += 2;
      } else {
        i += 1;
      }
      continue;
    }

    if (arg.startsWith('--')) {
      throw new Error(`Unknown flag: ${arg}`);
    } else {
      result.push(arg);
      i++;
    }
  }
  return result;
}

function printUsage(): void {
  console.log(`
Skill Optimizer CLI — Benchmark and optimize SDK/CLI/MCP guidance

Usage:
  skill-optimizer init [sdk|cli|mcp]            Interactive wizard — scaffold config for the given surface
  skill-optimizer init [surface] --yes          Accept all defaults non-interactively
  skill-optimizer init --answers <file.json>    Load wizard answers from a JSON file (CI mode)
  skill-optimizer init --auto                   Auto-detect surface from CWD and pre-fill wizard
  skill-optimizer import-commands [options]     Extract CLI commands from source or binary
  skill-optimizer doctor [options]              Validate config pre-flight
  skill-optimizer generate-tasks [options]      Generate and freeze tasks from discovered surface
  skill-optimizer benchmark [options]           Run the benchmark
  skill-optimizer run [options]                 Run the benchmark
  skill-optimizer optimize [options]            Run the optimization loop
  skill-optimizer compare [options]             Compare two benchmark reports

Global options:
  --dry-run                                     Discover + scope preview only; no LLM calls, no side effects
  --config <path>                               Config file (overrides per-command default)

Doctor options:
  --config <path>                               Config file (default: skill-optimizer.json)
  --static                                      Run tier-1 structural checks only (no discovery)
  --check-models                                Also ping each model for reachability (tier 3)
  --fix                                         Apply auto-fixable issues and write config to disk

Run options:
  --config <path>                               Config file (default: skill-optimizer.json)
  --tier <flagship|mid|low>                     Filter models by tier
  --task <task-id>                              Run a single task
  --model <slug>                                Run a single model
  --no-cache                                    Force fresh skill fetch

Optimize options:
  --config <path>                               Config file (default: skill-optimizer.json)
  --max-iterations <n>                          Override optimization iteration cap
  --skip-generation                             Disable task generation for this run

Generate-tasks options:
  --config <path>                               Config file (default: skill-optimizer.json)

Import-commands options:
  --from <path>                                 Entry file or binary name (required)
  --out <path>                                  Output path (default: skill-optimizer/.skill-optimizer/cli-commands.json)
  --scrape                                      Force --help scraping regardless of file type
  --depth <n>                                   Max subcommand depth for --help scraping (default: 2)

Compare options:
  --baseline <path>                             Path to baseline report.json
  --current <path>                              Path to current report.json

Examples:
  skill-optimizer init cli
  skill-optimizer init sdk
  skill-optimizer init mcp
  skill-optimizer import-commands --from ./src/cli.ts
  skill-optimizer import-commands --from fast-cli --scrape
  skill-optimizer doctor --config ./skill-optimizer.json
  skill-optimizer doctor --static
  skill-optimizer doctor --check-models
  skill-optimizer doctor --fix
  skill-optimizer --dry-run --config ./skill-optimizer.json
  skill-optimizer benchmark --config ./skill-optimizer.json
  skill-optimizer run
  skill-optimizer run --config ./my-config.json
  skill-optimizer run --tier flagship
  skill-optimizer run --task send-tokens
  skill-optimizer run --model gpt-4o
  skill-optimizer run --no-cache
  skill-optimizer generate-tasks --config ./skill-optimizer.json
  skill-optimizer optimize --config ./skill-optimizer.json
  skill-optimizer compare --baseline results/old/report.json --current results/report.json
`);
}

// ── Dry-run ───────────────────────────────────────────────────────────────────

async function runDryRun(configPath: string): Promise<void> {
  const project = await loadProjectConfig(configPath);
  const discovered = discoverActionsOnly(project);
  const { inScope, outOfScope } = resolveScope(discovered, project.target.scope);

  console.log('=== skill-optimizer dry run ===');
  console.log(`Config: ${project.configPath}`);
  console.log(`Surface: ${project.target.surface}`);
  console.log(`Discovered: ${discovered.length} action(s)`);
  console.log(`In scope:     ${inScope.length} — ${inScope.map((a) => a.name).join(', ')}`);
  console.log(`Out of scope: ${outOfScope.length} — ${outOfScope.map((a) => a.name).join(', ')}`);

  const maxTasks = project.benchmark.taskGeneration.maxTasks;
  if (project.benchmark.taskGeneration.enabled && inScope.length > 0 && maxTasks < inScope.length) {
    console.error(`\nERROR: maxTasks (${maxTasks}) < in-scope action count (${inScope.length}).`);
    console.error(`Raise benchmark.taskGeneration.maxTasks in ${project.configPath}, or tighten target.scope.exclude.`);
    process.exit(1);
  }

  if (inScope.length === 0) {
    console.error('\nERROR: zero in-scope actions. Adjust target.scope.include/exclude in your config.');
    process.exit(1);
  }

  console.log('\nNo LLM calls made. Zero side effects.');
  process.exit(0);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Strip node + script path from argv
  const args = process.argv.slice(2);

  if (hasFlag(args, '--help') || hasFlag(args, '-h')) {
    printUsage();
    process.exit(0);
  }

  if (hasFlag(args, '--dry-run')) {
    const configPath = getFlag(args, '--config') ?? DEFAULT_PROJECT_CONFIG_NAME;
    await runDryRun(configPath);
    return;
  }

  const pos = positionals(args);
  const command = pos[0];

  // ── Init mode ────────────────────────────────────────────────────────────────
  if (command === 'init') {
    const surfaceArg = pos[1] as 'sdk' | 'cli' | 'mcp' | undefined;
    if (surfaceArg && !['sdk', 'cli', 'mcp'].includes(surfaceArg)) {
      console.error(`ERROR: Unknown surface '${surfaceArg}'. Must be: sdk | cli | mcp`);
      process.exit(1);
    }
    const answersFlag = getFlag(args, '--answers');
    const useDefaults = hasFlag(args, '--yes');
    const useAuto = hasFlag(args, '--auto');

    if (useAuto) {
      let detected;
      try {
        detected = detectProject(process.cwd());
      } catch (err) {
        fatalError(err);
      }
      printDetectionSummary(detected);
      if (surfaceArg && surfaceArg !== detected.surface) {
        console.log(`Note: explicit surface '${surfaceArg}' overridden by auto-detected '${detected.surface}'.`);
      }
      if (useDefaults) {
        if (detected.confidence !== 'high') {
          printError(new SkillOptimizerError(ERRORS.E_INIT_AUTO_LOW_CONFIDENCE,
            `detected confidence is ${detected.confidence}`));
          process.exit(1);
        }
        const answers: WizardAnswers = {
          ...buildDefaultAnswers(detected.surface, detected.repoPath),
          ...detectedToPreseed(detected),
        };
        await scaffoldInit(answers, process.cwd());
      } else {
        await runWizard(process.cwd(), detectedToPreseed(detected));
      }
      process.exit(0);
    }

    if (answersFlag) {
      const answers = readAnswersFile(resolve(process.cwd(), answersFlag));
      await scaffoldInit(answers, process.cwd());
    } else if (useDefaults) {
      const answers = buildDefaultAnswers(surfaceArg ?? 'sdk', process.cwd());
      await scaffoldInit(answers, process.cwd());
    } else {
      await runWizard(process.cwd(), surfaceArg ? { surface: surfaceArg } : undefined);
    }
    process.exit(0);
  }

  // ── Import-commands mode ─────────────────────────────────────────────────────
  if (command === 'import-commands') {
    const fromFlag = getFlag(args, '--from');
    if (!fromFlag) {
      console.error('ERROR: --from <path> is required for import-commands.');
      console.error('  Example: skill-optimizer import-commands --from ./src/cli.ts');
      process.exit(1);
    }
    const outFlag = getFlag(args, '--out') ?? 'skill-optimizer/.skill-optimizer/cli-commands.json';
    const depthRaw = getFlag(args, '--depth');
    try {
      await importCommands({
        from: fromFlag,
        out: outFlag,
        scrape: hasFlag(args, '--scrape'),
        depth: depthRaw ? parseInt(depthRaw, 10) : 2,
        cwd: process.cwd(),
      });
    } catch (err) {
      console.error(`\n  ERROR: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
    process.exit(0);
  }

  // ── Doctor mode ──────────────────────────────────────────────────────────────
  if (command === 'doctor') {
    const configPath = getFlag(args, '--config') ?? DEFAULT_PROJECT_CONFIG_NAME;
    const exitCode = await runDoctor(configPath, {
      staticOnly: hasFlag(args, '--static'),
      checkModels: hasFlag(args, '--check-models'),
      fix: hasFlag(args, '--fix'),
    });
    process.exit(exitCode);
  }

  // ── Compare mode ────────────────────────────────────────────────────────────
  if (command === 'compare') {
    const baselinePath = getFlag(args, '--baseline');
    const currentPath = getFlag(args, '--current');

    if (!baselinePath) {
      console.error('ERROR: --baseline <path> is required for compare mode.');
      console.error('  Example: skill-optimizer compare --baseline results/old/report.json --current results/report.json');
      process.exit(1);
    }
    if (!currentPath) {
      console.error('ERROR: --current <path> is required for compare mode.');
      console.error('  Example: skill-optimizer compare --baseline results/old/report.json --current results/report.json');
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

  // ── Optimize mode ──────────────────────────────────────────────────────────
  if (command === 'optimize') {
    const configPath = getFlag(args, '--config');
    try {
      const { result, resolvedManifest, ledgerPath } = await runOptimizeFromConfig(configPath ?? DEFAULT_PROJECT_CONFIG_NAME, {
        maxIterationsRaw: getFlag(args, '--max-iterations'),
        skipGeneration: hasFlag(args, '--skip-generation'),
      });
      printOptimizeSummary(result, resolvedManifest, ledgerPath);
      // Show verdict and recommendations for best report
      const bestReport = result.bestReport;
      if (bestReport.verdict) {
        let recs: Recommendation[] = [];
        if (bestReport.verdict.result === 'FAIL') {
          try {
            const mutation = resolvedManifest.mutation;
            if (mutation) {
              const criticDeps = createDefaultPiCritic({
                provider: mutation.provider,
                model: mutation.model,
                apiKeyEnv: mutation.apiKeyEnv,
              });
              recs = await generateRecommendations(
                bestReport,
                criticDeps,
                mutation.reportContextMaxBytes ?? 16_000,
              );
            }
          } catch (err) {
            console.error(`WARNING: Could not generate recommendations: ${err instanceof Error ? err.message : err}`);
          }
        }
        console.log(renderVerdictConsole(bestReport, recs));
      }
      process.exit(bestReport.verdict?.result === 'FAIL' ? 1 : 0);
    } catch (err) {
      fatalError(err);
    }
  }

  // ── Generate-tasks mode ───────────────────────────────────────────────────
  if (command === 'generate-tasks') {
    const configPath = getFlag(args, '--config') ?? DEFAULT_PROJECT_CONFIG_NAME;
    try {
      const project = await loadProjectConfig(configPath);
      if (!project.benchmark.taskGeneration.enabled) {
        throw new Error('benchmark.taskGeneration.enabled must be true to use generate-tasks');
      }
      const modelRef = project.optimize?.model ?? project.benchmark.models[0]!.id;
      const { provider, model } = parseModelRef(modelRef);
      const deps = createDefaultPiTaskGenerator({
        provider,
        model,
        apiKeyEnv: project.optimize?.apiKeyEnv ?? project.benchmark.apiKeyEnv,
      });
      const result = await generateTasksForProject({
        configPath,
        maxTasks: project.benchmark.taskGeneration.maxTasks,
        seed: project.benchmark.taskGeneration.seed,
        outputDir: project.benchmark.taskGeneration.outputDir,
        deps,
      });
      console.log('');
      console.log(`Generated tasks: ${result.kept.length} (rejected: ${result.rejected.length})`);
      console.log(`Frozen config: ${result.artifacts.benchmarkPath}`);
      console.log(`Frozen snapshot: ${result.artifacts.snapshotPath}`);
      console.log(`Generated tasks file: ${result.artifacts.tasksPath}`);
    } catch (err) {
      console.error(`\nFATAL: Task generation failed: ${err instanceof Error ? err.message : err}`);
      if (err instanceof Error && err.stack) {
        console.error(err.stack);
      }
      process.exit(1);
    }
    process.exit(0);
  }

  if (command && command !== 'run' && command !== 'benchmark') {
    console.error(`ERROR: Unknown command '${command}'.`);
    printUsage();
    process.exit(1);
  }

  // ── Benchmark mode (default, also handles explicit 'run' command) ─────────────
  const tierRaw = getFlag(args, '--tier');
  const validTiers: Tier[] = ['flagship', 'mid', 'low'];
  if (tierRaw && !validTiers.includes(tierRaw as Tier)) {
    console.error(`ERROR: Invalid tier '${tierRaw}'. Must be one of: ${validTiers.join(', ')}`);
    process.exit(1);
  }

  let options = {
    configPath: getFlag(args, '--config'),
    tier: tierRaw as Tier | undefined,
    taskId: getFlag(args, '--task'),
    modelSlug: getFlag(args, '--model'),
    noCache: hasFlag(args, '--no-cache'),
  };

  let project: ResolvedProjectConfig | undefined;
  let generatedCoverage: import('./benchmark/types.js').CoverageReport | undefined;
  try {
    project = await loadProjectConfig(options.configPath ?? DEFAULT_PROJECT_CONFIG_NAME);
    if (!existsSync(project.target.repoPath) || !statSync(project.target.repoPath).isDirectory()) {
      throw new Error(
        `target.repoPath does not exist or is not a directory: ${project.target.repoPath}. ` +
          `Edit "target.repoPath" in ${project.configPath}.`,
      );
    }
    if (project.benchmark.format !== 'anthropic' && !process.env[project.benchmark.apiKeyEnv ?? 'OPENROUTER_API_KEY']) {
      throw new Error(
        `Missing ${project.benchmark.apiKeyEnv ?? 'OPENROUTER_API_KEY'} environment variable. ` +
          `Set it in your shell or in a .env file alongside ${project.configPath}.`,
      );
    }
    if (project.benchmark.taskGeneration.enabled) {
      const modelRef = project.optimize?.model ?? project.benchmark.models[0]!.id;
      const { provider, model } = parseModelRef(modelRef);
      const deps = createDefaultPiTaskGenerator({
        provider,
        model,
        apiKeyEnv: project.optimize?.apiKeyEnv ?? project.benchmark.apiKeyEnv,
      });
      const generation = await generateTasksForProject({
        configPath: options.configPath ?? DEFAULT_PROJECT_CONFIG_NAME,
        maxTasks: project.benchmark.taskGeneration.maxTasks,
        seed: project.benchmark.taskGeneration.seed,
        outputDir: project.benchmark.taskGeneration.outputDir,
        deps,
      });
      options = {
        ...options,
        configPath: generation.artifacts.benchmarkPath,
      };
      generatedCoverage = generation.coverage;
    }
  } catch (err) {
    fatalError(err);
  }

  let report;
  try {
    report = await runBenchmark({
      ...options,
      verdictPolicy: project?.benchmark.verdict,
      scopeCoverage: generatedCoverage,
    });
  } catch (err) {
    fatalError(err);
  }

  // Print console summary
  printSummary(report);

  // Print coverage
  printCoverage(report.coverage);

  // Determine output dir — resolve relative to the config file's directory (matching the runner)
  const configFileDir = options.configPath ? dirname(resolve(options.configPath)) : process.cwd();
  const reportConfig = report.config as { name: string; surface: string; outputDir?: string };
  const outputDir = resolve(configFileDir, reportConfig?.outputDir ?? 'benchmark-results');

  // Generate recommendations if verdict is FAIL
  let recommendations: Recommendation[] = [];
  if (report.verdict?.result === 'FAIL' && project) {
    try {
      const modelRef = project.optimize?.model ?? project.benchmark.models[0]!.id;
      const { provider, model } = parseModelRef(modelRef);
      const criticDeps = createDefaultPiCritic({
        provider,
        model,
        apiKeyEnv: project.optimize?.apiKeyEnv ?? project.benchmark.apiKeyEnv,
      });
      recommendations = await generateRecommendations(
        report,
        criticDeps,
        project.optimize?.reportContextMaxBytes ?? 16_000,
      );
    } catch (err) {
      console.error(`WARNING: Could not generate recommendations: ${err instanceof Error ? err.message : err}`);
    }
  }

  // Print verdict
  console.log(renderVerdictConsole(report, recommendations));

  // Generate and save Markdown report alongside JSON
  const mdPath = resolve(outputDir, 'report.md');
  try {
    const markdown = generateMarkdown(report) + '\n\n' + renderVerdictMarkdown(report, recommendations);
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
      `Coverage: ${(summary.methodCoveragePercent * 100).toFixed(1)}% ` +
      `(surface: ${reportConfig.surface}).`,
  );

  process.exit(report.verdict?.result === 'FAIL' ? 1 : 0);
}

function isExecutedDirectly(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(entry)).href;
  } catch {
    return false;
  }
}

if (isExecutedDirectly()) {
  main().catch(err => {
    console.error('Unhandled error:', err);
    process.exit(1);
  });
}

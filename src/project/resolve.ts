import { dirname, resolve } from 'node:path';

import type { ProjectConfig, ResolvedProjectConfig } from './types.js';

const DEFAULT_BENCHMARK_FORMAT = 'pi';
const DEFAULT_TIMEOUT = 240_000;
const DEFAULT_OUTPUT_DIR = 'benchmark-results';
const DEFAULT_GENERATION_OUTPUT_DIR = '.skill-optimizer';
const DEFAULT_MAX_TASKS = 10;
const DEFAULT_TASK_SEED = 1;
const DEFAULT_OPTIMIZE_ITERATIONS = 5;
const DEFAULT_STABILITY_WINDOW = 2;
const DEFAULT_MIN_IMPROVEMENT = 0.02;
const DEFAULT_PER_MODEL_FLOOR = 0.6;
const DEFAULT_TARGET_WEIGHTED_AVERAGE = 0.7;
const DEFAULT_REPORT_CONTEXT_MAX_BYTES = 16_000;

export function resolveProjectConfig(config: ProjectConfig, configPath: string): ResolvedProjectConfig {
  const configDir = dirname(configPath);
  const skill = config.target.skill
    ? typeof config.target.skill === 'string'
      ? { source: resolve(configDir, config.target.skill), cache: true }
      : {
          ...config.target.skill,
          source: resolve(configDir, config.target.skill.source),
          cache: config.target.skill.cache ?? true,
        }
    : undefined;
  const discovery = config.target.discovery
    ? {
        mode: config.target.discovery.mode ?? 'auto',
        sources: (config.target.discovery.sources ?? []).map((source) => resolve(configDir, source)),
        fallbackManifest: config.target.discovery.fallbackManifest
          ? resolve(configDir, config.target.discovery.fallbackManifest)
          : undefined,
        language: config.target.discovery.language,
      }
    : undefined;

  const sdkConfig = config.target.sdk
    ? {
        language: config.target.sdk.language ?? discovery?.language,
        style: config.target.sdk.style,
        apiSurface: config.target.sdk.apiSurface,
        entrypoints: (config.target.sdk.entrypoints ?? []).map((entrypoint) => resolve(configDir, entrypoint)),
      }
    : discovery?.language
      ? {
          language: discovery.language,
          style: undefined,
          apiSurface: undefined,
          entrypoints: [],
        }
      : undefined;

  const cliConfig = config.target.cli
    ? {
        ...config.target.cli,
        commands: resolve(configDir, config.target.cli.commands),
      }
    : config.target.surface === 'cli' && discovery?.fallbackManifest
      ? {
          commands: discovery.fallbackManifest,
        }
      : undefined;

  const mcpConfig = config.target.mcp
    ? {
        ...config.target.mcp,
        tools: resolve(configDir, config.target.mcp.tools),
      }
    : config.target.surface === 'mcp' && discovery?.fallbackManifest
      ? {
          tools: discovery.fallbackManifest,
        }
      : undefined;

  return {
    configPath,
    configDir,
    name: config.name,
    target: {
      surface: config.target.surface,
      repoPath: resolve(configDir, config.target.repoPath ?? '.'),
      skill,
      discovery,
      sdk: sdkConfig,
      cli: cliConfig,
      mcp: mcpConfig,
    },
    benchmark: {
      format: config.benchmark.format ?? DEFAULT_BENCHMARK_FORMAT,
      baseUrl: config.benchmark.baseUrl,
      apiKeyEnv: config.benchmark.apiKeyEnv,
      timeout: config.benchmark.timeout ?? DEFAULT_TIMEOUT,
      headers: config.benchmark.headers,
      models: config.benchmark.models,
      tasks: config.benchmark.tasks ? resolve(configDir, config.benchmark.tasks) : undefined,
      surfaceSnapshot: config.benchmark.surfaceSnapshot ? resolve(configDir, config.benchmark.surfaceSnapshot) : undefined,
      taskGeneration: {
        enabled: config.benchmark.taskGeneration?.enabled ?? false,
        maxTasks: config.benchmark.taskGeneration?.maxTasks ?? DEFAULT_MAX_TASKS,
        seed: config.benchmark.taskGeneration?.seed ?? DEFAULT_TASK_SEED,
        outputDir: resolve(configDir, config.benchmark.taskGeneration?.outputDir ?? DEFAULT_GENERATION_OUTPUT_DIR),
      },
      output: {
        dir: resolve(configDir, config.benchmark.output?.dir ?? DEFAULT_OUTPUT_DIR),
      },
      agentic: config.benchmark.agentic,
      verdict: {
        perModelFloor: config.benchmark.verdict?.perModelFloor ?? DEFAULT_PER_MODEL_FLOOR,
        targetWeightedAverage: config.benchmark.verdict?.targetWeightedAverage ?? DEFAULT_TARGET_WEIGHTED_AVERAGE,
      },
    },
    optimize: config.optimize
      ? {
          enabled: config.optimize.enabled ?? true,
          mode: config.optimize.mode ?? 'stable-surface',
          model: config.optimize.model ?? config.benchmark.models[0]!.id,
          apiKeyEnv: config.optimize.apiKeyEnv ?? config.benchmark.apiKeyEnv,
          thinkingLevel: config.optimize.thinkingLevel ?? 'medium',
          allowedPaths: [...(config.optimize.allowedPaths ?? [])],
          validation: [...(config.optimize.validation ?? [])],
          requireCleanGit: config.optimize.requireCleanGit ?? true,
          maxIterations: config.optimize.maxIterations ?? DEFAULT_OPTIMIZE_ITERATIONS,
          stabilityWindow: config.optimize.stabilityWindow ?? DEFAULT_STABILITY_WINDOW,
          minImprovement: config.optimize.minImprovement ?? DEFAULT_MIN_IMPROVEMENT,
          reportContextMaxBytes: config.optimize.reportContextMaxBytes ?? DEFAULT_REPORT_CONTEXT_MAX_BYTES,
        }
      : undefined,
  };
}

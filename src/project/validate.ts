import type { ProjectConfig } from './types.js';
import { isSdkLanguage } from './types.js';

export function validateProjectConfig(config: ProjectConfig, configPath: string): void {
  if (!config.name || typeof config.name !== 'string') {
    throw new Error(`Project config ${configPath}: "name" is required`);
  }

  if (!config.target || typeof config.target !== 'object') {
    throw new Error(`Project config ${configPath}: "target" is required`);
  }

  const { target, benchmark, optimize } = config;

  if (target.surface !== 'sdk' && target.surface !== 'cli' && target.surface !== 'mcp') {
    throw new Error(`Project config ${configPath}: "target.surface" must be sdk, cli, or mcp`);
  }

  if (target.skill !== undefined) {
    const skillSource = typeof target.skill === 'string' ? target.skill : target.skill?.source;
    if (!skillSource || typeof skillSource !== 'string') {
      throw new Error(`Project config ${configPath}: "target.skill" must be a path string or { source } object`);
    }
  }

  if (benchmark?.taskGeneration?.enabled === true && target.skill === undefined) {
    throw new Error(`Project config ${configPath}: "target.skill" is required when benchmark.taskGeneration.enabled=true`);
  }

  if (target.surface === 'sdk') {
    const sdkLanguage = target.sdk?.language ?? target.discovery?.language;
    if (!sdkLanguage || !isSdkLanguage(sdkLanguage)) {
      throw new Error(`Project config ${configPath}: "target.sdk.language" must be typescript, python, or rust`);
    }
    const hasCodeSources = Array.isArray(target.discovery?.sources) && target.discovery.sources.length > 0;
    const hasApiSurface = Array.isArray(target.sdk?.apiSurface) && target.sdk.apiSurface.length > 0;
    if (!hasCodeSources && !hasApiSurface) {
      throw new Error(`Project config ${configPath}: SDK targets need discovery.sources or target.sdk.apiSurface`);
    }
  }

  if (target.surface === 'cli') {
    const discoveryMode = target.discovery?.mode ?? 'auto';
    const hasCodeSources = Array.isArray(target.discovery?.sources) && target.discovery.sources.length > 0;
    const hasManifest = Boolean(target.cli?.commands || target.discovery?.fallbackManifest);
    if (discoveryMode === 'manifest' && !hasManifest) {
      throw new Error(`Project config ${configPath}: CLI manifest mode requires target.cli.commands or target.discovery.fallbackManifest`);
    }
    if (!hasManifest && !hasCodeSources) {
      throw new Error(`Project config ${configPath}: CLI targets need discovery.sources, target.cli.commands, or target.discovery.fallbackManifest`);
    }
  }

  if (target.surface === 'mcp') {
    const discoveryMode = target.discovery?.mode ?? 'auto';
    const hasCodeSources = Array.isArray(target.discovery?.sources) && target.discovery!.sources.length > 0;
    const hasManifest = Boolean(target.mcp?.tools || target.discovery?.fallbackManifest);
    if (discoveryMode === 'manifest' && !hasManifest) {
      throw new Error(`Project config ${configPath}: MCP manifest mode requires target.mcp.tools or target.discovery.fallbackManifest`);
    }
    if (!hasManifest && !hasCodeSources) {
      throw new Error(`Project config ${configPath}: MCP targets need discovery.sources, target.mcp.tools, or target.discovery.fallbackManifest`);
    }
  }

  if (target.discovery) {
    if (target.discovery.mode && target.discovery.mode !== 'auto' && target.discovery.mode !== 'manifest') {
      throw new Error(`Project config ${configPath}: "target.discovery.mode" must be auto or manifest`);
    }
    if (target.discovery.sources !== undefined && !Array.isArray(target.discovery.sources)) {
      throw new Error(`Project config ${configPath}: "target.discovery.sources" must be an array when present`);
    }
    if (target.discovery.language !== undefined && !isSdkLanguage(target.discovery.language)) {
      throw new Error(`Project config ${configPath}: "target.discovery.language" must be typescript, python, or rust when present`);
    }
  }

  if (!benchmark || typeof benchmark !== 'object') {
    throw new Error(`Project config ${configPath}: "benchmark" is required`);
  }

  if (!Array.isArray(benchmark.models) || benchmark.models.length === 0) {
    throw new Error(`Project config ${configPath}: "benchmark.models" must be a non-empty array`);
  }

  for (const model of benchmark.models) {
    if (!model.id || !model.name || !model.tier) {
      throw new Error(`Project config ${configPath}: each benchmark model needs id, name, and tier`);
    }
  }

  if (benchmark.verdict !== undefined) {
    if (benchmark.verdict.perModelFloor !== undefined) {
      const v = benchmark.verdict.perModelFloor;
      if (!Number.isFinite(v) || v < 0 || v > 1) {
        throw new Error(`Project config ${configPath}: "benchmark.verdict.perModelFloor" must be between 0 and 1`);
      }
    }
    if (benchmark.verdict.targetWeightedAverage !== undefined) {
      const v = benchmark.verdict.targetWeightedAverage;
      if (!Number.isFinite(v) || v < 0 || v > 1) {
        throw new Error(`Project config ${configPath}: "benchmark.verdict.targetWeightedAverage" must be between 0 and 1`);
      }
    }
  }

  for (const model of benchmark.models) {
    if (model.weight !== undefined && (!Number.isFinite(model.weight) || model.weight < 0)) {
      throw new Error(`Project config ${configPath}: model "${model.id}" has invalid weight; must be a non-negative number`);
    }
  }

  if (benchmark.format && benchmark.format !== 'pi' && benchmark.format !== 'openai' && benchmark.format !== 'anthropic') {
    throw new Error(`Project config ${configPath}: "benchmark.format" must be pi, openai, or anthropic`);
  }

  if (!benchmark.taskGeneration?.enabled && !benchmark.tasks) {
    throw new Error(`Project config ${configPath}: "benchmark.tasks" is required when task generation is disabled`);
  }

  if (benchmark.taskGeneration?.maxTasks !== undefined && (!Number.isInteger(benchmark.taskGeneration.maxTasks) || benchmark.taskGeneration.maxTasks <= 0)) {
    throw new Error(`Project config ${configPath}: "benchmark.taskGeneration.maxTasks" must be a positive integer`);
  }

  if (benchmark.taskGeneration?.seed !== undefined && (!Number.isInteger(benchmark.taskGeneration.seed) || benchmark.taskGeneration.seed < 0)) {
    throw new Error(`Project config ${configPath}: "benchmark.taskGeneration.seed" must be a non-negative integer`);
  }

  if (optimize) {
    if (optimize.mode !== undefined && optimize.mode !== 'stable-surface' && optimize.mode !== 'surface-changing') {
      throw new Error(`Project config ${configPath}: "optimize.mode" must be stable-surface or surface-changing`);
    }
    if (optimize.mode === 'surface-changing' && benchmark.taskGeneration?.enabled !== true) {
      throw new Error(`Project config ${configPath}: surface-changing optimization requires benchmark.taskGeneration.enabled=true`);
    }
    if (optimize.enabled !== false) {
      if (!Array.isArray(optimize.allowedPaths) || optimize.allowedPaths.length === 0) {
        throw new Error(`Project config ${configPath}: "optimize.allowedPaths" must be a non-empty array when optimization is enabled`);
      }
    }

    if (optimize.maxIterations !== undefined && (!Number.isInteger(optimize.maxIterations) || optimize.maxIterations <= 0)) {
      throw new Error(`Project config ${configPath}: "optimize.maxIterations" must be a positive integer`);
    }

    if (optimize.stabilityWindow !== undefined && (!Number.isInteger(optimize.stabilityWindow) || optimize.stabilityWindow <= 0)) {
      throw new Error(`Project config ${configPath}: "optimize.stabilityWindow" must be a positive integer`);
    }

    if (optimize.minImprovement !== undefined && (!Number.isFinite(optimize.minImprovement) || optimize.minImprovement < 0)) {
      throw new Error(`Project config ${configPath}: "optimize.minImprovement" must be a non-negative number`);
    }

    if (optimize.reportContextMaxBytes !== undefined && (!Number.isInteger(optimize.reportContextMaxBytes) || optimize.reportContextMaxBytes <= 0)) {
      throw new Error(`Project config ${configPath}: "optimize.reportContextMaxBytes" must be a positive integer`);
    }

    if (optimize.requireCleanGit === false) {
      throw new Error(`Project config ${configPath}: "optimize.requireCleanGit" must remain true in v1`);
    }
  }
}

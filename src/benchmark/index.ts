// Public API
export { runBenchmark, type RunnerOptions } from './runner.js';
export { loadConfig, loadTasks, loadMcpTools, loadCliCommands } from './config.js';
export { createLLMClient } from './llm/index.js';
export { extract } from './extractors/index.js';
export { evaluateTask } from './evaluator.js';
export { computeCoverage } from './coverage.js';
export { loadReport, compareReports } from './compare.js';
export { generateMarkdown, printSummary } from './reporter.js';
export { fetchSkill } from './skill-fetcher.js';
export { initBenchmark } from './init.js';
export { extractSdkFromCode, getSdkAdapter } from './extractors/sdk/registry.js';

// Re-export key types
export type {
  BenchmarkSurface,
  SdkLanguage,
  BenchmarkConfig,
  SdkSurfaceConfig,
  CliSurfaceConfig,
  CliCommandDefinition,
  CliCommandOptionDefinition,
  McpSurfaceConfig,
  LLMConfig,
  TaskDefinition, ExpectedAction, ExtractedCall, ActionMatch,
  TaskResult, BenchmarkReport, ComparisonReport,
  ModelConfig, Tier, LLMResponse, ToolCallResult,
} from './types.js';

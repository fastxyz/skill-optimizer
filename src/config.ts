import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import type { BenchmarkConfig, TaskDefinition, McpToolDefinition, ModelConfig } from './types.js';

const DEFAULT_CONFIG_NAME = 'benchmark.config.json';

/**
 * Load benchmark config from the given path or search for benchmark.config.json
 * in the current working directory.
 */
export function loadConfig(configPath?: string): { config: BenchmarkConfig; configDir: string } {
  const resolvedPath = configPath
    ? resolve(configPath)
    : resolve(process.cwd(), DEFAULT_CONFIG_NAME);

  if (!existsSync(resolvedPath)) {
    throw new Error(
      `Config file not found: ${resolvedPath}\n` +
      `Run 'skill-benchmark init' to create one, or specify --config <path>.`
    );
  }

  let raw: string;
  try {
    raw = readFileSync(resolvedPath, 'utf-8');
  } catch (err) {
    throw new Error(`Failed to read config: ${resolvedPath}: ${err instanceof Error ? err.message : err}`);
  }

  let config: BenchmarkConfig;
  try {
    config = JSON.parse(raw) as BenchmarkConfig;
  } catch (err) {
    throw new Error(`Invalid JSON in config: ${resolvedPath}: ${err instanceof Error ? err.message : err}`);
  }

  validateConfig(config, resolvedPath);
  return { config, configDir: dirname(resolvedPath) };
}

/**
 * Validate required config fields.
 */
function validateConfig(config: BenchmarkConfig, path: string): void {
  if (!config.name) throw new Error(`Config ${path}: "name" is required`);
  if (!config.mode) throw new Error(`Config ${path}: "mode" is required (must be "code" or "mcp")`);
  if (config.mode !== 'code' && config.mode !== 'mcp') {
    throw new Error(`Config ${path}: "mode" must be "code" or "mcp", got "${config.mode}"`);
  }

  if (config.mode === 'code') {
    if (!config.code) throw new Error(`Config ${path}: "code" section is required when mode is "code"`);
    if (!config.code.language) {
      throw new Error(`Config ${path}: "code.language" is required (e.g. "typescript")`);
    }
  }

  if (config.mode === 'mcp') {
    if (!config.mcp) throw new Error(`Config ${path}: "mcp" section is required when mode is "mcp"`);
    if (!config.mcp.tools) throw new Error(`Config ${path}: "mcp.tools" path is required`);
  }

  if (!config.tasks) throw new Error(`Config ${path}: "tasks" path is required`);

  if (!config.llm) throw new Error(`Config ${path}: "llm" section is required`);
  if (!config.llm.baseUrl) throw new Error(`Config ${path}: "llm.baseUrl" is required`);
  if (!config.llm.format) throw new Error(`Config ${path}: "llm.format" is required ("openai" or "anthropic")`);
  if (config.llm.format !== 'openai' && config.llm.format !== 'anthropic') {
    throw new Error(`Config ${path}: "llm.format" must be "openai" or "anthropic", got "${config.llm.format}"`);
  }
  if (!config.llm.models || !Array.isArray(config.llm.models) || config.llm.models.length === 0) {
    throw new Error(`Config ${path}: "llm.models" must be a non-empty array`);
  }

  for (const model of config.llm.models) {
    if (!model.id) throw new Error(`Config ${path}: each model must have an "id"`);
    if (!model.name) throw new Error(`Config ${path}: each model must have a "name"`);
    if (!model.tier) throw new Error(`Config ${path}: each model must have a "tier" (flagship, mid, low)`);
  }
}

/**
 * Load task definitions from the tasks.json path specified in config.
 * Resolves the path relative to the config file's directory or CWD.
 */
export function loadTasks(tasksPath: string, baseDir?: string): TaskDefinition[] {
  const resolved = resolve(baseDir ?? process.cwd(), tasksPath);
  if (!existsSync(resolved)) {
    throw new Error(`Tasks file not found: ${resolved}`);
  }

  let raw: string;
  try {
    raw = readFileSync(resolved, 'utf-8');
  } catch (err) {
    throw new Error(`Failed to read tasks: ${resolved}: ${err instanceof Error ? err.message : err}`);
  }

  let parsed: { tasks: TaskDefinition[] };
  try {
    parsed = JSON.parse(raw) as { tasks: TaskDefinition[] };
  } catch (err) {
    throw new Error(`Invalid JSON in tasks file: ${resolved}: ${err instanceof Error ? err.message : err}`);
  }

  if (!parsed.tasks || !Array.isArray(parsed.tasks)) {
    throw new Error(`Tasks file ${resolved}: must have a "tasks" array at the root`);
  }

  return parsed.tasks;
}

/**
 * Load MCP tool definitions from the tools.json path specified in config.
 */
export function loadMcpTools(toolsPath: string, baseDir?: string): McpToolDefinition[] {
  const resolved = resolve(baseDir ?? process.cwd(), toolsPath);
  if (!existsSync(resolved)) {
    throw new Error(`MCP tools file not found: ${resolved}`);
  }

  let raw: string;
  try {
    raw = readFileSync(resolved, 'utf-8');
  } catch (err) {
    throw new Error(`Failed to read MCP tools: ${resolved}: ${err instanceof Error ? err.message : err}`);
  }

  let tools: McpToolDefinition[];
  try {
    tools = JSON.parse(raw) as McpToolDefinition[];
  } catch (err) {
    throw new Error(`Invalid JSON in MCP tools file: ${resolved}: ${err instanceof Error ? err.message : err}`);
  }

  if (!Array.isArray(tools)) {
    throw new Error(`MCP tools file ${resolved}: must be a JSON array of tool definitions`);
  }

  return tools;
}

/**
 * Helper to get a model by slug (lowercased name with non-alphanumeric replaced by hyphens).
 */
export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function getModelBySlug(config: BenchmarkConfig, slug: string): ModelConfig | undefined {
  return config.llm.models.find(m => slugify(m.name) === slug || m.id === slug);
}

export function getModelsByTier(config: BenchmarkConfig, tier: string): ModelConfig[] {
  return config.llm.models.filter(m => m.tier === tier);
}

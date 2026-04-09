import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import type {
  BenchmarkConfig,
  TaskDefinition,
  McpToolDefinition,
  CliCommandDefinition,
  ModelConfig,
} from './types.js';

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
  if (!config.surface) {
    throw new Error(`Config ${path}: "surface" is required (must be "sdk", "cli", or "mcp")`);
  }

  if (config.surface !== 'sdk' && config.surface !== 'cli' && config.surface !== 'mcp') {
    throw new Error(
      `Config ${path}: "surface" must be "sdk", "cli", or "mcp", got "${config.surface}"`
    );
  }

  if (config.surface === 'sdk') {
    if (!config.sdk) throw new Error(`Config ${path}: "sdk" section is required when surface is "sdk"`);
    if (!config.sdk.language) {
      throw new Error(`Config ${path}: "sdk.language" is required (e.g. "typescript")`);
    }
  }

  if (config.surface === 'cli') {
    if (!config.cli) throw new Error(`Config ${path}: "cli" section is required when surface is "cli"`);
    if (!config.cli.commands) {
      throw new Error(`Config ${path}: "cli.commands" path is required`);
    }
  }

  if (config.surface === 'mcp') {
    if (!config.mcp) throw new Error(`Config ${path}: "mcp" section is required when surface is "mcp"`);
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
 * Load CLI command definitions from the commands.json path specified in config.
 */
export function loadCliCommands(commandsPath: string, baseDir?: string): CliCommandDefinition[] {
  const resolved = resolve(baseDir ?? process.cwd(), commandsPath);
  if (!existsSync(resolved)) {
    throw new Error(`CLI commands file not found: ${resolved}`);
  }

  let raw: string;
  try {
    raw = readFileSync(resolved, 'utf-8');
  } catch (err) {
    throw new Error(`Failed to read CLI commands: ${resolved}: ${err instanceof Error ? err.message : err}`);
  }

  let commands: CliCommandDefinition[];
  try {
    commands = JSON.parse(raw) as CliCommandDefinition[];
  } catch (err) {
    throw new Error(`Invalid JSON in CLI commands file: ${resolved}: ${err instanceof Error ? err.message : err}`);
  }

  if (!Array.isArray(commands)) {
    throw new Error(`CLI commands file ${resolved}: must be a JSON array of command definitions`);
  }

  for (const [index, command] of commands.entries()) {
    if (!command || typeof command !== 'object') {
      throw new Error(`CLI commands file ${resolved}: entry ${index} must be an object`);
    }
    if (typeof command.command !== 'string' || command.command.trim() === '') {
      throw new Error(`CLI commands file ${resolved}: entry ${index} must include a non-empty "command" string`);
    }
    if (command.options !== undefined && !Array.isArray(command.options)) {
      throw new Error(`CLI commands file ${resolved}: entry ${index} options must be an array when present`);
    }
    if (Array.isArray(command.options)) {
      for (const [optionIndex, option] of command.options.entries()) {
        if (!option || typeof option !== 'object' || typeof option.name !== 'string' || option.name.trim() === '') {
          throw new Error(`CLI commands file ${resolved}: entry ${index} option ${optionIndex} must include a non-empty "name" string`);
        }
      }
    }
  }

  return commands;
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

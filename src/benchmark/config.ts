import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  BenchmarkConfig,
  TaskDefinition,
  McpToolDefinition,
  CliCommandDefinition,
  ModelConfig,
  ExpectedAction,
} from './types.js';
import { DEFAULT_PROJECT_CONFIG_NAME, loadProjectConfig, toBenchmarkConfig } from '../project/index.js';

const DEFAULT_CONFIG_NAME = DEFAULT_PROJECT_CONFIG_NAME;
const SAFE_TASK_ID = /^[A-Za-z0-9._-]+$/;

function isSafeTaskId(taskId: string): boolean {
  return SAFE_TASK_ID.test(taskId) && taskId !== '.' && taskId !== '..';
}

/**
 * Load benchmark config from the given path or search for benchmark.config.json
 * in the current working directory.
 */
export function loadConfig(configPath?: string): { config: BenchmarkConfig; configDir: string } {
  const project = loadProjectConfig(configPath ?? DEFAULT_CONFIG_NAME);
  return {
    config: toBenchmarkConfig(project),
    configDir: project.configDir,
  };
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

  let parsed: { tasks: Array<TaskDefinition & { expected_tools?: unknown; expected_actions?: unknown }> };
  try {
    parsed = JSON.parse(raw) as { tasks: TaskDefinition[] };
  } catch (err) {
    throw new Error(`Invalid JSON in tasks file: ${resolved}: ${err instanceof Error ? err.message : err}`);
  }

  if (!parsed.tasks || !Array.isArray(parsed.tasks)) {
    throw new Error(`Tasks file ${resolved}: must have a "tasks" array at the root`);
  }

  return parsed.tasks.map((task, index) => normalizeTaskDefinition(task, resolved, index));
}

function normalizeTaskDefinition(
  task: TaskDefinition & { expected_tools?: unknown; expected_actions?: unknown },
  resolvedPath: string,
  index: number,
): TaskDefinition {
  if (typeof task.id !== 'string' || task.id.trim() === '') {
    throw new Error(`Tasks file ${resolvedPath}: task at index ${index} must include a non-empty string id`);
  }
  if (!isSafeTaskId(task.id)) {
    throw new Error(`Tasks file ${resolvedPath}: task id "${task.id}" must match ${SAFE_TASK_ID.toString()} and cannot be . or ..`);
  }
  if (typeof task.prompt !== 'string' || task.prompt.trim() === '') {
    throw new Error(`Tasks file ${resolvedPath}: task ${task.id} must include a non-empty string prompt`);
  }

  const rawExpectedActions = Array.isArray(task.expected_actions)
    ? task.expected_actions
    : Array.isArray(task.expected_tools)
      ? task.expected_tools
      : null;

  if (!rawExpectedActions) {
    throw new Error(`Tasks file ${resolvedPath}: task at index ${index} must include an expected_actions array`);
  }

  const expected_actions = rawExpectedActions.map((rawAction, actionIndex) => normalizeExpectedAction(rawAction, resolvedPath, index, actionIndex));

  return {
    id: task.id,
    prompt: task.prompt,
    expected_actions,
    expected_tools: expected_actions,
    verify: task.verify,
    expected_fetches: task.expected_fetches,
  };
}

function normalizeExpectedAction(
  rawAction: unknown,
  resolvedPath: string,
  taskIndex: number,
  actionIndex: number,
): ExpectedAction {
  if (!rawAction || typeof rawAction !== 'object') {
    throw new Error(`Tasks file ${resolvedPath}: task ${taskIndex} action ${actionIndex} must be an object`);
  }

  const candidate = rawAction as { name?: unknown; method?: unknown; args?: unknown };
  const name = typeof candidate.name === 'string'
    ? candidate.name
    : typeof candidate.method === 'string'
      ? candidate.method
      : null;

  if (!name || name.trim() === '') {
    throw new Error(`Tasks file ${resolvedPath}: task ${taskIndex} action ${actionIndex} must include a non-empty name`);
  }

  if (candidate.args !== undefined && (!candidate.args || typeof candidate.args !== 'object' || Array.isArray(candidate.args))) {
    throw new Error(`Tasks file ${resolvedPath}: task ${taskIndex} action ${actionIndex} args must be an object when present`);
  }

  return {
    name,
    method: name,
    args: (candidate.args as Record<string, unknown> | undefined) ?? {},
  };
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

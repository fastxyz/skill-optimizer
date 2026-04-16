import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { McpToolDefinition, CliCommandDefinition } from '../benchmark/types.js';

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

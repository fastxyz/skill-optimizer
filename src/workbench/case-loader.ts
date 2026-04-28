import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';

import { parse as parseYaml } from 'yaml';

import type { ResolvedWorkbenchCase, WorkbenchGraderConfig } from './types.js';

export const DEFAULT_WORKBENCH_MODEL = 'openrouter/google/gemini-2.5-flash';
export const DEFAULT_WORKBENCH_TIMEOUT_SECONDS = 600;

export function loadWorkbenchCase(configPath: string): ResolvedWorkbenchCase {
  const resolvedConfigPath = resolve(configPath);
  const configDir = dirname(resolvedConfigPath);

  if (!existsSync(resolvedConfigPath)) {
    throw new Error(`Workbench case file not found: ${resolvedConfigPath}`);
  }

  let raw: string;
  try {
    raw = readFileSync(resolvedConfigPath, 'utf-8');
  } catch (error) {
    throw new Error(
      `Failed to read workbench case file ${resolvedConfigPath}: ` +
      `${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const parsed = parseWorkbenchCase(raw, resolvedConfigPath);

  return resolveWorkbenchCaseConfig(parsed, resolvedConfigPath, configDir);
}

export function resolveWorkbenchCaseConfig(
  parsed: Record<string, unknown>,
  configPath: string,
  configDir: string,
): ResolvedWorkbenchCase {
  const resolvedConfigPath = configPath;
  const resolvedConfigDir = resolve(configDir);

  if (parsed.check !== undefined) {
    throw new Error(`Workbench case ${resolvedConfigPath}: field "check" is no longer supported; use "graders"`);
  }

  const name = requireNonEmptyString(parsed, 'name', resolvedConfigPath);
  const references = requireNonEmptyString(parsed, 'references', resolvedConfigPath);
  const task = requireNonEmptyString(parsed, 'task', resolvedConfigPath);
  const graders = readGraders(parsed, resolvedConfigPath);
  const artifacts = readStringArray(parsed, 'artifacts', resolvedConfigPath);
  const env = readStringArray(parsed, 'env', resolvedConfigPath);
  const setup = readStringArray(parsed, 'setup', resolvedConfigPath);
  const cleanup = readStringArray(parsed, 'cleanup', resolvedConfigPath);
  const model = readOptionalString(parsed, 'model', resolvedConfigPath) ?? DEFAULT_WORKBENCH_MODEL;
  const timeoutSeconds = readOptionalTimeoutSeconds(parsed, resolvedConfigPath) ?? DEFAULT_WORKBENCH_TIMEOUT_SECONDS;

  const referencesDir = resolve(resolvedConfigDir, references);
  if (!existsSync(referencesDir)) {
    throw new Error(
      `Workbench case ${resolvedConfigPath}: references path does not exist: ${referencesDir}`,
    );
  }
  if (!statSync(referencesDir).isDirectory()) {
    throw new Error(
      `Workbench case ${resolvedConfigPath}: references must resolve to a directory: ${referencesDir}`,
    );
  }

  return {
    configPath: resolvedConfigPath,
    configDir: resolvedConfigDir,
    name,
    referencesDir,
    task,
    graders,
    artifacts,
    env,
    setup,
    cleanup,
    model,
    timeoutSeconds,
  };
}

function parseWorkbenchCase(raw: string, configPath: string): Record<string, unknown> {
  const extension = extname(configPath).toLowerCase();

  try {
    if (extension === '.json') {
      const parsed = JSON.parse(raw) as unknown;
      ensurePlainObject(parsed, configPath);
      return parsed;
    }

    if (extension === '.yml' || extension === '.yaml') {
      const parsed = parseYaml(raw) as unknown;
      ensurePlainObject(parsed, configPath);
      return parsed;
    }
  } catch (error) {
    const parser = extension === '.json' ? 'JSON' : 'YAML';
    throw new Error(
      `Invalid ${parser} in workbench case file ${configPath}: ` +
      `${error instanceof Error ? error.message : String(error)}`,
    );
  }

  throw new Error(
    `Unsupported workbench case file extension for ${configPath}. Expected .json, .yml, or .yaml.`,
  );
}

function ensurePlainObject(value: unknown, configPath: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Workbench case file ${configPath} must contain an object at the root`);
  }
}

function requireNonEmptyString(
  parsed: Record<string, unknown>,
  field: 'name' | 'references' | 'task',
  configPath: string,
): string {
  const value = parsed[field];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Workbench case ${configPath}: field "${field}" must be a non-empty string`);
  }
  return value.trim();
}

function readGraders(parsed: Record<string, unknown>, configPath: string): WorkbenchGraderConfig[] {
  const value = parsed.graders;
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Workbench case ${configPath}: field "graders" must be a non-empty array`);
  }

  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`Workbench case ${configPath}: field "graders" item at index ${index} must be an object`);
    }

    const grader = item as Record<string, unknown>;
    const name = readGraderString(grader.name, 'name', index, configPath);
    const command = readGraderString(grader.command, 'command', index, configPath);
    return { name, command };
  });
}

function readGraderString(
  value: unknown,
  field: keyof WorkbenchGraderConfig,
  index: number,
  configPath: string,
): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(
      `Workbench case ${configPath}: field "graders" item at index ${index} ${field} must be a non-empty string`,
    );
  }
  return value.trim();
}

function readOptionalString(
  parsed: Record<string, unknown>,
  field: 'model',
  configPath: string,
): string | undefined {
  const value = parsed[field];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Workbench case ${configPath}: field "${field}" must be a non-empty string when provided`);
  }
  return value.trim();
}

function readOptionalTimeoutSeconds(parsed: Record<string, unknown>, configPath: string): number | undefined {
  const value = parsed.timeoutSeconds;
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`Workbench case ${configPath}: field "timeoutSeconds" must be a positive number when provided`);
  }
  return value;
}

function readStringArray(
  parsed: Record<string, unknown>,
  field: 'env' | 'setup' | 'cleanup' | 'artifacts',
  configPath: string,
): string[] {
  const value = parsed[field];
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error(`Workbench case ${configPath}: field "${field}" must be an array of non-empty strings`);
  }

  return value.map((item, index) => {
    if (typeof item !== 'string' || item.trim() === '') {
      throw new Error(
        `Workbench case ${configPath}: field "${field}" item at index ${index} must be a non-empty string`,
      );
    }
    return item.trim();
  });
}

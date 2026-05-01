import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';

import { parse as parseYaml } from 'yaml';

import type {
  ResolvedWorkbenchCase,
  WorkbenchGraderConfig,
  WorkbenchMcpJsonValue,
  WorkbenchMcpServerConfig,
  WorkbenchMcpServersConfig,
  WorkbenchMcpServiceConfig,
  WorkbenchMcpServicesConfig,
} from './types.js';

export const DEFAULT_WORKBENCH_MODEL = 'openrouter/google/gemini-2.5-flash';
export const DEFAULT_WORKBENCH_TIMEOUT_SECONDS = 600;
const ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

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
    throw new Error(`Workbench case ${resolvedConfigPath}: field "check" is invalid; define graders as a non-empty array of { name, command } objects`);
  }
  if (parsed.artifacts !== undefined) {
    throw new Error(`Workbench case ${resolvedConfigPath}: field "artifacts" is invalid; inspect outputs in the workspace or use --keep-workspace`);
  }

  const name = requireNonEmptyString(parsed, 'name', resolvedConfigPath);
  const references = requireNonEmptyString(parsed, 'references', resolvedConfigPath);
  const task = requireNonEmptyString(parsed, 'task', resolvedConfigPath);
  const graders = readGraders(parsed, resolvedConfigPath);
  const mcpServers = readMcpServers(parsed, resolvedConfigPath);
  const mcpServices = readMcpServices(parsed, resolvedConfigPath);
  validateMcpServiceServers(mcpServices, mcpServers, resolvedConfigPath);
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
    mcpServers,
    mcpServices,
    env,
    setup,
    cleanup,
    model,
    timeoutSeconds,
  };
}

export function readMcpServices(
  parsed: Record<string, unknown>,
  configPath: string,
): WorkbenchMcpServicesConfig {
  const value = parsed.mcpServices;
  if (value === undefined) {
    return {};
  }
  if (!isPlainObject(value)) {
    throw new Error(`Workbench case ${configPath}: field "mcpServices" must be an object`);
  }

  const services: WorkbenchMcpServicesConfig = {};
  for (const [rawName, rawService] of Object.entries(value)) {
    const name = rawName.trim();
    if (name === '') {
      throw new Error(`Workbench case ${configPath}: field "mcpServices" service names must be non-empty strings`);
    }
    if (!isPlainObject(rawService)) {
      throw new Error(`Workbench case ${configPath}: field "mcpServices" service "${name}" must be an object`);
    }
    services[name] = readMcpService(rawService, name, configPath);
  }

  return services;
}

function readMcpService(
  parsed: Record<string, unknown>,
  name: string,
  configPath: string,
): WorkbenchMcpServiceConfig {
  const command = readMcpServiceString(parsed.command, 'command', name, configPath);
  const args = parsed.args === undefined ? [] : readMcpServiceStringArray(parsed.args, 'args', name, configPath);
  if (parsed.port !== undefined) {
    throw new Error(`Workbench case ${configPath}: field "mcpServices" service "${name}" port is not supported; set the port in the matching mcpServers URL`);
  }
  return {
    command,
    args,
  };
}

function validateMcpServiceServers(
  services: WorkbenchMcpServicesConfig,
  servers: WorkbenchMcpServersConfig,
  configPath: string,
): void {
  for (const name of Object.keys(services)) {
    if (servers[name] === undefined) {
      throw new Error(`Workbench case ${configPath}: field "mcpServices" service "${name}" requires a matching "mcpServers" entry`);
    }
  }
}

export function readMcpServers(
  parsed: Record<string, unknown>,
  configPath: string,
): WorkbenchMcpServersConfig {
  const value = parsed.mcpServers;
  if (value === undefined) {
    return {};
  }
  if (!isPlainObject(value)) {
    throw new Error(`Workbench case ${configPath}: field "mcpServers" must be an object`);
  }

  const servers: WorkbenchMcpServersConfig = {};
  for (const [rawName, rawServer] of Object.entries(value)) {
    const name = rawName.trim();
    if (name === '') {
      throw new Error(`Workbench case ${configPath}: field "mcpServers" server names must be non-empty strings`);
    }
    if (!isPlainObject(rawServer)) {
      throw new Error(`Workbench case ${configPath}: field "mcpServers" server "${name}" must be an object`);
    }
    servers[name] = readMcpServer(rawServer, name, configPath);
  }

  return servers;
}

function readMcpServer(
  parsed: Record<string, unknown>,
  name: string,
  configPath: string,
): WorkbenchMcpServerConfig {
  const server: WorkbenchMcpServerConfig = {};

  for (const [key, value] of Object.entries(parsed)) {
    if (isMcpStringField(key)) {
      server[key] = readMcpString(value, key, name, configPath);
      continue;
    }

    if (isMcpStringArrayField(key)) {
      server[key] = readMcpStringArray(value, key, name, configPath);
      continue;
    }

    if (key === 'env' || key === 'headers') {
      server[key] = readMcpStringRecord(value, key, name, configPath);
      continue;
    }

    server[key] = cloneMcpJsonValue(value, key, name, configPath);
  }

  if (server.auth === 'oauth') {
    throw new Error(`Workbench case ${configPath}: field "mcpServers" server "${name}" auth "oauth" is not supported; use non-interactive headers or env credentials`);
  }

  const hasUrl = [server.url, server.baseUrl, server.serverUrl]
    .some((value) => typeof value === 'string' && value.trim() !== '');
  const hasCommand = typeof server.command === 'string' && server.command.trim() !== '';
  if (!hasUrl && !hasCommand) {
    throw new Error(`Workbench case ${configPath}: field "mcpServers" server "${name}" must define a non-empty url, baseUrl, serverUrl, or command`);
  }

  if ((server.allowedTools || server.allowed_tools) && (server.blockedTools || server.blocked_tools)) {
    throw new Error(`Workbench case ${configPath}: field "mcpServers" server "${name}" cannot define both allowedTools and blockedTools`);
  }

  return server;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isMcpStringField(key: string): boolean {
  return [
    'description',
    'baseUrl',
    'url',
    'serverUrl',
    'command',
    'auth',
    'tokenCacheDir',
    'clientName',
    'oauthRedirectUrl',
    'oauthScope',
  ].includes(key);
}

function isMcpStringArrayField(key: string): boolean {
  return ['args', 'allowedTools', 'allowed_tools', 'blockedTools', 'blocked_tools'].includes(key);
}

function readMcpString(
  value: unknown,
  field: string,
  serverName: string,
  configPath: string,
): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Workbench case ${configPath}: field "mcpServers" server "${serverName}" ${field} must be a non-empty string`);
  }
  return value.trim();
}

function readMcpServiceString(
  value: unknown,
  field: string,
  serviceName: string,
  configPath: string,
): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Workbench case ${configPath}: field "mcpServices" service "${serviceName}" ${field} must be a non-empty string`);
  }
  return value.trim();
}

function readMcpStringArray(
  value: unknown,
  field: string,
  serverName: string,
  configPath: string,
): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`Workbench case ${configPath}: field "mcpServers" server "${serverName}" ${field} must be an array of non-empty strings`);
  }
  return value.map((item, index) => {
    if (typeof item !== 'string' || item.trim() === '') {
      throw new Error(`Workbench case ${configPath}: field "mcpServers" server "${serverName}" ${field} item at index ${index} must be a non-empty string`);
    }
    return item.trim();
  });
}

function readMcpServiceStringArray(
  value: unknown,
  field: string,
  serviceName: string,
  configPath: string,
): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`Workbench case ${configPath}: field "mcpServices" service "${serviceName}" ${field} must be an array of non-empty strings`);
  }
  return value.map((item, index) => {
    if (typeof item !== 'string' || item.trim() === '') {
      throw new Error(`Workbench case ${configPath}: field "mcpServices" service "${serviceName}" ${field} item at index ${index} must be a non-empty string`);
    }
    return item.trim();
  });
}

function readMcpStringRecord(
  value: unknown,
  field: string,
  serverName: string,
  configPath: string,
): Record<string, string> {
  if (!isPlainObject(value)) {
    throw new Error(`Workbench case ${configPath}: field "mcpServers" server "${serverName}" ${field} must be an object of string values`);
  }

  const record: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(value)) {
    const key = rawKey.trim();
    if (key === '' || typeof rawValue !== 'string') {
      throw new Error(`Workbench case ${configPath}: field "mcpServers" server "${serverName}" ${field} entries must have non-empty string keys and string values`);
    }
    record[key] = rawValue;
  }
  return record;
}

function cloneMcpJsonValue(
  value: unknown,
  field: string,
  serverName: string,
  configPath: string,
): WorkbenchMcpJsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`Workbench case ${configPath}: field "mcpServers" server "${serverName}" ${field} must be JSON-compatible`);
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => cloneMcpJsonValue(item, field, serverName, configPath));
  }
  if (isPlainObject(value)) {
    const record: Record<string, WorkbenchMcpJsonValue> = {};
    for (const [key, item] of Object.entries(value)) {
      record[key] = cloneMcpJsonValue(item, field, serverName, configPath);
    }
    return record;
  }

  throw new Error(`Workbench case ${configPath}: field "mcpServers" server "${serverName}" ${field} must be JSON-compatible`);
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
  field: 'env' | 'setup' | 'cleanup',
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
    const trimmed = item.trim();
    if (field === 'env' && !ENV_NAME_PATTERN.test(trimmed)) {
      throw new Error(
        `Workbench case ${configPath}: field "env" item at index ${index} must match ^[A-Za-z_][A-Za-z0-9_]*$`,
      );
    }
    return trimmed;
  });
}

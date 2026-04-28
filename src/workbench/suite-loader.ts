import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, extname, resolve } from 'node:path';

import { parse as parseYaml } from 'yaml';

import { resolveWorkbenchCaseConfig } from './case-loader.js';
import { ensureOpenRouterModelRef } from './models.js';
import { validateSuiteProvenance } from './provenance.js';
import type { ResolvedWorkbenchCase, WorkbenchSourceConfig, WorkbenchSuiteKind } from './types.js';
import { slugPathSegment } from './utils.js';

export interface ResolvedWorkbenchSuiteCase {
  slug: string;
  path?: string;
  case?: ResolvedWorkbenchCase;
}

export interface ResolvedWorkbenchSuite {
  configPath: string;
  configDir: string;
  name: string;
  casePaths: string[];
  cases: ResolvedWorkbenchSuiteCase[];
  models: string[];
  kind: WorkbenchSuiteKind;
  targetPassRate?: number;
  source?: WorkbenchSourceConfig;
}

export function loadWorkbenchSuite(configPath: string): ResolvedWorkbenchSuite {
  const resolvedConfigPath = resolve(configPath);
  const configDir = dirname(resolvedConfigPath);

  if (!existsSync(resolvedConfigPath)) {
    throw new Error(`Workbench suite file not found: ${resolvedConfigPath}`);
  }

  let raw: string;
  try {
    raw = readFileSync(resolvedConfigPath, 'utf-8');
  } catch (error) {
    throw new Error(
      `Failed to read workbench suite file ${resolvedConfigPath}: ` +
      `${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const parsed = parseWorkbenchSuite(raw, resolvedConfigPath);
  const name = requireNonEmptyString(parsed, 'name', resolvedConfigPath);
  const suiteDefaults = readSuiteCaseDefaults(parsed, resolvedConfigPath);
  const cases = readCaseEntries(parsed, resolvedConfigPath)
    .map((entry, index) => resolveSuiteCase(entry, index, resolvedConfigPath, configDir, suiteDefaults));
  const casePaths = cases.flatMap((suiteCase) => suiteCase.path ? [suiteCase.path] : []);
  const models = readStringArray(parsed, 'models', resolvedConfigPath, true)
    .map((model) => ensureOpenRouterModelRef(model));
  const kind = readSuiteKind(parsed, resolvedConfigPath);
  const targetPassRate = readOptionalTargetPassRate(parsed, resolvedConfigPath);
  const source = readOptionalSource(parsed, resolvedConfigPath);
  validateSuiteProvenance(configDir, source);

  return {
    configPath: resolvedConfigPath,
    configDir,
    name,
    casePaths,
    cases,
    models,
    kind,
    targetPassRate,
    source,
  };
}

interface SuiteCaseDefaults {
  references: string;
  env: string[];
  setup: string[];
  cleanup: string[];
  artifacts: string[];
  timeoutSeconds?: number;
}

function readSuiteCaseDefaults(parsed: Record<string, unknown>, configPath: string): SuiteCaseDefaults {
  return {
    references: readOptionalString(parsed, 'references', configPath) ?? './references',
    env: readStringArray(parsed, 'env', configPath, true),
    setup: readStringArray(parsed, 'setup', configPath, true),
    cleanup: readStringArray(parsed, 'cleanup', configPath, true),
    artifacts: readStringArray(parsed, 'artifacts', configPath, true),
    timeoutSeconds: readOptionalTimeoutSeconds(parsed, configPath),
  };
}

function resolveSuiteCase(
  entry: string | Record<string, unknown>,
  index: number,
  suitePath: string,
  suiteDir: string,
  defaults: SuiteCaseDefaults,
): ResolvedWorkbenchSuiteCase {
  if (typeof entry === 'string') {
    const path = resolve(suiteDir, entry);
    return { slug: caseSlugFromPath(path), path };
  }

  const inlineConfig = applySuiteDefaults(entry, defaults);
  const resolvedCase = resolveWorkbenchCaseConfig(inlineConfig, `${suitePath}#cases[${index}]`, suiteDir);
  return { slug: slugPathSegment(resolvedCase.name), case: resolvedCase };
}

function applySuiteDefaults(
  entry: Record<string, unknown>,
  defaults: SuiteCaseDefaults,
): Record<string, unknown> {
  return {
    references: defaults.references,
    ...(defaults.env.length > 0 ? { env: defaults.env } : {}),
    ...(defaults.setup.length > 0 ? { setup: defaults.setup } : {}),
    ...(defaults.cleanup.length > 0 ? { cleanup: defaults.cleanup } : {}),
    ...(defaults.artifacts.length > 0 ? { artifacts: defaults.artifacts } : {}),
    ...(defaults.timeoutSeconds !== undefined ? { timeoutSeconds: defaults.timeoutSeconds } : {}),
    ...entry,
  };
}

function caseSlugFromPath(casePath: string): string {
  const file = basename(casePath);
  const stem = file.slice(0, file.length - extname(file).length);
  return slugPathSegment(stem === 'case' ? basename(dirname(casePath)) : stem);
}

function parseWorkbenchSuite(raw: string, configPath: string): Record<string, unknown> {
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
      `Invalid ${parser} in workbench suite file ${configPath}: ` +
      `${error instanceof Error ? error.message : String(error)}`,
    );
  }

  throw new Error(
    `Unsupported workbench suite file extension for ${configPath}. Expected .json, .yml, or .yaml.`,
  );
}

function ensurePlainObject(value: unknown, configPath: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Workbench suite file ${configPath} must contain an object at the root`);
  }
}

function requireNonEmptyString(
  parsed: Record<string, unknown>,
  field: 'name',
  configPath: string,
): string {
  const value = parsed[field];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Workbench suite ${configPath}: field "${field}" must be a non-empty string`);
  }
  return value.trim();
}

function readStringArray(
  parsed: Record<string, unknown>,
  field: 'models' | 'env' | 'setup' | 'cleanup' | 'artifacts',
  configPath: string,
  optional = false,
): string[] {
  const value = parsed[field];
  if (value === undefined) {
    if (optional) return [];
    throw new Error(`Workbench suite ${configPath}: field "${field}" must be an array of non-empty strings`);
  }
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Workbench suite ${configPath}: field "${field}" must be a non-empty array of strings`);
  }

  return value.map((item, index) => {
    if (typeof item !== 'string' || item.trim() === '') {
      throw new Error(
        `Workbench suite ${configPath}: field "${field}" item at index ${index} must be a non-empty string`,
      );
    }
    return item.trim();
  });
}

function readCaseEntries(parsed: Record<string, unknown>, configPath: string): Array<string | Record<string, unknown>> {
  const value = parsed.cases;
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Workbench suite ${configPath}: field "cases" must be a non-empty array`);
  }

  return value.map((item, index) => {
    if (typeof item === 'string' && item.trim() !== '') {
      return item.trim();
    }
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      return item as Record<string, unknown>;
    }
    throw new Error(
      `Workbench suite ${configPath}: field "cases" item at index ${index} must be a non-empty string or object`,
    );
  });
}

function readOptionalString(
  parsed: Record<string, unknown>,
  field: 'references',
  configPath: string,
): string | undefined {
  const value = parsed[field];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Workbench suite ${configPath}: field "${field}" must be a non-empty string when provided`);
  }
  return value.trim();
}

function readOptionalTimeoutSeconds(parsed: Record<string, unknown>, configPath: string): number | undefined {
  const value = parsed.timeoutSeconds;
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`Workbench suite ${configPath}: field "timeoutSeconds" must be a positive number when provided`);
  }
  return value;
}

function readSuiteKind(parsed: Record<string, unknown>, configPath: string): WorkbenchSuiteKind {
  const value = parsed.kind;
  if (value === undefined) {
    return 'capability';
  }
  if (value !== 'capability' && value !== 'regression') {
    throw new Error(`Workbench suite ${configPath}: field "kind" must be "capability" or "regression" when provided`);
  }
  return value;
}

function readOptionalTargetPassRate(parsed: Record<string, unknown>, configPath: string): number | undefined {
  const value = parsed.targetPassRate;
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`Workbench suite ${configPath}: field "targetPassRate" must be a number between 0 and 1 when provided`);
  }
  return value;
}

function readOptionalSource(parsed: Record<string, unknown>, configPath: string): WorkbenchSourceConfig | undefined {
  const value = parsed.source;
  if (value === undefined) {
    return undefined;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Workbench suite ${configPath}: field "source" must be an object when provided`);
  }

  const source = value as Record<string, unknown>;
  if (source.type !== 'git') {
    throw new Error(`Workbench suite ${configPath}: field "source.type" must be "git"`);
  }
  const url = readSourceString(source.url, 'source.url', configPath);
  const ref = readSourceString(source.ref, 'source.ref', configPath);
  const includedPaths = source.includedPaths;
  if (!Array.isArray(includedPaths) || includedPaths.length === 0) {
    throw new Error(`Workbench suite ${configPath}: field "source.includedPaths" must be a non-empty array of strings`);
  }

  return {
    type: 'git',
    url,
    ref,
    includedPaths: includedPaths.map((item, index) => {
      if (typeof item !== 'string' || item.trim() === '') {
        throw new Error(`Workbench suite ${configPath}: field "source.includedPaths" item at index ${index} must be a non-empty string`);
      }
      return item.trim();
    }),
  };
}

function readSourceString(value: unknown, field: string, configPath: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Workbench suite ${configPath}: field "${field}" must be a non-empty string`);
  }
  return value.trim();
}

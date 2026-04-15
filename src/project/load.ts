import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import type { ProjectConfig, ResolvedProjectConfig } from './types.js';
import { resolveProjectConfig } from './resolve.js';
import { validateProjectConfig } from './validate.js';

export const DEFAULT_PROJECT_CONFIG_NAME = 'skill-optimizer.json';

export async function loadProjectConfig(configPath?: string, opts?: { skipDirtyGitCheck?: boolean }): Promise<ResolvedProjectConfig> {
  const resolvedPath = configPath
    ? resolve(configPath)
    : resolve(process.cwd(), DEFAULT_PROJECT_CONFIG_NAME);

  if (!existsSync(resolvedPath)) {
    // Only check for the old filename when the user didn't supply --config
    // (i.e. we resolved to the default). If they passed an explicit path that
    // happens to be missing we don't want to confuse them with a rename hint.
    if (!configPath) {
      const legacyPath = resolve(dirname(resolvedPath), 'skill-benchmark.json');
      if (existsSync(legacyPath)) {
        throw new Error(
          `Config file not found at ${resolvedPath}.\n` +
          `Found 'skill-benchmark.json' — rename it to 'skill-optimizer.json' to continue.`,
        );
      }
    }
    throw new Error(
      `Project config not found: ${resolvedPath}\n` +
      `Run 'skill-optimizer init' to create one, or specify --config <path>.`,
    );
  }

  let raw: string;
  try {
    raw = readFileSync(resolvedPath, 'utf-8');
  } catch (error) {
    throw new Error(
      `Failed to read project config: ${resolvedPath}: ` +
        `${error instanceof Error ? error.message : String(error)}`,
    );
  }

  let parsed: ProjectConfig;
  try {
    parsed = JSON.parse(raw) as ProjectConfig;
  } catch (error) {
    throw new Error(
      `Invalid JSON in project config ${resolvedPath}: ` +
        `${error instanceof Error ? error.message : String(error)}`,
    );
  }

  await validateProjectConfig(parsed, resolvedPath, { skipDirtyGitCheck: opts?.skipDirtyGitCheck });
  return resolveProjectConfig(parsed, resolvedPath);
}

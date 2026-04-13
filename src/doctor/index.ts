import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

import { checkConfig } from '../project/validate.js';
import { applyFixes } from '../project/fix.js';
import { loadProjectConfig } from '../project/load.js';
import { checkDiscovery, checkModelReachability } from './checks.js';
import { formatIssues, formatFixResult } from './format.js';
import type { Issue } from '../project/validate.js';

export interface DoctorOptions {
  staticOnly?: boolean;
  checkModels?: boolean;
  fix?: boolean;
}

export async function runDoctor(configPath: string, opts: DoctorOptions = {}): Promise<number> {
  const resolvedPath = resolve(configPath);

  let rawJson: Record<string, unknown>;
  try {
    rawJson = JSON.parse(readFileSync(resolvedPath, 'utf-8')) as Record<string, unknown>;
  } catch (err) {
    console.error(`ERROR: Cannot read config: ${resolvedPath}`);
    console.error(err instanceof Error ? err.message : String(err));
    return 2;
  }

  // Tier 1: structural + path + format checks
  let issues: Issue[] = await checkConfig(rawJson, resolvedPath);

  if (opts.fix) {
    const configDir = dirname(resolvedPath);
    const fixableCount = issues.filter((i) => i.fixable).length;
    if (fixableCount > 0) {
      const fixed = applyFixes(rawJson, issues, configDir);
      writeFileSync(resolvedPath, JSON.stringify(fixed, null, 2) + '\n', 'utf-8');
      rawJson = fixed;
      issues = await checkConfig(rawJson, resolvedPath);
      console.log(formatFixResult(fixableCount, issues, resolvedPath));
    } else {
      console.log('\n  No auto-fixable issues found.');
    }
    return issues.some((i) => i.severity === 'error') ? 1 : 0;
  }

  // Tier 2: discovery (default, skipped with --static)
  if (!opts.staticOnly && !issues.some((i) => i.severity === 'error')) {
    try {
      const project = await loadProjectConfig(resolvedPath);
      issues = [...issues, ...checkDiscovery(project)];
    } catch {
      // loadProjectConfig threw; static errors already cover this
    }
  }

  // Tier 3: model reachability (--check-models)
  if (opts.checkModels) {
    try {
      const project = await loadProjectConfig(resolvedPath);
      issues = [...issues, ...(await checkModelReachability(project))];
    } catch {
      // skip
    }
  }

  console.log(formatIssues(issues, resolvedPath));
  return issues.some((i) => i.severity === 'error') ? 1 : 0;
}

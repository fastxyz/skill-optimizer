import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

import { checkConfig } from '../project/validate.js';
import { applyFixes } from '../project/fix.js';
import { loadProjectConfig } from '../project/load.js';
import { checkDiscovery, checkModelReachability } from './checks.js';
import { formatIssues, formatFixResult } from './format.js';
import type { Issue } from '../project/validate.js';

interface DoctorOptions {
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
    const initialFixableCount = issues.filter((i) => i.fixable).length;
    if (initialFixableCount > 0) {
      let safety = 3;
      while (issues.some((i) => i.fixable) && safety-- > 0) {
        rawJson = applyFixes(rawJson, issues, configDir);
        issues = await checkConfig(rawJson, resolvedPath);
      }
      writeFileSync(resolvedPath, JSON.stringify(rawJson, null, 2) + '\n', 'utf-8');
      console.log(formatFixResult(initialFixableCount, issues, resolvedPath));
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
    } catch (e) {
      // loadProjectConfig threw; static errors already cover this
      if (process.env['DEBUG']) console.error('[debug] Tier-2 skipped:', e);
    }
  }

  // Tier 3: model reachability (--check-models)
  if (opts.checkModels) {
    try {
      const project = await loadProjectConfig(resolvedPath);
      issues = [...issues, ...(await checkModelReachability(project))];
    } catch (e) {
      if (process.env['DEBUG']) console.error('[debug] Tier-3 skipped:', e);
    }
  }

  console.log(formatIssues(issues, resolvedPath));
  return issues.some((i) => i.severity === 'error') ? 1 : 0;
}

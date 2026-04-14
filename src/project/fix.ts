import type { Issue } from './validate.js';

/**
 * Apply auto-fixable changes to a raw config JSON object.
 * Pure function — deep-clones input, never mutates, never writes to disk.
 */
export function applyFixes(
  rawJson: Record<string, unknown>,
  issues: Issue[],
  _configDir: string,
): Record<string, unknown> {
  const result = JSON.parse(JSON.stringify(rawJson)) as Record<string, unknown>;

  // Track which model indices had their prefix fixed so we don't also apply
  // the dot-format fix on top (the bad-format issue was generated from the
  // original ID before the prefix was added).
  const prefixFixedIndices = new Set<number>();

  for (const issue of issues.filter((i) => i.fixable)) {
    if (issue.code === 'model-id-missing-prefix' || issue.code === 'model-id-bad-format') {
      const match = issue.field.match(/^benchmark\.models\[(\d+)\]\.id$/);
      if (!match) continue;
      const idx = parseInt(match[1]!, 10);
      const models = (result.benchmark as Record<string, unknown> | undefined)?.models as Array<Record<string, unknown>> | undefined;
      if (!models?.[idx]) continue;

      if (issue.code === 'model-id-missing-prefix') {
        models[idx]!.id = `openrouter/${models[idx]!.id as string}`;
        prefixFixedIndices.add(idx);
      }

      if (issue.code === 'model-id-bad-format' && !prefixFixedIndices.has(idx)) {
        models[idx]!.id = (models[idx]!.id as string).replace(/(\d+)\.(\d+)/g, '$1-$2');
      }
    }

    if (issue.code === 'deprecated-tasks-field') {
      const benchmark = result.benchmark as Record<string, unknown> | undefined;
      if (benchmark) delete benchmark.tasks;
    }
  }

  return result;
}

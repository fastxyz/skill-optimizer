import type { BenchmarkReport, TaskResult } from './types.js';
import { getExpectedActions, getExpectedActionName } from './types.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function fixed2(n: number): string {
  return n.toFixed(2);
}

function padR(s: string, w: number): string {
  return s.length >= w ? s.slice(0, w) : s + ' '.repeat(w - s.length);
}


function center(s: string, w: number): string {
  if (s.length >= w) return s.slice(0, w);
  const total = w - s.length;
  const left = Math.floor(total / 2);
  const right = total - left;
  return ' '.repeat(left) + s + ' '.repeat(right);
}

// ── Markdown generation ───────────────────────────────────────────────────────

export function generateMarkdown(report: BenchmarkReport): string {
  const lines: string[] = [];
  const { summary, skillVersion, coverage, results } = report;

  // 1. Title + metadata
  lines.push('# Skill Benchmark Report');
  lines.push('');
  lines.push(`**Generated:** ${new Date(report.timestamp).toUTCString()}`);
  if (skillVersion) {
    lines.push(`**Skill Version:** \`${skillVersion.source}@${skillVersion.commitSha.slice(0, 8)}\` (ref: \`${skillVersion.ref}\`)`);
    lines.push(`**Fetched At:** ${skillVersion.fetchedAt}`);
  }
  if (report.config) {
    lines.push(`**Benchmark:** ${report.config.name} (surface: ${report.config.surface})`);
  }
  lines.push('');

  // 2. Summary metrics table
  lines.push('## Summary');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Total Tasks | ${summary.totalTasks} |`);
  lines.push(`| Total Models | ${summary.totalModels} |`);
  lines.push(`| Total Evaluations | ${summary.totalEvaluations} |`);
  lines.push(`| Overall Pass Rate | ${pct(summary.overallPassRate)} |`);
  lines.push(`| Avg Recall | ${fixed2(summary.avgToolRecall)} |`);
  lines.push(`| Action Coverage | ${pct(summary.methodCoveragePercent)} |`);
  lines.push('');

  // 3. Per-model results table
  lines.push('## Results by Model');
  lines.push('');
  lines.push('| Model | Tier | Pass Rate | Recall | Tasks Run |');
  lines.push('|-------|------|-----------|--------|-----------|');

  // Collect model display names from results
  const modelNameMap = new Map<string, string>();
  const modelTierMap = new Map<string, string>();
  for (const r of results) {
    modelNameMap.set(r.model.id, r.model.name);
    modelTierMap.set(r.model.id, r.model.tier);
  }

  // Sort by pass rate descending
  const modelEntries = Object.entries(summary.perModel).sort(
    ([, a], [, b]) => b.passRate - a.passRate,
  );
  for (const [modelId, ms] of modelEntries) {
    const name = modelNameMap.get(modelId) ?? modelId;
    const tier = modelTierMap.get(modelId) ?? '—';
    lines.push(
      `| ${name} | ${tier} | ${pct(ms.passRate)} | ${fixed2(ms.avgRecall)} | ${ms.tasksRun} |`,
    );
  }
  lines.push('');

  // 4. Per-task results table
  lines.push('## Results by Task');
  lines.push('');
  lines.push('| Task | Pass Rate | Recall | Failed Models |');
  lines.push('|------|-----------|--------|---------------|');

  // Build failed models per task
  const failedModelsPerTask = new Map<string, string[]>();
  for (const r of results) {
    if (!r.metrics.taskPassed) {
      const list = failedModelsPerTask.get(r.task.id) ?? [];
      list.push(r.model.name);
      failedModelsPerTask.set(r.task.id, list);
    }
  }

  const taskEntries = Object.entries(summary.perTask).sort(
    ([, a], [, b]) => a.passRate - b.passRate,
  );
  for (const [taskId, ts] of taskEntries) {
    const failed = failedModelsPerTask.get(taskId) ?? [];
    const failedStr = failed.length > 0 ? failed.join(', ') : '—';
    lines.push(
      `| \`${taskId}\` | ${pct(ts.passRate)} | ${fixed2(ts.avgRecall)} | ${failedStr} |`,
    );
  }
  lines.push('');

  // 5. Per-tier summary
  lines.push('## Results by Tier');
  lines.push('');
  lines.push('| Tier | Pass Rate | Tool Sel. | Arg Acc. | Avg Recall |');
  lines.push('|------|-----------|-----------|----------|------------|');
  for (const tier of ['flagship', 'mid', 'low'] as const) {
    const t = summary.perTier[tier];
    lines.push(`| ${tier} | ${pct(t.passRate)} | ${fixed2(t.avgToolSelectionAccuracy)} | ${fixed2(t.avgArgAccuracy)} | ${fixed2(t.avgRecall)} |`);
  }
  lines.push('');

  // 6. Known-action coverage table
  lines.push('## Known Action Coverage');
  lines.push('');
  lines.push('| Action | Covered | Tasks |');
  lines.push('|--------|---------|-------|');
  for (const mc of coverage) {
    const icon = mc.covered ? '✔' : '✘';
    const tasks = mc.tasksCovering.length > 0 ? mc.tasksCovering.join(', ') : '—';
    lines.push(`| \`${mc.method}\` | ${icon} | ${tasks} |`);
  }
  lines.push('');

  // 7. Detailed results per task
  lines.push('## Detailed Results');
  lines.push('');

  // Group results by task
  const byTask = new Map<string, TaskResult[]>();
  for (const r of results) {
    const list = byTask.get(r.task.id) ?? [];
    list.push(r);
    byTask.set(r.task.id, list);
  }

  for (const [taskId, taskResults] of byTask) {
    const firstResult = taskResults[0]!;
    lines.push(`### Task: \`${taskId}\``);
    lines.push('');
    lines.push(`**Prompt:** ${firstResult.task.prompt}`);
    lines.push('');
    lines.push(
      `**Expected Actions:** ${getExpectedActions(firstResult.task).map((t) => `\`${getExpectedActionName(t)}\``).join(', ')}`,
    );
    lines.push('');
    lines.push('| Model | Status | Recall | Latency |');
    lines.push('|-------|--------|--------|---------|');

    for (const r of taskResults) {
      const status = r.metrics.taskPassed ? '✅ PASS' : '❌ FAIL';
      lines.push(
        `| ${r.model.name} | ${status} | ${fixed2(r.metrics.toolRecall)} | ${r.llmLatencyMs}ms |`,
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ── Console summary ───────────────────────────────────────────────────────────

/**
 * Print a summary table to the console.
 */
export function printSummary(report: BenchmarkReport): void {
  const { summary, results } = report;
  const surface = report.config?.surface ?? 'unknown';

  // Collect model display info
  const modelNameMap = new Map<string, string>();
  const modelTierMap = new Map<string, string>();
  for (const r of results) {
    modelNameMap.set(r.model.id, r.model.name);
    modelTierMap.set(r.model.id, r.model.tier);
  }

  // Column widths
  const COL_MODEL = 24;
  const COL_TIER = 10;
  const COL_PASS = 11;
  const COL_RECALL = 9;

  const divider =
    '+' +
    '─'.repeat(COL_MODEL + 2) +
    '+' +
    '─'.repeat(COL_TIER + 2) +
    '+' +
    '─'.repeat(COL_PASS + 2) +
    '+' +
    '─'.repeat(COL_RECALL + 2) +
    '+';

  console.log(`\nSkill Benchmark — Surface-Based SDK/CLI/MCP Evaluation (surface: ${surface})`);
  console.log(divider);
  console.log(
    '| ' +
      padR('Model', COL_MODEL) +
      ' | ' +
      padR('Tier', COL_TIER) +
      ' | ' +
      center('Pass Rate', COL_PASS) +
      ' | ' +
      center('Recall', COL_RECALL) +
      ' |',
  );
  console.log(divider);

  // Sort by pass rate descending
  const modelEntries = Object.entries(summary.perModel).sort(
    ([, a], [, b]) => b.passRate - a.passRate,
  );

  for (const [modelId, ms] of modelEntries) {
    const name = modelNameMap.get(modelId) ?? modelId;
    const tier = modelTierMap.get(modelId) ?? '—';
    console.log(
      '| ' +
        padR(name, COL_MODEL) +
        ' | ' +
        padR(tier, COL_TIER) +
        ' | ' +
        center(pct(ms.passRate), COL_PASS) +
        ' | ' +
        center(fixed2(ms.avgRecall), COL_RECALL) +
        ' |',
    );
  }

  console.log(divider);
  console.log('');

  // Overall stats
  console.log('Overall Statistics:');
  console.log(`  Pass Rate:      ${pct(summary.overallPassRate)}`);
  console.log(`  Avg Recall:     ${fixed2(summary.avgToolRecall)}`);
  console.log(`  Coverage:       ${pct(summary.methodCoveragePercent)}`);
  console.log(`  Evaluations:    ${summary.totalEvaluations} (${summary.totalTasks} tasks × ${summary.totalModels} models)`);
  console.log('');

}

import { readFileSync } from 'node:fs';
import type { BenchmarkReport, ComparisonReport, TaskDelta, Delta } from './types.js';

/**
 * Load a benchmark report from a JSON file.
 */
export function loadReport(path: string): BenchmarkReport {
  return JSON.parse(readFileSync(path, 'utf-8')) as BenchmarkReport;
}

/**
 * Compare baseline and current reports. Compute deltas for each task×model pair.
 */
export function compareReports(
  baseline: BenchmarkReport,
  current: BenchmarkReport,
): ComparisonReport {
  // Build lookup maps keyed by "taskId:modelId"
  const baselineMap = new Map<string, { passed: boolean; recall: number; toolSelection: number }>();
  for (const r of baseline.results) {
    const key = `${r.task.id}:${r.model.id}`;
    baselineMap.set(key, {
      passed: r.metrics.taskPassed,
      recall: r.metrics.toolRecall,
      toolSelection: r.metrics.toolSelectionAccuracy,
    });
  }

  const currentMap = new Map<string, { passed: boolean; recall: number; toolSelection: number; taskId: string; modelId: string }>();
  for (const r of current.results) {
    const key = `${r.task.id}:${r.model.id}`;
    currentMap.set(key, {
      passed: r.metrics.taskPassed,
      recall: r.metrics.toolRecall,
      toolSelection: r.metrics.toolSelectionAccuracy,
      taskId: r.task.id,
      modelId: r.model.id,
    });
  }

  // Collect all unique keys from both reports
  const allKeys = new Set<string>([...baselineMap.keys(), ...currentMap.keys()]);

  const taskDeltas: TaskDelta[] = [];
  let improved = 0;
  let regressed = 0;
  let unchanged = 0;

  for (const key of allKeys) {
    const [taskId, ...modelParts] = key.split(':');
    const modelId = modelParts.join(':'); // model IDs may contain ':'

    const inBaseline = baselineMap.get(key);
    const inCurrent = currentMap.get(key);

    let delta: Delta;
    let passedBefore = false;
    let passedNow = false;
    let recallBefore = 0;
    let recallNow = 0;

    if (inBaseline && inCurrent) {
      passedBefore = inBaseline.passed;
      passedNow = inCurrent.passed;
      recallBefore = inBaseline.recall;
      recallNow = inCurrent.recall;

      if (!passedBefore && passedNow) {
        delta = 'improved';
        improved++;
      } else if (passedBefore && !passedNow) {
        delta = 'regressed';
        regressed++;
      } else {
        delta = 'unchanged';
        unchanged++;
      }
    } else if (inCurrent && !inBaseline) {
      passedNow = inCurrent.passed;
      recallNow = inCurrent.recall;
      delta = 'new';
      // 'new' entries don't count toward improved/regressed/unchanged
    } else {
      // only in baseline
      passedBefore = inBaseline!.passed;
      recallBefore = inBaseline!.recall;
      delta = 'removed';
      // 'removed' entries don't count toward improved/regressed/unchanged
    }

    taskDeltas.push({
      taskId: taskId ?? key,
      modelId,
      passedBefore,
      passedNow,
      delta,
      recallBefore,
      recallNow,
      toolSelectionBefore: inBaseline?.toolSelection ?? 0,
      toolSelectionNow: inCurrent?.toolSelection ?? 0,
    });
  }

  // Sort for stable output: regressions first, then improvements, then unchanged
  const deltaOrder: Record<Delta, number> = {
    regressed: 0,
    improved: 1,
    new: 2,
    removed: 3,
    unchanged: 4,
  };
  taskDeltas.sort((a, b) => {
    const orderDiff = deltaOrder[a.delta] - deltaOrder[b.delta];
    if (orderDiff !== 0) return orderDiff;
    if (a.taskId < b.taskId) return -1;
    if (a.taskId > b.taskId) return 1;
    return a.modelId.localeCompare(b.modelId);
  });

  // Coverage delta
  const coverageBefore = baseline.summary.methodCoveragePercent;
  const coverageNow = current.summary.methodCoveragePercent;

  // Accuracy delta — read from overallPassRate
  const accuracyBefore = baseline.summary.overallPassRate;
  const accuracyNow = current.summary.overallPassRate;

  return {
    baseline: {
      timestamp: baseline.timestamp,
      skillVersion: baseline.skillVersion,
    },
    current: {
      timestamp: current.timestamp,
      skillVersion: current.skillVersion,
    },
    taskDeltas,
    summary: {
      improved,
      regressed,
      unchanged,
      coverageBefore,
      coverageNow,
      accuracyBefore,
      accuracyNow,
    },
  };
}

/**
 * Print comparison to console.
 */
export function printComparison(comparison: ComparisonReport): void {
  const { baseline, current, taskDeltas, summary } = comparison;

  const baseSha = baseline.skillVersion.commitSha.slice(0, 8);
  const curSha = current.skillVersion.commitSha.slice(0, 8);

  console.log('');
  console.log(`Skill Version: ${baseSha} → ${curSha}`);
  console.log(`Baseline:      ${new Date(baseline.timestamp).toUTCString()}`);
  console.log(`Current:       ${new Date(current.timestamp).toUTCString()}`);
  console.log('');

  // Column widths
  const COL_TASK = 26;
  const COL_MODEL = 20;
  const COL_BEFORE = 10;
  const COL_AFTER = 10;
  const COL_DELTA = 12;

  // Header
  const header =
    padR('Task', COL_TASK) +
    '  ' +
    padR('Model', COL_MODEL) +
    '  ' +
    padR('Baseline', COL_BEFORE) +
    '  ' +
    padR('Current', COL_AFTER) +
    '  ' +
    'Delta';
  console.log(header);
  console.log('─'.repeat(header.length + COL_DELTA));

  // Rows — only print non-unchanged entries first, then unchanged if any
  const interesting = taskDeltas.filter(d => d.delta !== 'unchanged');
  const unchangedDeltas = taskDeltas.filter(d => d.delta === 'unchanged');

  const printRow = (d: TaskDelta): void => {
    const before = d.delta === 'new' ? '—' : d.passedBefore ? '✅' : '❌';
    const after = d.delta === 'removed' ? '—' : d.passedNow ? '✅' : '❌';

    let deltaLabel: string;
    switch (d.delta) {
      case 'improved':
        deltaLabel = 'IMPROVED ↑';
        break;
      case 'regressed':
        deltaLabel = 'REGRESSED ↓';
        break;
      case 'new':
        deltaLabel = 'new';
        break;
      case 'removed':
        deltaLabel = 'removed';
        break;
      default:
        deltaLabel = 'unchanged';
    }

    // Shorten model ID for display (use last segment after '/')
    const modelDisplay = d.modelId.includes('/') ? d.modelId.split('/').pop()! : d.modelId;

    console.log(
      padR(d.taskId, COL_TASK) +
        '  ' +
        padR(modelDisplay.slice(0, COL_MODEL), COL_MODEL) +
        '  ' +
        padR(before, COL_BEFORE) +
        '  ' +
        padR(after, COL_AFTER) +
        '  ' +
        deltaLabel,
    );
  };

  for (const d of interesting) {
    printRow(d);
  }

  if (interesting.length > 0 && unchangedDeltas.length > 0) {
    console.log(`  ... and ${unchangedDeltas.length} unchanged result(s)`);
  } else if (unchangedDeltas.length > 0 && interesting.length === 0) {
    console.log(`  All ${unchangedDeltas.length} result(s) unchanged.`);
  }

  console.log('');
  console.log(
    `Summary: ${summary.improved} improved, ${summary.regressed} regressed, ${summary.unchanged} unchanged`,
  );
  console.log(
    `Coverage: ${(summary.coverageBefore * 100).toFixed(1)}% → ${(summary.coverageNow * 100).toFixed(1)}%`,
  );
  console.log(
    `Accuracy: ${(summary.accuracyBefore * 100).toFixed(1)}% → ${(summary.accuracyNow * 100).toFixed(1)}%`,
  );
  console.log('');
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function padR(s: string, w: number): string {
  return s.length >= w ? s.slice(0, w) : s + ' '.repeat(w - s.length);
}

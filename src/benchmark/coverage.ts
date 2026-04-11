import type { TaskDefinition, MethodCoverage } from './types.js';
import { getExpectedActions, getExpectedActionName } from './types.js';

// ── Coverage computation ───────────────────────────────────────────────────

/**
 * Compute which methods are covered by at least one task in the task suite.
 *
 * @param tasks - The task definitions to check coverage against
 * @param allMethods - The full list of known methods (from config.code.methods or MCP tool names)
 */
export function computeCoverage(tasks: TaskDefinition[], allMethods: string[]): MethodCoverage[] {
  return allMethods.map((method) => {
    const tasksCovering: string[] = [];

    for (const task of tasks) {
      const covers = getExpectedActions(task).some((tool) => getExpectedActionName(tool) === method);
      if (covers) {
        tasksCovering.push(task.id);
      }
    }

    return {
      method,
      tasksCovering,
      covered: tasksCovering.length > 0,
    };
  });
}

// ── Coverage report ────────────────────────────────────────────────────────

/**
 * Print a coverage report to console.
 *
 * Example output:
 *   SDK Method Coverage:
 *   ✔ MyClient.constructor      (3 tasks)
 *   ✘ MyClient.submit           (0 tasks)
 *
 *   Coverage: 14/17 methods (82%)
 */
export function printCoverage(coverage: MethodCoverage[]): void {
  console.log('SDK Method Coverage:');

  const maxMethodLen = Math.max(...coverage.map((c) => c.method.length));

  for (const entry of coverage) {
    const icon = entry.covered ? '✔' : '✘';
    const padded = entry.method.padEnd(maxMethodLen);
    const taskCount = entry.tasksCovering.length;
    const taskLabel = taskCount === 1 ? 'task' : 'tasks';
    console.log(`${icon} ${padded}  (${taskCount} ${taskLabel})`);
  }

  const coveredCount = coverage.filter((c) => c.covered).length;
  const totalCount = coverage.length;
  const percent = totalCount === 0 ? 0 : Math.round((coveredCount / totalCount) * 100);

  console.log('');
  console.log(`Coverage: ${coveredCount}/${totalCount} methods (${percent}%)`);
}

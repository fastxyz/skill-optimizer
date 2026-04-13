import type { ActionDefinition } from '../actions/types.js';
import type { GeneratedTask } from './types.js';
import type { CoverageReport } from '../benchmark/types.js';

function actionNamesOf(task: GeneratedTask): string[] {
  const list = task.expected_actions ?? task.expected_tools ?? [];
  return list.map((a) => a.name ?? a.method ?? '').filter(Boolean);
}

export function computeCoverage(
  actions: ActionDefinition[],
  tasks: GeneratedTask[],
  outOfScopeActions: ActionDefinition[] = [],
): CoverageReport {
  const tasksPerAction: Record<string, number> = {};
  for (const action of actions) tasksPerAction[action.name] = 0;
  for (const task of tasks) {
    for (const name of actionNamesOf(task)) {
      if (name in tasksPerAction) tasksPerAction[name] += 1;
    }
  }
  const covered = actions.filter((a) => tasksPerAction[a.name] > 0).map((a) => a.name);
  const uncovered = actions.filter((a) => tasksPerAction[a.name] === 0).map((a) => a.name);
  return {
    inScopeActions: actions.map((a) => a.name),
    outOfScopeActions: outOfScopeActions.map((a) => a.name),
    coveredActions: covered,
    uncoveredActions: uncovered,
    tasksPerAction,
    coverageViolation: uncovered.length > 0,
  };
}

export function computeUncovered(actions: ActionDefinition[], tasks: GeneratedTask[]): string[] {
  return computeCoverage(actions, tasks).uncoveredActions;
}

export function buildRetryPrompt(uncovered: string[]): string {
  return [
    'The prior pass did not cover these actions. Generate tasks for EACH of them.',
    'Exactly one task per action minimum. Use only arguments documented in the surface snapshot.',
    '',
    'Uncovered actions:',
    ...uncovered.map((name) => `- ${name}`),
  ].join('\n');
}

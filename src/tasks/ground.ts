import { getExpectedActionName } from '../benchmark/types.js';
import type { SurfaceSnapshot } from '../project/types.js';

import type { GeneratedTask, GroundedTasksResult } from './types.js';

export function groundTasks(tasks: GeneratedTask[], snapshot: SurfaceSnapshot): GroundedTasksResult {
  const kept: GeneratedTask[] = [];
  const rejected: Array<{ task: GeneratedTask; reason: string }> = [];

  const seenIds = new Set<string>();
  const actions = new Map(snapshot.actions.map((action) => [action.name, action]));

  for (const task of tasks) {
    const rejection = getRejectionReason(task, seenIds, actions);
    if (rejection) {
      rejected.push({ task, reason: rejection });
      continue;
    }

    seenIds.add(task.id);
    kept.push(task);
  }

  return { kept, rejected };
}

function getRejectionReason(
  task: GeneratedTask,
  seenIds: Set<string>,
  actions: Map<string, SurfaceSnapshot['actions'][number]>,
): string | null {
  const expectedActions = task.expected_actions ?? task.expected_tools ?? [];
  if (seenIds.has(task.id)) {
    return `duplicate task id "${task.id}"`;
  }

  if (!Array.isArray(expectedActions) || expectedActions.length === 0) {
    return `task "${task.id}" has empty expected_actions`;
  }

  for (const expectedAction of expectedActions) {
    const actionName = getExpectedActionName(expectedAction);
    const action = actions.get(actionName);
    if (!action) {
      return `task "${task.id}" uses unknown method/action "${actionName}"`;
    }

    const args = expectedAction.args ?? {};
    const allowedKeys = new Set(action.args.map((arg) => arg.name));

    for (const key of Object.keys(args)) {
      if (!allowedKeys.has(key)) {
        return `task "${task.id}" uses unknown arg key "${key}" for action "${actionName}"`;
      }
    }

    for (const requiredArg of action.args.filter((arg) => arg.required)) {
      if (!(requiredArg.name in args)) {
        return `task "${task.id}" is missing required param "${requiredArg.name}" for action "${actionName}"`;
      }
    }
  }

  return null;
}

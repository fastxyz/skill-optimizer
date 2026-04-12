import type { TaskResult } from '../../benchmark/types.js';

export interface PassingFailingDiff {
  task_id: string;
  prompt: string;
  passing_models: string[];
  failing_models: string[];
  passing_calls: Array<{ model: string; actions: string[] }>;
  failing_calls: Array<{ model: string; actions: string[] }>;
}

export function buildPassingFailingDiff(results: TaskResult[]): PassingFailingDiff[] {
  const byTask = new Map<string, TaskResult[]>();
  for (const r of results) {
    const arr = byTask.get(r.task.id) ?? [];
    arr.push(r);
    byTask.set(r.task.id, arr);
  }

  const diffs: PassingFailingDiff[] = [];
  for (const [taskId, rs] of byTask) {
    const passing = rs.filter((r) => r.metrics.taskPassed);
    const failing = rs.filter((r) => !r.metrics.taskPassed);
    if (passing.length === 0 || failing.length === 0) continue;
    diffs.push({
      task_id: taskId,
      prompt: rs[0]!.task.prompt,
      passing_models: passing.map((r) => r.model.name),
      failing_models: failing.map((r) => r.model.name),
      passing_calls: passing.map((r) => ({
        model: r.model.name,
        actions: r.extractedCalls.map((c) => (c as unknown as { method: string }).method ?? ''),
      })),
      failing_calls: failing.map((r) => ({
        model: r.model.name,
        actions: r.extractedCalls.map((c) => (c as unknown as { method: string }).method ?? ''),
      })),
    });
  }
  return diffs;
}

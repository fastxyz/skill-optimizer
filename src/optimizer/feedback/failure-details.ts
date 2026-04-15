import type { TaskResult } from '../../benchmark/types.js';
import { getExpectedActionName } from '../../benchmark/types.js';

export type FailureKind = 'missing-tool' | 'bad-args' | 'hallucination' | 'error';

export interface FailureDetail {
  task_id: string;
  model_id: string;
  kind: FailureKind;
  expected_action: string;
  expected_args: Record<string, unknown>;
  actual_calls: Array<{ action: string; args: Record<string, unknown> }>;
  mismatch_detail: string;
}

export function extractFailureDetails(results: TaskResult[]): FailureDetail[] {
  const out: FailureDetail[] = [];
  for (const r of results) {
    if (r.metrics.taskPassed) continue;

    const actual = r.extractedCalls.map((c) => ({
      action: c.method,
      args: c.args,
    }));

    if (r.error) {
      out.push({
        task_id: r.task.id,
        model_id: r.model.id,
        kind: 'error',
        expected_action: '',
        expected_args: {},
        actual_calls: actual,
        mismatch_detail: r.error,
      });
      continue;
    }

    const matches = r.actionMatches ?? r.toolMatches;
    for (const m of matches) {
      const expectedName = getExpectedActionName(m.expected);
      // Cross-check whether the expected method actually appears in extracted calls,
      // regardless of the methodFound flag (fixture data may set methodFound=false even
      // when the method name is present but args differ).
      const methodActuallyFound = m.methodFound
        || actual.some((a) => a.action === expectedName);
      if (!methodActuallyFound) {
        const alts = actual.map((a) => a.action).filter(Boolean);
        out.push({
          task_id: r.task.id,
          model_id: r.model.id,
          kind: 'missing-tool',
          expected_action: expectedName,
          expected_args: m.expected.args ?? {},
          actual_calls: actual,
          mismatch_detail: alts.length > 0 ? `called ${alts.join(', ')} instead` : 'no action calls produced',
        });
      } else if (!m.argsCorrect) {
        const wrongArgs: string[] = [];
        for (const [k, v] of Object.entries(m.argResults ?? {})) {
          if (!v.match) wrongArgs.push(`${k}: expected ${v.expected}, got ${JSON.stringify(v.got)}`);
        }
        out.push({
          task_id: r.task.id,
          model_id: r.model.id,
          kind: 'bad-args',
          expected_action: expectedName,
          expected_args: m.expected.args ?? {},
          actual_calls: actual,
          mismatch_detail: wrongArgs.join('; ') || 'args differed',
        });
      }
    }

    if (r.metrics.hallucinatedCalls?.length) {
      out.push({
        task_id: r.task.id,
        model_id: r.model.id,
        kind: 'hallucination',
        expected_action: matches.map((m) => getExpectedActionName(m.expected)).join(', '),
        expected_args: {},
        actual_calls: actual,
        mismatch_detail: `hallucinated: ${r.metrics.hallucinatedCalls.join(', ')}`,
      });
    }
  }
  return out;
}

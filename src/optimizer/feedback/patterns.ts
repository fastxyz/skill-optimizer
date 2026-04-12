import type { FailureDetail } from './failure-details.js';

export type PatternKind = 'naming-mismatch' | 'systematic-hallucination' | 'arg-type-confusion';

export interface Pattern {
  kind: PatternKind;
  summary: string;
  modelCount: number;
  taskCount: number;
  evidence: string[];
}

export function detectPatterns(details: FailureDetail[]): Pattern[] {
  const patterns: Pattern[] = [];

  const hallucinationKey: Record<string, { tasks: Set<string>; models: Set<string> }> = {};
  for (const d of details) {
    if (d.kind === 'missing-tool') {
      for (const call of d.actual_calls) {
        if (call.action && call.action !== d.expected_action) {
          const key = `${d.expected_action}→${call.action}`;
          if (!hallucinationKey[key]) hallucinationKey[key] = { tasks: new Set(), models: new Set() };
          hallucinationKey[key].tasks.add(d.task_id);
          hallucinationKey[key].models.add(d.model_id);
        }
      }
    }
  }
  for (const [key, s] of Object.entries(hallucinationKey)) {
    if (s.models.size >= 2) {
      patterns.push({
        kind: 'systematic-hallucination',
        summary: `Multiple models substitute ${key}`,
        modelCount: s.models.size,
        taskCount: s.tasks.size,
        evidence: [...s.tasks],
      });
    }
  }

  const argConfusion: Record<string, { tasks: Set<string>; models: Set<string>; evidence: string[] }> = {};
  for (const d of details) {
    if (d.kind === 'bad-args') {
      for (const line of d.mismatch_detail.split(';')) {
        const keyMatch = line.match(/^\s*([A-Za-z0-9_]+):/);
        if (keyMatch) {
          const argKey = `${d.expected_action}.${keyMatch[1]}`;
          if (!argConfusion[argKey]) argConfusion[argKey] = { tasks: new Set(), models: new Set(), evidence: [] };
          argConfusion[argKey].tasks.add(d.task_id);
          argConfusion[argKey].models.add(d.model_id);
          argConfusion[argKey].evidence.push(line.trim());
        }
      }
    }
  }
  for (const [key, s] of Object.entries(argConfusion)) {
    if (s.tasks.size >= 2) {
      patterns.push({
        kind: 'arg-type-confusion',
        summary: `Arg ${key} confused across ${s.tasks.size} tasks`,
        modelCount: s.models.size,
        taskCount: s.tasks.size,
        evidence: [...new Set(s.evidence)].slice(0, 5),
      });
    }
  }

  return patterns;
}

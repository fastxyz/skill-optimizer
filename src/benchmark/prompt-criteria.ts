import type { GeneratedTask } from '../tasks/types.js';
import type { PromptCapabilityWithSection } from '../project/discover-prompt.js';
import type { PromptEvaluationCriteria } from './prompt-evaluator.js';
import { generateCriteriaFromCapability } from './prompt-evaluator.js';

export interface ResolvedPromptCriteria {
  criteria: PromptEvaluationCriteria;
  noActiveCriteria: boolean;
}

function isEmptyCriteria(c: PromptEvaluationCriteria): boolean {
  const s = (c.requiredSections?.length ?? 0) === 0;
  const k = (c.requiredKeywords?.length ?? 0) === 0 && (c.forbiddenKeywords?.length ?? 0) === 0;
  const f = (c.formatPatterns?.length ?? 0) === 0 && (c.minLength ?? 0) === 0;
  const structure =
    c.hasCodeBlocks === undefined &&
    c.hasNumberedList === undefined &&
    c.hasTable === undefined;
  return s && k && f && structure;
}

export function resolveCriteriaForTask(
  task: GeneratedTask,
  caps: readonly PromptCapabilityWithSection[],
): ResolvedPromptCriteria {
  if (!task.capabilityId) {
    throw new Error(
      `Task ${task.id}: prompt-surface task is missing capabilityId. ` +
      `Regenerate tasks with \`skill-optimizer generate-tasks\`.`,
    );
  }
  const cap = caps.find((c) => c.action.key === task.capabilityId);
  if (!cap) {
    const known = caps.map((c) => c.action.key).join(', ') || '(none discovered)';
    throw new Error(
      `Task ${task.id}: capabilityId "${task.capabilityId}" is not in the discovered capability set. Known: ${known}`,
    );
  }
  const criteria = generateCriteriaFromCapability(cap.action, cap.section);
  return { criteria, noActiveCriteria: isEmptyCriteria(criteria) };
}

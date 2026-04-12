import type { BenchmarkReport } from '../benchmark/types.js';
import { buildMutationContext } from '../optimizer/feedback/mutation-context.js';

export interface Recommendation {
  priority: 'high' | 'medium' | 'low';
  area: string;
  action: string;
  rationale: string;
}

export interface CriticDeps {
  complete: (args: { system: string; prompt: string }) => Promise<string>;
}

export async function generateRecommendations(
  report: BenchmarkReport,
  deps: CriticDeps,
  contextMaxBytes: number = 16_000,
): Promise<Recommendation[]> {
  if (!report.verdict || report.verdict.result !== 'FAIL') return [];

  const ctx = buildMutationContext(report, contextMaxBytes);
  const system = 'You review benchmark failures and produce actionable skill / doc / SDK improvement recommendations. JSON array only.';
  const prompt = [
    'Return a JSON array of {priority:"high"|"medium"|"low", area:string, action:string, rationale:string}.',
    'Focus on concrete edits, not generic advice.',
    '',
    `Verdict: FAIL — ${report.verdict.reasons.join('; ')}`,
    '',
    ctx.serialized,
  ].join('\n');

  let raw: string;
  try {
    raw = await deps.complete({ system, prompt });
  } catch {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((r) => r && typeof r === 'object')
      .map((r) => ({
        priority: (['high', 'medium', 'low'].includes((r as { priority?: string }).priority ?? '')
          ? (r as { priority: 'high' | 'medium' | 'low' }).priority
          : 'medium'),
        area: String((r as { area?: string }).area ?? 'unspecified'),
        action: String((r as { action?: string }).action ?? ''),
        rationale: String((r as { rationale?: string }).rationale ?? ''),
      }))
      .filter((r) => r.action.length > 0);
  } catch {
    return [];
  }
}

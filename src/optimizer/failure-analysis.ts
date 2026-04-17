import type { BenchmarkReport } from '../benchmark/types.js';
import type { FailureBucket, FailureBucketKind } from './types.js';

const BUCKET_PRIORITY: Record<FailureBucketKind, number> = {
  'missing-tool': 0,
  'bad-args': 1,
  hallucination: 2,
  error: 3,
};

export function analyzeFailures(report: BenchmarkReport): FailureBucket[] {
  const grouped = new Map<FailureBucketKind, FailureBucket>();

  for (const result of report.results) {
    const kind = classifyFailure(result);
    if (!kind) continue;

    const bucket = grouped.get(kind) ?? {
      kind,
      count: 0,
      taskIds: [],
      modelIds: [],
    };

    bucket.count += 1;
    if (!bucket.taskIds.includes(result.task.id)) bucket.taskIds.push(result.task.id);
    if (!bucket.modelIds.includes(result.model.id)) bucket.modelIds.push(result.model.id);
    grouped.set(kind, bucket);
  }

  return [...grouped.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return BUCKET_PRIORITY[a.kind] - BUCKET_PRIORITY[b.kind];
  });
}

function classifyFailure(result: BenchmarkReport['results'][number]): FailureBucketKind | null {
  if (result.error) return 'error';
  if (result.metrics.hallucinatedActions.length > 0) return 'hallucination';
  if (result.actionMatches.some((match) => match.methodFound && !match.argsCorrect)) return 'bad-args';
  if (result.actionMatches.some((match) => !match.methodFound)) return 'missing-tool';
  return null;
}

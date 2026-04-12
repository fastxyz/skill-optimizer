import type { BenchmarkReport } from '../../benchmark/types.js';
import { extractFailureDetails, type FailureDetail } from './failure-details.js';
import { detectPatterns, type Pattern } from './patterns.js';
import { buildPassingFailingDiff, type PassingFailingDiff } from './passing-failing-diff.js';

export interface FeedbackPackage {
  failureDetails: FailureDetail[];
  patterns: Pattern[];
  passingFailingDiffs: PassingFailingDiff[];
  serialized: string;
}

export function buildMutationContext(report: BenchmarkReport, maxBytes: number): FeedbackPackage {
  const failureDetails = extractFailureDetails(report.results);
  const patterns = detectPatterns(failureDetails);
  const diffs = buildPassingFailingDiff(report.results);

  const details = budgetSlice(failureDetails, Math.floor(maxBytes * 0.3));
  const patternSlice = budgetSlice(patterns, Math.floor(maxBytes * 0.4));
  const diffSlice = budgetSlice(diffs, Math.floor(maxBytes * 0.3));

  const serialized = [
    '## Failure details',
    JSON.stringify(details, null, 2),
    '',
    '## Cross-task patterns',
    JSON.stringify(patternSlice, null, 2),
    '',
    '## Passing vs failing by task',
    JSON.stringify(diffSlice, null, 2),
  ].join('\n');

  return { failureDetails: details, patterns: patternSlice, passingFailingDiffs: diffSlice, serialized };
}

function budgetSlice<T>(items: T[], maxBytes: number): T[] {
  const kept: T[] = [];
  let bytes = 0;
  for (const item of items) {
    const size = Buffer.byteLength(JSON.stringify(item));
    if (bytes + size > maxBytes) break;
    kept.push(item);
    bytes += size;
  }
  return kept;
}

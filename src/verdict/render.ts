import type { BenchmarkReport, CoverageReport } from '../benchmark/types.js';
import type { Recommendation } from './recommendations.js';

export function renderVerdictConsole(
  report: BenchmarkReport,
  recommendations: Recommendation[],
): string {
  const lines: string[] = [];
  lines.push('');
  lines.push('=== Verdict ===');
  if (!report.verdict) {
    lines.push('No verdict policy configured.');
    return lines.join('\n');
  }
  lines.push(`Result: ${report.verdict.result}`);
  for (const reason of report.verdict.reasons) {
    lines.push(`  - ${reason}`);
  }
  lines.push(renderCoverageBlock(report.scopeCoverage));
  if (recommendations.length > 0) {
    lines.push('');
    lines.push('Recommendations:');
    for (const rec of recommendations) {
      lines.push(`  [${rec.priority}] ${rec.area}: ${rec.action}`);
      if (rec.rationale) lines.push(`      ${rec.rationale}`);
    }
  }
  return lines.join('\n');
}

export function renderVerdictMarkdown(
  report: BenchmarkReport,
  recommendations: Recommendation[],
): string {
  if (!report.verdict) return '';
  const lines: string[] = [];
  lines.push('## Verdict');
  lines.push(`- **Result:** ${report.verdict.result}`);
  lines.push(`- **Per-model floor:** ${(report.verdict.policy.perModelFloor * 100).toFixed(1)}%`);
  lines.push(`- **Target weighted average:** ${(report.verdict.policy.targetWeightedAverage * 100).toFixed(1)}%`);
  if (report.verdict.reasons.length > 0) {
    lines.push('');
    lines.push('**Reasons:**');
    for (const r of report.verdict.reasons) lines.push(`- ${r}`);
  }
  const cov = renderCoverageBlockMarkdown(report.scopeCoverage);
  if (cov) { lines.push(''); lines.push(cov); }
  if (recommendations.length > 0) {
    lines.push('');
    lines.push('## Recommendations');
    for (const rec of recommendations) {
      lines.push(`- **[${rec.priority}] ${rec.area}** — ${rec.action}`);
      if (rec.rationale) lines.push(`  - _${rec.rationale}_`);
    }
  }
  return lines.join('\n');
}

function renderCoverageBlock(cov?: CoverageReport): string {
  if (!cov) return '';
  const total = cov.inScopeActions.length;
  const covered = cov.coveredActions.length;
  const pct = total > 0 ? (covered / total) * 100 : 0;
  const lines = [
    '',
    'Surface coverage:',
    `  In scope:      ${total} action(s)`,
    `  Out of scope:  ${cov.outOfScopeActions.length} action(s)`,
    `  Covered:       ${covered} / ${total} (${pct.toFixed(0)}%)`,
  ];
  if (cov.uncoveredActions.length > 0) {
    lines.push(`  Uncovered:     ${cov.uncoveredActions.join(', ')}`);
  }
  return lines.join('\n');
}

function renderCoverageBlockMarkdown(cov?: CoverageReport): string {
  if (!cov) return '';
  const total = cov.inScopeActions.length;
  const covered = cov.coveredActions.length;
  const pct = total > 0 ? (covered / total) * 100 : 0;
  const lines: string[] = [
    '## Coverage',
    `- In scope: ${total}`,
    `- Out of scope: ${cov.outOfScopeActions.length}`,
    `- Covered: ${covered}/${total} (${pct.toFixed(0)}%)`,
  ];
  if (cov.uncoveredActions.length > 0) {
    lines.push(`- Uncovered: ${cov.uncoveredActions.join(', ')}`);
  }
  return lines.join('\n');
}

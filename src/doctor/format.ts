import type { Issue } from '../project/validate.js';

const R = '\x1b[0m';
const RED = '\x1b[31m';
const YEL = '\x1b[33m';
const GRN = '\x1b[32m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';

function icon(severity: Issue['severity']): string {
  if (severity === 'error') return `${RED}✗${R}`;
  if (severity === 'warning') return `${YEL}⚠${R}`;
  return `${GRN}✓${R}`;
}

export function formatIssues(issues: Issue[], configPath: string): string {
  const lines: string[] = [];
  lines.push(`\n${BOLD}skill-optimizer doctor${R} — ${configPath}\n`);

  for (const issue of issues.filter((i) => i.severity !== 'info' || i.code === 'discovery-ok')) {
    const label = issue.code === 'discovery-ok' ? 'discovery' : issue.field;
    const pad = ' '.repeat(Math.max(1, 32 - label.length));
    lines.push(`  ${icon(issue.severity)} ${label}${pad}${issue.message}`);
    if (issue.hint) lines.push(`      ${DIM}hint: ${issue.hint}${R}`);
    if (issue.fixable) lines.push(`      ${DIM}(auto-fixable with --fix)${R}`);
  }

  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  const fixable = issues.filter((i) => i.fixable).length;

  lines.push('');
  if (errors.length === 0 && warnings.length === 0) {
    lines.push(`${GRN}No issues found — config is valid${R}`);
  } else {
    let summary = `${errors.length} error(s), ${warnings.length} warning(s)`;
    if (fixable > 0) summary += ` — run with ${BOLD}--fix${R} to apply ${fixable} auto-fixable change(s)`;
    lines.push(summary);
  }

  return lines.join('\n');
}

export function formatFixResult(appliedCount: number, remainingIssues: Issue[], configPath: string): string {
  return [
    `\n  Applied ${appliedCount} fix(es) to ${configPath}`,
    `  Re-running checks...\n`,
    formatIssues(remainingIssues, configPath),
  ].join('\n');
}

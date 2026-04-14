import type { BenchmarkReport } from '../benchmark/types.js';
import type { OptimizeIteration } from './types.js';

function pct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function delta(before: number, after: number): string {
  const d = (after - before) * 100;
  return d >= 0 ? `+${d.toFixed(1)}%` : `${d.toFixed(1)}%`;
}

function modelDisplayName(id: string): string {
  // Strip openrouter/ prefix for readability
  return id.startsWith('openrouter/') ? id.slice('openrouter/'.length) : id;
}

function pad(s: string, width: number, align: 'left' | 'right' | 'center' = 'right'): string {
  if (s.length >= width) return s;
  const spaces = width - s.length;
  if (align === 'left') return s + ' '.repeat(spaces);
  if (align === 'center') {
    const left = Math.floor(spaces / 2);
    return ' '.repeat(left) + s + ' '.repeat(spaces - left);
  }
  return ' '.repeat(spaces) + s;
}

export function renderProgressTable(
  baselineReport: BenchmarkReport,
  bestReport: BenchmarkReport,
  iterations: OptimizeIteration[],
): string {
  // Only iterations where a benchmark actually ran (scoreAfter is set)
  const benchedIterations = iterations.filter(it => it.scoreAfter !== undefined);

  // Collect all model IDs from baseline (same set across all runs)
  const modelIds = Object.keys(baselineReport.summary.perModel);
  if (modelIds.length === 0 && benchedIterations.length === 0) return '';

  // Display names
  const displayNames = modelIds.map(modelDisplayName);
  const modelColWidth = Math.max(
    'Model'.length,
    'Overall'.length,
    ...displayNames.map(n => n.length),
  );

  // Column headers: Baseline | I1 | I2 | ... | Final | Δ
  const iterHeaders = benchedIterations.map(it => `I${it.index}`);
  const dataColWidth = 8; // enough for "100.0%  " or "+100.0%"

  const allHeaders = ['Baseline', ...iterHeaders, 'Final', 'Δ'];
  const colWidths = allHeaders.map(h => Math.max(h.length, dataColWidth));

  function row(label: string, cells: string[]): string {
    const labelCell = pad(label, modelColWidth, 'left');
    const dataCells = cells.map((c, i) => pad(c, colWidths[i]!, 'center'));
    return `│ ${labelCell} │ ${dataCells.join(' │ ')} │`;
  }

  function divider(left: string, mid: string, right: string, sep: string): string {
    const modelSeg = '─'.repeat(modelColWidth + 2);
    const datasegs = colWidths.map(w => '─'.repeat(w + 2));
    return left + modelSeg + sep + datasegs.join(sep) + right;
  }

  function modelRow(modelId: string, displayName: string): string {
    const baseline = baselineReport.summary.perModel[modelId];
    const final = bestReport.summary.perModel[modelId];
    if (!baseline || !final) return row(displayName, allHeaders.map(() => '—'));

    const iterCells = benchedIterations.map(it => {
      const pm = it.perModelAfter?.[modelId];
      return pm ? pct(pm.passRate) : '—';
    });

    const d = delta(baseline.passRate, final.passRate);
    return row(displayName, [pct(baseline.passRate), ...iterCells, pct(final.passRate), d]);
  }

  function overallRow(): string {
    const baselineRate = baselineReport.summary.overallPassRate;
    const finalRate = bestReport.summary.overallPassRate;
    const iterCells = benchedIterations.map(it =>
      it.scoreAfter !== undefined ? pct(it.scoreAfter) : '—'
    );
    const d = delta(baselineRate, finalRate);
    return row('Overall', [pct(baselineRate), ...iterCells, pct(finalRate), d]);
  }

  const headerRow = row('Model', allHeaders.map((h, i) => pad(h, colWidths[i]!, 'center').trim()));

  const lines: string[] = [
    '',
    '=== Optimization Progress ===',
    divider('┌', '┬', '┐', '┬'),
    headerRow,
    divider('├', '┼', '┤', '┼'),
    ...modelIds.map((id, i) => modelRow(id, displayNames[i]!)),
    divider('├', '┼', '┤', '┼'),
    overallRow(),
    divider('└', '┴', '┘', '┴'),
  ];

  return lines.join('\n');
}

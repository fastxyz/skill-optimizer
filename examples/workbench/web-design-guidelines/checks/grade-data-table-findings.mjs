import { join } from 'node:path';
import { gradeFindings, range } from './_grader-utils.mjs';

const expected = [
  {
    id: 'layout-read-in-render',
    lines: range(13, 18),
    keywords: [/getBoundingClientRect|layout\s*read|in\s*render/i],
  },
  {
    id: 'large-list-no-virtualization',
    lines: range(30, 40),
    keywords: [/virtualiz/i],
  },
  {
    id: 'tabular-nums-missing',
    lines: range(25, 38),
    keywords: [/tabular-?nums|font-variant-numeric/i],
  },
  {
    id: 'heading-no-text-balance',
    lines: range(19, 23),
    keywords: [/text-balance|text-pretty|text-wrap/i],
  },
  {
    id: 'numeral-spelled-out',
    lines: range(20, 24),
    keywords: [/numeral|spell|"eight"|\beight\b/i],
  },
];

const pass = gradeFindings({
  findingsPath: join(process.env.WORK, 'findings.txt'),
  file: 'DataTable.tsx',
  expected,
});
process.exit(pass ? 0 : 1);

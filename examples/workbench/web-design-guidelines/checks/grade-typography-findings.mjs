import { join } from 'node:path';
import { gradeFindings, range } from './_grader-utils.mjs';

const expected = [
  {
    id: 'three-dots-not-ellipsis',
    lines: range(10, 14),
    keywords: [/\.\.\./, /ellipsis/i, /…/, /loading\s*$|loading\s*[…\.]/i],
  },
  {
    id: 'straight-quotes-not-curly',
    lines: range(11, 15),
    keywords: [/\bquot/i, /curly|smart\s*quotes|typographic/i],
  },
  {
    id: 'missing-nbsp-between-number-and-unit',
    lines: range(12, 16),
    keywords: [/non-?breaking|nbsp|&nbsp;/i],
  },
  {
    id: 'flex-child-no-min-w-0',
    lines: range(13, 20),
    keywords: [/min-w-0|min-?width/i],
  },
  {
    id: 'no-empty-state-handling',
    lines: range(15, 25),
    keywords: [/empty[-\s]+state|empty\s+array|empty\s+list|empty\s*<ul>|unguarded|fallback/i],
  },
];

const pass = gradeFindings({
  findingsPath: join(process.env.WORK, 'findings.txt'),
  file: 'LoadingScreen.tsx',
  expected,
});
process.exit(pass ? 0 : 1);

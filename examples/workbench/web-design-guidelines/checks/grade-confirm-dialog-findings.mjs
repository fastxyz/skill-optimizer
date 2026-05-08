import { join } from 'node:path';
import { gradeFindings, range } from './_grader-utils.mjs';

const expected = [
  {
    id: 'modal-no-overscroll-behavior',
    lines: range(9, 35),
    keywords: [/overscroll/i],
  },
  {
    id: 'missing-touch-action',
    lines: range(9, 35),
    keywords: [/touch-action/i],
  },
  {
    id: 'missing-safe-area-inset',
    lines: range(9, 35),
    keywords: [/safe-area|env\(safe-area/i],
  },
  {
    id: 'autofocus-on-non-primary',
    lines: range(22, 32),
    keywords: [/autofocus|autoFocus/i],
  },
  {
    id: 'button-no-hover-state',
    lines: range(26, 34),
    keywords: [/hover:|\bhover\b\s*state|hover\s*feedback/i],
  },
];

const pass = gradeFindings({
  findingsPath: join(process.env.WORK, 'findings.txt'),
  file: 'ConfirmDialog.tsx',
  expected,
});
process.exit(pass ? 0 : 1);

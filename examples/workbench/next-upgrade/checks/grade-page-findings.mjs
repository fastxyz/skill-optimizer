// Grader: checks findings.txt for v14→v15 violations in app/page.tsx.
//
// Violations:
//   page-viewport     — viewport is inside `metadata` export (line 6)
//   page-searchparams — searchParams prop type is synchronous (line 15)

import { gradeFindings, looseRange, fuzzyKeyword, tolerantKeyword } from './_grader-utils.mjs';
import { join } from 'node:path';

const findingsPath = join(process.env.WORK, 'findings.txt');

gradeFindings({
  findingsPath,
  file: 'app/page.tsx',
  expected: [
    {
      id: 'page-viewport',
      lines: looseRange(6),
      keywords: [fuzzyKeyword('viewport')],
    },
    {
      id: 'page-searchparams',
      lines: looseRange(15),
      keywords: [fuzzyKeyword('searchParams'), /async|Promise/i],
    },
  ],
});

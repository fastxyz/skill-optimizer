// Grader: checks findings.txt for v14→v15 violations in app/[id]/page.tsx.
//
// Violations:
//   id-params — params type is synchronous / must be awaited (lines 4–6)

import { gradeFindings, looseRange, fuzzyKeyword } from './_grader-utils.mjs';
import { join } from 'node:path';

const findingsPath = join(process.env.WORK, 'findings.txt');

gradeFindings({
  findingsPath,
  file: 'app/[id]/page.tsx',
  expected: [
    {
      id: 'id-params',
      // Center on line 5 (midpoint of type at 4 and access at 6), ±8 tolerance
      lines: looseRange(5),
      keywords: [fuzzyKeyword('params'), /async|Promise/i],
    },
  ],
});

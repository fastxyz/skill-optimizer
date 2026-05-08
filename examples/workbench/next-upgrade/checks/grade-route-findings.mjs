// Grader: checks findings.txt for v14→v15 violations in app/api/route.ts.
//
// Violations:
//   route-cookies — cookies() is synchronous (line 5)
//   route-headers — headers() is synchronous (line 6)

import { gradeFindings, looseRange, fuzzyKeyword } from './_grader-utils.mjs';
import { join } from 'node:path';

const findingsPath = join(process.env.WORK, 'findings.txt');

gradeFindings({
  findingsPath,
  file: 'app/api/route.ts',
  expected: [
    {
      id: 'route-cookies',
      lines: looseRange(5),
      keywords: [fuzzyKeyword('cookies')],
    },
    {
      id: 'route-headers',
      lines: looseRange(6),
      keywords: [fuzzyKeyword('headers')],
    },
  ],
});

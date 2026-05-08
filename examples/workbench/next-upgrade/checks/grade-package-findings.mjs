// Grader: checks findings.txt for v14→v15 violations in package.json.
//
// Violations:
//   pkg-version — next version is 14.x, should be upgraded to v15
//
// Line-range note: models consistently report package.json version issues at
// line 1 or 2 (top of file) rather than the dependency line (~12). This is a
// common drift for file-level issues. We accept any line in the file (1–25).
// See lessons.md § G1.

import { gradeFindings, range, tolerantKeyword } from './_grader-utils.mjs';
import { join } from 'node:path';

const findingsPath = join(process.env.WORK, 'findings.txt');

gradeFindings({
  findingsPath,
  file: 'package.json',
  expected: [
    {
      id: 'pkg-version',
      // Accept any line in the file — models report this at line 1 or 2
      lines: range(1, 25),
      keywords: [tolerantKeyword('next'), /14|15|version|upgrade/i],
    },
  ],
});

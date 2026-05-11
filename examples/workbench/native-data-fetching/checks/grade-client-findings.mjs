// Grader for review-client case.
// Checks that findings.txt correctly identifies violations in api/client.ts:
//   V1 (axios-usage)       line 1  — import axios / line 12 — axios.get call
//   V2 (missing-response-ok) line 18 — response.json() without response.ok
//   V3 (asyncstorage-token)  line 35 — AsyncStorage.setItem for auth token

import { join } from 'node:path';
import { gradeFindings, looseRange, fuzzyKeyword, tolerantKeyword } from './_grader-utils.mjs';

const WORK = process.env.WORK;
const findingsPath = join(WORK, 'findings.txt');

gradeFindings({
  findingsPath,
  file: 'api/client.ts',
  expected: [
    {
      id: 'axios-usage',
      // Agent may cite either the import (line 1) or the call (line 12)
      lines: [...looseRange(1, 8), ...looseRange(12, 8)],
      keywords: [/axios/i],
    },
    {
      id: 'missing-response-ok',
      // Line 18: `const data = await response.json()` without prior response.ok check
      lines: looseRange(18, 8),
      keywords: [/response\.ok/i, /\.ok\b/i, /status.*check/i, /check.*status/i, /error.*handl/i, /missing.*check/i],
    },
    {
      id: 'asyncstorage-token',
      // Line 35: `await AsyncStorage.setItem('auth_token', token)`
      lines: looseRange(35, 8),
      keywords: [fuzzyKeyword('AsyncStorage'), tolerantKeyword('SecureStore'), /insecure/i, /secure.*store/i, /not.*secure/i],
    },
  ],
});

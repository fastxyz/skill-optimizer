// Grader for review-dashboard case.
// Checks that findings.txt correctly identifies violations in screens/DashboardScreen.tsx:
//   V4 (expo-public-secret)   line 5  — EXPO_PUBLIC_STRIPE_SECRET_KEY exposes a secret
//   V5 (no-abort-controller)  line 18 — fetch in useEffect with no AbortController cleanup
//   V6 (axios-usage)          line 3  — import axios / line 23 — axios.get call

import { join } from 'node:path';
import { gradeFindings, looseRange, fuzzyKeyword, tolerantKeyword } from './_grader-utils.mjs';

const WORK = process.env.WORK;
const findingsPath = join(WORK, 'findings.txt');

gradeFindings({
  findingsPath,
  file: 'screens/DashboardScreen.tsx',
  expected: [
    {
      id: 'expo-public-secret',
      // Line 5: `const PAYMENT_KEY = process.env.EXPO_PUBLIC_STRIPE_SECRET_KEY`
      lines: looseRange(5, 8),
      keywords: [/EXPO_PUBLIC_/i, /secret/i, /stripe/i, /exposed/i, /visible/i, /client.*bundle/i, /bundle/i],
    },
    {
      id: 'no-abort-controller',
      // Lines 17-19: fetch without AbortController in useEffect (no cleanup)
      lines: looseRange(18, 8),
      keywords: [/AbortController/i, /abort/i, /cancel/i, /cleanup/i, /unmount/i, /memory.*leak/i, /leak/i],
    },
    {
      id: 'axios-usage',
      // Agent may cite import (line 3) or the call (line 23)
      lines: [...looseRange(3, 8), ...looseRange(23, 8)],
      keywords: [/axios/i],
    },
  ],
});

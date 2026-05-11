// Grader for review-firebase-config case.
// Checks findings.txt for 5 known violations in firebase-app/firebase.json.
//
// Violation line map (1-indexed):
//   Line  3: "public": "src"          — wrong public dir for SPA (should be dist/build)
//   Line  5: "firebase.json"          — ignore list missing **/.*  and **/node_modules/**
//   Line  7: "cleanUrls": false       — should be true
//   Line 12: "type": 200              — invalid redirect type (must be 301 or 302)
//   Lines 15-20: rewrites block       — no SPA catch-all rewrite (** -> /index.html)

import { gradeFindings, range, looseRange, fuzzyKeyword, tolerantKeyword } from './_grader-utils.mjs';

const FINDINGS_PATH = `${process.env.WORK}/findings.txt`;

// LLM line-counting notes for this file (22 lines):
//   Presence violations (line clearly in file): use looseRange(N) default ±8.
//   Absence/redirect violations: models report them at ~line 6-8 (the redirects/rewrites
//   block header) rather than the actual type:200 line (12) or rewrites lines (15-20).
//   Use range(1, 22) for those so any line in the file qualifies; rely on specific keywords.

gradeFindings({
  findingsPath: FINDINGS_PATH,
  file: 'firebase.json',
  expected: [
    {
      id: 'wrong-public-dir',
      // Line 3: "public": "src" — models typically report lines 3-5
      lines: looseRange(3),
      keywords: [/\bsrc\b/i, tolerantKeyword('public'), tolerantKeyword('dist'), tolerantKeyword('build'), tolerantKeyword('directory'), tolerantKeyword('output')],
    },
    {
      id: 'incomplete-ignore',
      // Line 5: "firebase.json" only — models report lines 4-6; avoid 'missing' keyword
      // to prevent false match with the SPA-rewrite finding ("Missing catch-all...").
      lines: looseRange(5),
      keywords: [tolerantKeyword('ignore'), /node_modules/i, /\*\*\/\.\*/i, /pattern/i, /\.\*/, /dotfile/i],
    },
    {
      id: 'clean-urls-false',
      // Line 7: "cleanUrls": false — models may report lines 2-8 due to drift
      lines: looseRange(7),
      keywords: [fuzzyKeyword('cleanUrls'), fuzzyKeyword('clean url'), tolerantKeyword('clean')],
    },
    {
      id: 'invalid-redirect-type',
      // Line 12: "type": 200 — models often report at lines 6-8 (redirects block header);
      // use whole-file range + highly specific keyword (\b200\b) to avoid cross-matches.
      lines: range(1, 22),
      keywords: [/\b200\b/, /must be 301/i, /must be 302/i, /invalid.*type/i, /type.*invalid/i],
    },
    {
      id: 'missing-spa-rewrite',
      // Absence violation (no line to point at) — models report anywhere in lines 7-20;
      // use whole-file range + keywords unique to this violation.
      lines: range(1, 22),
      keywords: [fuzzyKeyword('index.html'), /\bSPA\b/i, fuzzyKeyword('catch all'), fuzzyKeyword('single page'), /client.?side.?routing/i],
    },
  ],
});

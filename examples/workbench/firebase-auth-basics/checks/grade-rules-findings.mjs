// Grader for firebase-auth-basics eval: checks findings.txt for violations
// in firestore.rules (2 seeded violations).
//
// Violations seeded in workspace/firestore.rules:
//   V5 (~line 7): Missing "request.auth != null" before .uid comparison
//   V6 (~line 11): allow read, write: if true — no authentication required

import { join } from 'node:path';
import { gradeFindings, looseRange, fuzzyKeyword, tolerantKeyword } from './_grader-utils.mjs';

const WORK = process.env.WORK ?? '/work';
const findingsPath = join(WORK, 'findings.txt');

const expected = [
  {
    id: 'V5-null-check-missing',
    // request.auth.uid used without null guard at line 7
    lines: looseRange(7, 8),
    keywords: [
      fuzzyKeyword('request.auth != null'),
      fuzzyKeyword('null check'),
      fuzzyKeyword('null guard'),
      /request\.auth\s*!=\s*null/i,
      tolerantKeyword('null'),
      fuzzyKeyword('unauthenticated'),
      fuzzyKeyword('NullPointer'),
    ],
  },
  {
    id: 'V6-public-write',
    // allow read, write: if true at line 11 — no auth
    lines: looseRange(11, 8),
    keywords: [
      fuzzyKeyword('if true'),
      fuzzyKeyword('public'),
      fuzzyKeyword('unauthenticated'),
      fuzzyKeyword('no auth'),
      tolerantKeyword('unrestricted'),
      fuzzyKeyword('allow read, write'),
    ],
  },
];

gradeFindings({ findingsPath, file: 'firestore.rules', expected });

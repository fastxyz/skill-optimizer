// Grader for firebase-auth-basics eval: checks findings.txt for violations
// in src/auth.js (4 seeded violations).
//
// Violations seeded in workspace/src/auth.js:
//   V1 (~line 4): Missing connectAuthEmulator block for localhost
//   V2 (~line 11): auth.currentUser used directly (should use onAuthStateChanged)
//   V3 (~line 17): createUserWithEmailAndPassword without error handling (.catch)
//   V4 (~line 25): signInWithPopup without try/catch error handling

import { join } from 'node:path';
import { gradeFindings, looseRange, fuzzyKeyword, tolerantKeyword } from './_grader-utils.mjs';

const WORK = process.env.WORK ?? '/work';
const findingsPath = join(WORK, 'findings.txt');

const expected = [
  {
    id: 'V1-missing-emulator',
    // connectAuthEmulator is missing near the getAuth call at line 4
    lines: looseRange(4, 10),
    keywords: [
      fuzzyKeyword('connect auth emulator'),
      tolerantKeyword('emulator'),
      fuzzyKeyword('connectAuthEmulator'),
    ],
  },
  {
    id: 'V2-currentUser-direct',
    // auth.currentUser used directly at line 11 — should use onAuthStateChanged
    lines: looseRange(11, 8),
    keywords: [
      fuzzyKeyword('currentUser'),
      fuzzyKeyword('onAuthStateChanged'),
      fuzzyKeyword('auth state'),
    ],
  },
  {
    id: 'V3-email-no-catch',
    // createUserWithEmailAndPassword at line 17 missing error handling
    lines: looseRange(17, 8),
    keywords: [
      tolerantKeyword('error'),
      tolerantKeyword('catch'),
      fuzzyKeyword('createUserWithEmailAndPassword'),
      fuzzyKeyword('error handling'),
    ],
  },
  {
    id: 'V4-google-no-catch',
    // signInWithPopup at line 25 missing try/catch
    lines: looseRange(25, 8),
    keywords: [
      tolerantKeyword('error'),
      tolerantKeyword('catch'),
      fuzzyKeyword('signInWithPopup'),
      fuzzyKeyword('error handling'),
    ],
  },
];

gradeFindings({ findingsPath, file: 'auth.js', expected });

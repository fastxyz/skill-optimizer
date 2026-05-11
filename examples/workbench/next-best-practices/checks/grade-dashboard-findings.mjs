#!/usr/bin/env node
// Grader: check that the agent found violations in app/dashboard/page.tsx
//
// Seeded violations:
//   V1 (line 9):  sync params access — should use `await params`
//   V2 (line 12-13): sequential waterfall fetches — should use Promise.all
//   V3 (line 19): redirect() inside try-catch — swallows the navigation throw
//   V4 (line 31): Date object passed as prop to client component — not serializable
//   V5 (line 33): native <img> tag instead of next/image

import { gradeFindings, looseRange, fuzzyKeyword, tolerantKeyword } from './_grader-utils.mjs';
import { join } from 'node:path';

const WORK = process.env.WORK ?? '/work';
const findingsPath = join(WORK, 'findings.txt');
const file = 'page.tsx';

const expected = [
  {
    id: 'sync-params',
    lines: looseRange(9),
    keywords: [
      fuzzyKeyword('await params'),
      tolerantKeyword('params'),
      /async.*params|params.*async/i,
      /sync.*params|params.*sync/i,
    ],
  },
  {
    id: 'waterfall',
    lines: looseRange(12, 10),
    keywords: [
      tolerantKeyword('waterfall'),
      fuzzyKeyword('Promise.all'),
      tolerantKeyword('sequential'),
      tolerantKeyword('parallel'),
    ],
  },
  {
    id: 'redirect-in-catch',
    lines: looseRange(19),
    keywords: [
      tolerantKeyword('redirect'),
      fuzzyKeyword('try-catch'),
      fuzzyKeyword('try catch'),
      tolerantKeyword('catch'),
      tolerantKeyword('rethrow'),
      fuzzyKeyword('unstable_rethrow'),
    ],
  },
  {
    id: 'date-prop',
    lines: looseRange(31, 12),
    keywords: [
      /Date/i,
      tolerantKeyword('serial'),
      fuzzyKeyword('non-serial'),
      tolerantKeyword('createdAt'),
      /JSON|plain\s+object/i,
      /client.*component|RSC/i,
    ],
  },
  {
    id: 'native-img',
    lines: looseRange(33, 12),
    keywords: [
      fuzzyKeyword('next/image'),
      /next\/image/i,
      /<img>/i,
      /native.*img|img.*tag/i,
      tolerantKeyword('Image'),
    ],
  },
];

gradeFindings({ findingsPath, file, expected });

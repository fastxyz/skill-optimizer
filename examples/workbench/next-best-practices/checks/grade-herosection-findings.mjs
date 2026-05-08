#!/usr/bin/env node
// Grader: check that the agent found violations in components/HeroSection.tsx
//
// Seeded violations:
//   V1 (line 6):  async client component — 'use client' + async function
//   V2 (line 12): <Image fill> without sizes prop
//   V3 (line 17): missing priority prop on above-fold LCP image
//   V4 (line 24): native <script> tag — should use next/script

import { gradeFindings, looseRange, fuzzyKeyword, tolerantKeyword } from './_grader-utils.mjs';
import { join } from 'node:path';

const WORK = process.env.WORK ?? '/work';
const findingsPath = join(WORK, 'findings.txt');
const file = 'HeroSection.tsx';

const expected = [
  {
    id: 'async-client',
    lines: looseRange(6),
    keywords: [
      fuzzyKeyword('async client'),
      /async.*use client|use client.*async/i,
      /client.*async|async.*component/i,
      tolerantKeyword('async'),
    ],
  },
  {
    id: 'fill-without-sizes',
    lines: looseRange(12),
    keywords: [
      tolerantKeyword('sizes'),
      /fill.*sizes|sizes.*fill/i,
      fuzzyKeyword('responsive'),
      /largest.*image|image.*download/i,
    ],
  },
  {
    id: 'missing-priority',
    lines: looseRange(17),
    keywords: [
      tolerantKeyword('priority'),
      /LCP|largest.*content|above.*fold/i,
      fuzzyKeyword('above the fold'),
      tolerantKeyword('hero'),
    ],
  },
  {
    id: 'native-script',
    lines: looseRange(24, 12),
    keywords: [
      fuzzyKeyword('next/script'),
      /next\/script/i,
      /<script>/i,
      /native.*script|script.*tag/i,
      tolerantKeyword('Script'),
    ],
  },
];

gradeFindings({ findingsPath, file, expected });

/**
 * Grader for no-pptx-skill-needed case.
 *
 * Checks:
 *   1. answer.txt was created with exactly "Q4 Revenue: $8.7M"
 *   2. The agent did NOT read the pptx SKILL.md (no skill needed for this task)
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { noReadPath, printResult } from './_trace.mjs';

const WORK    = process.env.WORK    ?? '/work';
const RESULTS = process.env.RESULTS ?? '/results';

const answerPath = join(WORK, 'answer.txt');
const tracePath  = join(RESULTS, 'trace.jsonl');
const failures   = [];

if (!existsSync(answerPath)) {
  failures.push('answer.txt was not created');
} else {
  const content = readFileSync(answerPath, 'utf-8').trim();
  if (content !== 'Q4 Revenue: $8.7M') {
    failures.push(`answer.txt must contain exactly "Q4 Revenue: $8.7M", got: "${content}"`);
  }
}

if (existsSync(tracePath)) {
  const traceResult = noReadPath(tracePath, /\/pptx\/SKILL\.md$/);
  if (!traceResult.pass) {
    failures.push(...traceResult.evidence);
  }
}

printResult(
  failures.length === 0
    ? { pass: true,  score: 1, evidence: ['answer.txt correct and pptx skill was not read'] }
    : { pass: false, score: 0, evidence: failures },
);

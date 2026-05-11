/**
 * Grader for extract-pptx-facts case.
 *
 * Expected answer.json:
 *   { "title": "TechVision Corp: Q3 2025 Results", "slideCount": 4,
 *     "revenue": "$5.1M", "customerCount": 2341 }
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const WORK = process.env.WORK ?? '/work';
const answerPath = join(WORK, 'answer.json');

function emitResult(pass, evidence) {
  const score = pass ? 1 : 0;
  console.log(JSON.stringify({ pass, score, evidence: Array.isArray(evidence) ? evidence : [String(evidence)] }));
  process.exit(pass ? 0 : 1);
}

if (!existsSync(answerPath)) {
  emitResult(false, ['answer.json was not created']);
}

let answer;
try {
  answer = JSON.parse(readFileSync(answerPath, 'utf-8'));
} catch (err) {
  emitResult(false, [`answer.json is not valid JSON: ${err.message}`]);
}

const failures = [];

// title — must mention TechVision Corp and Q3 2025
if (typeof answer.title !== 'string') {
  failures.push('title must be a string');
} else if (!answer.title.includes('TechVision Corp')) {
  failures.push(`title must include "TechVision Corp", got: "${answer.title}"`);
} else if (!answer.title.includes('Q3 2025')) {
  failures.push(`title must include "Q3 2025", got: "${answer.title}"`);
}

// slideCount — must be exactly 4
if (answer.slideCount !== 4) {
  failures.push(`slideCount must be 4, got: ${JSON.stringify(answer.slideCount)}`);
}

// revenue — must contain "5.1" (accept "$5.1M", "5.1M", "$5.1 million", etc.)
const revenueStr = String(answer.revenue ?? '');
if (!revenueStr.includes('5.1')) {
  failures.push(`revenue must include "5.1", got: "${revenueStr}"`);
}

// customerCount — must resolve to 2341 (accept number 2341 or string "2341" or "2,341")
const rawCount = answer.customerCount;
const countNum = typeof rawCount === 'number'
  ? rawCount
  : Number(String(rawCount ?? '').replace(/,/g, ''));
if (countNum !== 2341) {
  failures.push(`customerCount must resolve to 2341, got: ${JSON.stringify(rawCount)}`);
}

const pass = failures.length === 0;
const evidence = pass
  ? [
      'answer.json matched all expected fields',
      `+ title: "${answer.title}"`,
      `+ slideCount: ${answer.slideCount}`,
      `+ revenue: "${answer.revenue}"`,
      `+ customerCount: ${answer.customerCount}`,
    ]
  : failures;

emitResult(pass, evidence);

import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { printResult, readJson, requireEnv } from './_pdf.mjs';

const answerPath = join(requireEnv('WORK'), 'answer.json');

if (!existsSync(answerPath)) {
  printResult(false, 'answer.json was not created');
}

let answer;
try {
  answer = readJson(answerPath);
} catch (error) {
  printResult(false, `answer.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
}

const failures = [];
if (answer.account !== 'Delta Orchard Cooperative') failures.push('account mismatch');
if (answer.quarter !== 'Q4 2025') failures.push('quarter mismatch');
if (answer.totalRevenue !== 128430) failures.push('totalRevenue must be numeric 128430');
if (!Array.isArray(answer.riskFlags)) {
  failures.push('riskFlags must be an array');
} else {
  for (const expected of ['inventory write-down', 'late supplier audit']) {
    if (!answer.riskFlags.includes(expected)) failures.push(`missing risk flag: ${expected}`);
  }
  if (answer.riskFlags.length !== 2) failures.push('riskFlags should contain exactly the two source risk flags');
}
if (answer.approvalCode !== 'PDF-7429') failures.push('approvalCode mismatch');

printResult(failures.length === 0, failures.length === 0 ? 'answer.json matched expected PDF facts' : failures);

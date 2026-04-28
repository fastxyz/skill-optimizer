import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { printResult as printPdfResult, requireEnv, result } from './_pdf.mjs';
import { noReadPath } from './_trace.mjs';

const workDir = requireEnv('WORK');
const resultsDir = requireEnv('RESULTS');
const notePath = join(workDir, 'note.txt');
const tracePath = join(resultsDir, 'trace.jsonl');
const failures = [];

if (!existsSync(notePath)) {
  failures.push('note.txt was not created');
} else if (readFileSync(notePath, 'utf-8').trim() !== 'done') {
  failures.push('note.txt did not contain exactly: done');
}

if (existsSync(tracePath)) {
  const traceResult = noReadPath(tracePath, /\/pdf-skill\/SKILL\.md$/);
  if (!traceResult.pass) {
    failures.push(...traceResult.evidence);
  }
}

printPdfResult(failures.length === 0
  ? result(true, 'note.txt was created without reading the PDF skill')
  : result(false, failures));

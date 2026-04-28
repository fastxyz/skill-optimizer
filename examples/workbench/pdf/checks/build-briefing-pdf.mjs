import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { countPdfPages, extractSimplePdfText, isPdfFile, missingStrings, printResult } from './_pdf.mjs';

const outputPath = join(process.env.WORK ?? process.cwd(), 'briefing.pdf');

if (!existsSync(outputPath)) {
  printResult(false, 'briefing.pdf was not created');
}
if (!isPdfFile(outputPath)) {
  printResult(false, 'briefing.pdf is not a valid-looking PDF with header and EOF marker');
}

const text = extractSimplePdfText(outputPath);
const missing = missingStrings(text, [
  'PDF Skill Briefing',
  'Source: Alpine Sensors',
  'Decision: approve expedited renewal',
  'Deadline: 2026-05-14',
]);
const failures = [...missing.map((value) => `missing expected text: ${value}`)];

if (text.includes('draft-only note') || text.includes('internal discount floor')) {
  failures.push('briefing.pdf includes draft-only source note');
}
const pageCount = countPdfPages(outputPath);
if (pageCount !== 1) {
  failures.push(`expected 1 page, found ${pageCount}`);
}

printResult(failures.length === 0, failures.length === 0 ? 'briefing.pdf matched expected briefing' : failures);

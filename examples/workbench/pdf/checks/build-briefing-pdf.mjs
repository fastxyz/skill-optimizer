import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { countPdfPages, isPdfFile, printResult, requireEnv } from './_pdf.mjs';

const outputPath = join(requireEnv('WORK'), 'briefing.pdf');

if (!existsSync(outputPath)) {
  printResult(false, 'briefing.pdf was not created');
}
if (!isPdfFile(outputPath)) {
  printResult(false, 'briefing.pdf is not a valid-looking PDF with header and EOF marker');
}

const failures = [];
const pageCount = countPdfPages(outputPath);
if (pageCount !== 1) {
  failures.push(`expected 1 page, found ${pageCount}`);
}

printResult(failures.length === 0, failures.length === 0 ? 'briefing.pdf is a valid one-page PDF' : failures);

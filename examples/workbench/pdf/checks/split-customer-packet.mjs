import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { countPdfPages, extractSimplePdfText, isPdfFile, missingStrings, printResult } from './_pdf.mjs';

const outputPath = join(process.env.WORK ?? process.cwd(), 'customer-copy.pdf');

if (!existsSync(outputPath)) {
  printResult(false, 'customer-copy.pdf was not created');
}
if (!isPdfFile(outputPath)) {
  printResult(false, 'customer-copy.pdf is not a valid-looking PDF with header and EOF marker');
}

const text = extractSimplePdfText(outputPath);
const missing = missingStrings(text, [
  'CUSTOMER COPY',
  'Invoice: C-204',
  'Status: PAID',
  'Warranty Code: W-8832',
  'Support Tier: Priority',
]);
const failures = [...missing.map((value) => `missing expected text: ${value}`)];

if (text.includes('INTERNAL NOTES') || text.includes('Margin review pending')) {
  failures.push('customer-copy.pdf includes internal-only page text');
}
const pageCount = countPdfPages(outputPath);
if (pageCount !== 2) {
  failures.push(`expected 2 pages, found ${pageCount}`);
}

printResult(failures.length === 0, failures.length === 0 ? 'customer-copy.pdf contains only customer pages' : failures);

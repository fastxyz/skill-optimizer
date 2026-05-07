import { join } from 'node:path';
import { gradeFindings, range } from './_grader-utils.mjs';

const expected = [
  {
    id: 'label-without-htmlfor',
    lines: range(15, 19),
    keywords: [/\blabel\b/i, /\bhtml-?for\b|wrapping|clickable/i],
  },
  {
    id: 'wrong-input-type-for-email',
    lines: range(16, 27),
    keywords: [/\btype\b/i, /\bemail\b/i],
  },
  {
    id: 'input-missing-autocomplete',
    lines: range(16, 27),
    keywords: [/auto-?complete/i],
  },
  {
    id: 'block-paste',
    lines: range(21, 26),
    keywords: [/\bpaste\b/i],
  },
  {
    id: 'submit-button-disabled-pre-request',
    lines: range(28, 32),
    keywords: [/\bdisabled\b/i, /\bsubmit\b|\bbutton\b/i],
  },
];

const pass = gradeFindings({
  findingsPath: join(process.env.WORK, 'findings.txt'),
  file: 'CheckoutForm.tsx',
  expected,
});
process.exit(pass ? 0 : 1);

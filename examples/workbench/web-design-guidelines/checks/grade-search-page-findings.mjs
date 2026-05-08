import { join } from 'node:path';
import { gradeFindings, range } from './_grader-utils.mjs';

const expected = [
  {
    id: 'url-no-state-sync',
    lines: range(9, 14),
    keywords: [/url|query\s*param|search\s*param|router|deep[-\s]?link|state.*url/i],
  },
  {
    id: 'hardcoded-currency-format',
    lines: range(29, 33),
    keywords: [/Intl\.NumberFormat|currency|hardcoded\s*(number|currency|format)/i],
  },
  {
    id: 'hardcoded-date-format',
    lines: range(30, 34),
    keywords: [/Intl\.DateTimeFormat|toDateString|hardcoded\s*date|date\s*format/i],
  },
  {
    id: 'brand-no-translate-no',
    lines: range(18, 22),
    keywords: [/translate=['"]?no|translate.*no|brand\s*name/i],
  },
  {
    id: 'destructive-no-confirmation',
    lines: range(31, 35),
    keywords: [/confirmation|confirm\s*modal|undo|destructive/i],
  },
];

const pass = gradeFindings({
  findingsPath: join(process.env.WORK, 'findings.txt'),
  file: 'SearchPage.tsx',
  expected,
});
process.exit(pass ? 0 : 1);

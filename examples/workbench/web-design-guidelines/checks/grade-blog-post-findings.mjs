import { join } from 'node:path';
import { gradeFindings, range } from './_grader-utils.mjs';

const expected = [
  {
    id: 'heading-skip-level',
    lines: range(11, 15),
    keywords: [/heading\s*hierarch|skip[-\s]?level|h1.*h3|h3.*h1|missing\s*h2|level/i],
  },
  {
    id: 'decorative-icon-no-aria-hidden',
    lines: range(15, 21),
    keywords: [/aria-hidden|decorative\s*(icon|svg)/i],
  },
  {
    id: 'toast-no-aria-live',
    lines: range(24, 30),
    keywords: [/aria-live|role=['"]?status|live\s*region/i],
  },
  {
    id: 'generic-button-label',
    lines: range(21, 25),
    keywords: [/specific\s*(button\s*)?label|generic\s*(button\s*)?label|"continue"|\bcontinue\b\s*(label|button)/i],
  },
  {
    id: 'focus-not-focus-visible',
    lines: range(21, 25),
    keywords: [/focus-visible/i],
  },
];

const pass = gradeFindings({
  findingsPath: join(process.env.WORK, 'findings.txt'),
  file: 'BlogPost.tsx',
  expected,
});
process.exit(pass ? 0 : 1);

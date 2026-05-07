import { join } from 'node:path';
import { gradeFindings, range } from './_grader-utils.mjs';

const expected = [
  {
    id: 'img-missing-alt',
    lines: range(13, 17),
    keywords: [/\balt\b/i, /\bimg\b/i],
  },
  {
    id: 'div-onclick-instead-of-button',
    lines: range(16, 22),
    keywords: [/\bdiv\b.*\bonclick\b|\bonclick\b.*\bdiv\b/i, /<button>|\bbutton\b/i],
  },
  {
    id: 'icon-only-button-no-aria-label',
    lines: range(19, 25),
    keywords: [/aria-label/i, /icon-only/i],
  },
  {
    id: 'input-without-label',
    lines: range(22, 31),
    keywords: [/\blabel\b/i, /aria-label/i],
  },
  {
    id: 'outline-none-no-focus',
    lines: range(28, 34),
    keywords: [/outline-?none/i, /\bfocus\b/i],
  },
];

const pass = gradeFindings({
  findingsPath: join(process.env.WORK, 'findings.txt'),
  file: 'ProductCard.tsx',
  expected,
});
process.exit(pass ? 0 : 1);

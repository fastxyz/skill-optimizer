import { join } from 'node:path';
import { gradeFindings, range } from './_grader-utils.mjs';

const expected = [
  {
    id: 'img-missing-width-height',
    lines: range(4, 8),
    keywords: [/\bwidth\b/i, /\bheight\b/i, /\bcls\b|layout\s*shift/i],
  },
  {
    id: 'above-fold-img-missing-priority',
    lines: range(4, 8),
    keywords: [/\bpriority\b/i, /fetchpriority/i],
  },
  {
    id: 'transition-all',
    lines: range(5, 12),
    keywords: [/transition.*all|transition:\s*['"]?all/i],
  },
  {
    id: 'animation-no-prefers-reduced-motion',
    lines: range(13, 20),
    keywords: [/prefers-?reduced-?motion|reduce[d-]?motion/i],
  },
  {
    id: 'below-fold-img-missing-lazy',
    lines: range(21, 25),
    keywords: [/\blazy\b|loading=['"]?lazy/i],
  },
];

const pass = gradeFindings({
  findingsPath: join(process.env.WORK, 'findings.txt'),
  file: 'HeroSection.tsx',
  expected,
});
process.exit(pass ? 0 : 1);

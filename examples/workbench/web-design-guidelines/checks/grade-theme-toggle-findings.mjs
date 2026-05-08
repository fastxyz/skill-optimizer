import { join } from 'node:path';
import { gradeFindings, range } from './_grader-utils.mjs';

// Five seeded violations in workspace/ThemeToggle.tsx.
// Note: rules about <html color-scheme> and <meta theme-color> belong on a
// document/layout file, not on a component, so they're not seeded here.
const expected = [
  {
    id: 'localstorage-in-render',
    lines: range(5, 10),
    keywords: [/localStorage|hydration|server.*client|useEffect/i],
  },
  {
    id: 'input-value-no-onchange',
    lines: range(22, 28),
    keywords: [/onChange|controlled.*input|value\b.*onChange|read-?only/i],
  },
  {
    id: 'select-no-explicit-bg-color',
    lines: range(12, 23),
    keywords: [/select\b.*background-?color|background-?color\b.*select|native\s*select|windows.*dark/i],
  },
  {
    id: 'button-no-hover-state',
    lines: range(25, 30),
    keywords: [/hover:|\bhover\b\s*state|hover\s*feedback/i],
  },
  {
    id: 'no-focus-visible',
    lines: range(12, 30),
    keywords: [/focus-visible/i],
  },
];

const pass = gradeFindings({
  findingsPath: join(process.env.WORK, 'findings.txt'),
  file: 'ThemeToggle.tsx',
  expected,
});
process.exit(pass ? 0 : 1);

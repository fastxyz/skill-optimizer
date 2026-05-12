// Grader: UserCard.tsx — shadcn/ui best-practice violations
// Expected violations:
//   V1 (line  1): custom component placed in components/ui/ — should be in components/
//   V2 (line 18): string concatenation for className instead of cn()
//   V3 (line 26): hard-coded Tailwind color values instead of CSS design-token variables
//   V4 (line 42): aria-pressed={undefined} / aria-expanded={undefined} — stripping ARIA props
//
// Note: gpt-4o-mini undercounts by 6-13 lines; tolerances widened to 12.

import { gradeFindings, looseRange, range, fuzzyKeyword, tolerantKeyword } from './_grader-utils.mjs';

const findingsPath = `${process.env.WORK}/findings.txt`;

const expected = [
  {
    id: 'V1-wrong-location',
    lines: range(1, 8),          // line 1: path comment says components/ui/
    keywords: [
      fuzzyKeyword('components/ui'),
      tolerantKeyword('location'),
      tolerantKeyword('custom'),
      /wrong.{0,20}(path|dir|folder|locat)/i,
    ],
  },
  {
    id: 'V2-no-cn',
    lines: looseRange(18, 12),   // lines 6–30: string concat block (wider for model drift)
    keywords: [
      fuzzyKeyword('cn('),
      tolerantKeyword('concat'),
      fuzzyKeyword('string concat'),
      /class.{0,30}(merge|join|compos)/i,
      /clsx|twMerge|tailwind.merge/i,
    ],
  },
  {
    id: 'V3-hardcoded-colors',
    lines: looseRange(26, 12),   // lines 14–38: badgeColors object (wider for model drift)
    keywords: [
      /hard.{0,10}cod/i,
      fuzzyKeyword('css variable'),
      /bg-blue-6|bg-green-6|bg-gray-4/,
      tolerantKeyword('token'),
      /design.{0,10}(token|variable|system)/i,
    ],
  },
  {
    id: 'V4-strip-aria',
    lines: looseRange(42, 14),   // lines 28–56: aria-pressed / aria-expanded block (wider for drift)
    keywords: [
      /aria/i,
      tolerantKeyword('strip'),
      tolerantKeyword('remov'),
      /undefined/i,
      tolerantKeyword('access'),
    ],
  },
];

gradeFindings({ findingsPath, file: 'UserCard.tsx', expected });

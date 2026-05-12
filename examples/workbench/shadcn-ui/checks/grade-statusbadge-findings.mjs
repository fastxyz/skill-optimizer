// Grader: StatusBadge.tsx — shadcn/ui best-practice violations
// Expected violations:
//   V5 (line 17): if/else variant logic instead of cva from class-variance-authority
//   V6 (line 26): string concatenation for className instead of cn()
//   V7 (line 33): <div onClick> without role="button" or keyboard handler
//   V8 (line  1): custom component placed in components/ui/ — should be in components/
//
// Note: gpt-4o-mini undercounts by 6-13 lines; tolerances widened to 12-16.

import { gradeFindings, looseRange, range, fuzzyKeyword, tolerantKeyword } from './_grader-utils.mjs';

const findingsPath = `${process.env.WORK}/findings.txt`;

const expected = [
  {
    id: 'V5-no-cva',
    lines: looseRange(17, 12),   // lines 5–29: conditional variant block
    keywords: [
      /\bcva\b/i,
      fuzzyKeyword('class-variance'),
      fuzzyKeyword('class variance'),
      tolerantKeyword('variant'),
      /conditional.{0,30}class/i,
    ],
  },
  {
    id: 'V6-no-cn',
    lines: looseRange(26, 12),   // lines 14–38: finalClass concat block
    keywords: [
      fuzzyKeyword('cn('),
      tolerantKeyword('concat'),
      fuzzyKeyword('string concat'),
      /class.{0,30}(merge|join|compos)/i,
      /clsx|twMerge|tailwind.merge/i,
    ],
  },
  {
    id: 'V7-div-onclick-no-role',
    lines: looseRange(33, 16),   // lines 17–49: <div onClick> element (wide range for drift)
    keywords: [
      /\brole\b/i,
      tolerantKeyword('keyboard'),
      /div.{0,30}(onClick|click)/i,
      tolerantKeyword('access'),
      /interactive/i,
      /button.{0,30}role/i,
    ],
  },
  {
    id: 'V8-wrong-location',
    lines: range(1, 8),          // line 1: path comment says components/ui/
    keywords: [
      fuzzyKeyword('components/ui'),
      tolerantKeyword('location'),
      tolerantKeyword('custom'),
      /wrong.{0,20}(path|dir|folder|locat)/i,
    ],
  },
];

gradeFindings({ findingsPath, file: 'StatusBadge.tsx', expected });

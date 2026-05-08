// Grader for review-rls case: checks findings.txt for rls_policies.sql violations.
import { gradeFindings, range } from './_grader-utils.mjs';

const findingsPath = `${process.env.WORK}/findings.txt`;

// Violations seeded in workspace/rls_policies.sql.
// Ranges are intentionally wide to accommodate LLM line-counting variance.
const expected = [
  {
    id: 'force-rls-missing',
    // Actual violation: line 6 (ENABLE without FORCE).
    // Agents report lines 4-7.
    lines: range(4, 8),
    keywords: [/force/i],
  },
  {
    id: 'auth-uid-per-row',
    // Actual violation: line 13 (auth.uid() in USING clause).
    // Agents report lines 9-15.
    lines: range(9, 15),
    keywords: [/auth\.uid|per.row|select.*auth|wrapped/i],
  },
  {
    id: 'rls-user-id-no-index',
    // Absence violation: no index on user_id. Agents may reference the USING clause
    // (lines 11-13) or the comment about the missing index (lines 16-19).
    lines: range(9, 21),
    keywords: [/user_id.*index|index.*user_id|sequential.*user_id|user_id.*sequential|user_id.*no index|no index.*user_id/i],
  },
  {
    id: 'covering-index-no-include',
    // Actual violation: line 23 (CREATE INDEX orders_status_idx without INCLUDE).
    // Agents report lines 18-23 (often the line before the actual CREATE INDEX).
    lines: range(16, 27),
    keywords: [/include/i, /cover/i, /heap.fetch|heap fetch/i],
  },
];

gradeFindings({ findingsPath, file: 'rls_policies.sql', expected });

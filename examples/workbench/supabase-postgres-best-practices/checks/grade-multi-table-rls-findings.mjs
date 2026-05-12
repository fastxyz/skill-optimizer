// Grader for review-multi-table-rls case.
//
// Workspace file: workspace/multi_table_schema.sql defines six tables:
//   - users     (RLS enabled + forced)            CORRECT
//   - posts     (RLS enabled, FORCE missing)      VIOLATION: missing FORCE
//   - comments  (no ENABLE ROW LEVEL SECURITY)    VIOLATION: absent RLS
//   - countries (reference data, no RLS needed)   CORRECT
//   - messages  (no ENABLE ROW LEVEL SECURITY)    VIOLATION: absent RLS
//   - currencies (reference data, no RLS needed)  CORRECT
//
// Every violation requires the agent to name the SPECIFIC offending table
// AND the missing concept (rls / enable / force). Naming "RLS missing
// somewhere" is not enough — that pattern, while suggestive, would also
// match a finding that incorrectly flags `countries` or `currencies`.
import { gradeFindings, looseRange, tolerantKeyword } from './_grader-utils.mjs';

const findingsPath = `${process.env.WORK}/findings.txt`;
const rls = /\b(rls|row.?level.?security|enable.?row.?level)\b/i;

const expected = [
  {
    id: 'comments-missing-enable-rls',
    // CREATE TABLE comments is at line 44; the absence has no anchor line,
    // so accept anywhere from line 38 to line 56 (start of the comments
    // block through the post-table indexes).
    lines: looseRange(46, 10),
    allKeywords: [tolerantKeyword('comments'), rls],
  },
  {
    id: 'messages-missing-enable-rls',
    // CREATE TABLE messages is at line 68; absence violation, no anchor.
    // Accept lines 62-80 (block start through post-table indexes).
    lines: looseRange(70, 10),
    allKeywords: [tolerantKeyword('messages'), rls],
  },
  {
    id: 'posts-missing-force-rls',
    // ENABLE on line 35 lacks a follow-up FORCE statement. Accept the
    // whole posts block (lines 25-40).
    lines: looseRange(33, 10),
    allKeywords: [tolerantKeyword('posts'), /\bforce\b/i],
  },
];

gradeFindings({ findingsPath, file: 'multi_table_schema.sql', expected });

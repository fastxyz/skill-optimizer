// Grader for review-update-without-where case.
//
// Workspace file: workspace/data_migration.sql is a 6-statement DML
// backfill script. Five statements have a WHERE clause; one does not:
//
//   line 22: update orders set total = subtotal + tax + shipping;
//
// That single statement, if executed, would mutate every row in `orders`.
// The agent must:
//   (a) enumerate every UPDATE/DELETE in the file
//   (b) detect the absence of a WHERE clause on statement #3
//   (c) report the specific dangerous statement (orders) and the missing
//       WHERE clause concept
import { gradeFindings, looseRange, tolerantKeyword } from './_grader-utils.mjs';

const findingsPath = `${process.env.WORK}/findings.txt`;
const whereStem = /\b(where|missing.?where|no.?where|without.?where|unfiltered|all rows|every row|full.?table)\b/i;

const expected = [
  {
    id: 'orders-update-missing-where',
    // UPDATE on line 22 (statement spans lines 22-23). Accept lines 19-30
    // to allow the model to reference either the comment, the UPDATE, or
    // a line below the statement.
    lines: looseRange(23, 7),
    allKeywords: [tolerantKeyword('orders'), whereStem],
  },
];

gradeFindings({ findingsPath, file: 'data_migration.sql', expected });

// Grader for review-schema case: checks findings.txt for schema.sql violations.
import { gradeFindings, range } from './_grader-utils.mjs';

const findingsPath = `${process.env.WORK}/findings.txt`;

// Violations seeded in workspace/schema.sql.
// Ranges are intentionally wide to accommodate LLM line-counting variance (agents
// often report the CREATE TABLE / parent-statement line rather than the exact
// violation line, and may be off by ±5 lines from the actual position).
const expected = [
  {
    id: 'fk-missing-index',
    // Actual violation: line 15 (customer_id FK inside CREATE TABLE orders).
    // Agents report anywhere from line 7 (blank before orders) to line 20.
    lines: range(7, 21),
    keywords: [/customer_id/i],
  },
  {
    id: 'constraint-if-not-exists',
    // Actual violation: line 23 (ADD CONSTRAINT IF NOT EXISTS).
    // Agents report lines 13-23 (inside orders block or at ALTER TABLE).
    lines: range(13, 25),
    keywords: [/if not exists/i],
  },
  {
    id: 'partial-index-email',
    // Actual violation: line 26 (CREATE INDEX customers_email_idx without WHERE).
    // Agents report lines 17-27.
    lines: range(17, 28),
    keywords: [/partial/i, /deleted_at/i],
  },
  {
    id: 'composite-index-order',
    // Actual violation: line 29 (CREATE INDEX orders_date_status_idx).
    // Agents report lines 20-30.
    lines: range(20, 32),
    keywords: [/composite|column.order|leftmost|equality.first|wrong.order/i],
  },
  {
    id: 'missing-rls',
    // Absence violation: no ALTER TABLE orders ENABLE ROW LEVEL SECURITY anywhere.
    // Agents may reference the CREATE TABLE orders line (~13) or the comment block (31-33).
    lines: range(12, 35),
    keywords: [/row.level.security|enable.*rls|rls.*enabl|no.*rls|missing.*rls/i],
  },
];

gradeFindings({ findingsPath, file: 'schema.sql', expected });

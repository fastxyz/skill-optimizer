// Grader for review-fk-index-audit case.
//
// Workspace file: workspace/migrations.sql contains seven ALTER TABLE
// statements adding foreign keys. Each FK either has a follow-up
// CREATE INDEX or it doesn't. Three FKs are intentionally missing
// indexes — the agent must enumerate every ALTER, decide whether each
// has a supporting index, and name each offender by FK column.
//
// Missing indexes (absence-type, requires enumeration):
//   1. order_items.order_id      ALTER at lines 18-20
//   2. invoices.order_id         ALTER at lines 38-40
//   3. shipments.carrier_id      ALTER at lines 54-56
//
// Each violation requires the FK column name AND an index/missing stem
// to ensure the model identified the SPECIFIC offender.
import { gradeFindings, looseRange, tolerantKeyword } from './_grader-utils.mjs';

const findingsPath = `${process.env.WORK}/findings.txt`;
const indexStem = /\b(index|idx)\b/i;

const expected = [
  {
    id: 'order-items-order-id-no-index',
    lines: looseRange(19, 8),
    allKeywords: [tolerantKeyword('order_id'), indexStem],
    // Bonus disambiguator: the finding line should mention order_items
    // (not the *other* order_id FK on invoices). Enforced by the lines
    // window above (lines 11-27 only — invoices is at lines 31-47).
  },
  {
    id: 'invoices-order-id-no-index',
    lines: looseRange(39, 8),
    allKeywords: [tolerantKeyword('order_id'), indexStem],
  },
  {
    id: 'shipments-carrier-id-no-index',
    lines: looseRange(55, 8),
    allKeywords: [tolerantKeyword('carrier_id'), indexStem],
  },
];

gradeFindings({ findingsPath, file: 'migrations.sql', expected });

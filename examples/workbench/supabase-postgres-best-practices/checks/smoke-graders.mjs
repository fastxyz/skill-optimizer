// Smoke test for the new "deeper-v1" graders.
//
// For each new grader (multi-table-rls, fk-index-audit, update-without-where)
// we hand-craft a GOOD findings.txt that hits all violations correctly,
// a BAD findings.txt that misses at least one, and an EMPTY findings.txt.
// We invoke the grader with WORK pointing at a temp dir, parse the JSON
// stdout, and assert pass/score behave as expected.
//
// Run with: node smoke-graders.mjs
//
// Exit code is 0 if every assertion passes, 1 otherwise. Each scenario
// prints a one-line PASS/FAIL summary plus the grader's evidence on FAIL.

import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));

const scenarios = [
  // ===================== multi-table-rls =====================
  {
    grader: 'grade-multi-table-rls-findings.mjs',
    label: 'multi-table-rls / GOOD',
    findings: [
      'multi_table_schema.sql:44 - security-rls-basics: comments table is missing ENABLE ROW LEVEL SECURITY',
      'multi_table_schema.sql:68 - security-rls-basics: messages table has no enable row level security',
      'multi_table_schema.sql:35 - security-rls-basics: posts has ENABLE but no FORCE row level security',
    ].join('\n'),
    expectPass: true,
    expectScore: 1,
  },
  {
    grader: 'grade-multi-table-rls-findings.mjs',
    label: 'multi-table-rls / BAD (misses messages + force)',
    findings: [
      'multi_table_schema.sql:44 - security-rls-basics: comments table missing enable row level security',
    ].join('\n'),
    expectPass: false,
    maxScore: 0.5,
  },
  {
    grader: 'grade-multi-table-rls-findings.mjs',
    label: 'multi-table-rls / EMPTY',
    findings: '',
    expectPass: false,
    expectScore: 0,
  },

  // ===================== fk-index-audit =====================
  {
    grader: 'grade-fk-index-audit-findings.mjs',
    label: 'fk-index-audit / GOOD',
    findings: [
      'migrations.sql:19 - schema-foreign-key-indexes: order_id FK on order_items has no supporting index',
      'migrations.sql:39 - schema-foreign-key-indexes: order_id FK on invoices has no supporting index',
      'migrations.sql:55 - schema-foreign-key-indexes: carrier_id FK on shipments has no supporting index',
    ].join('\n'),
    expectPass: true,
    expectScore: 1,
  },
  {
    grader: 'grade-fk-index-audit-findings.mjs',
    label: 'fk-index-audit / BAD (misses 2 of 3)',
    findings: [
      'migrations.sql:19 - schema-foreign-key-indexes: order_id FK on order_items has no supporting index',
    ].join('\n'),
    expectPass: false,
    maxScore: 0.5,
  },
  {
    grader: 'grade-fk-index-audit-findings.mjs',
    label: 'fk-index-audit / EMPTY',
    findings: '',
    expectPass: false,
    expectScore: 0,
  },

  // ===================== update-without-where =====================
  {
    grader: 'grade-update-without-where-findings.mjs',
    label: 'update-without-where / GOOD',
    findings: [
      'data_migration.sql:22 - mutation safety: update on orders has no WHERE clause and would rewrite every row',
    ].join('\n'),
    expectPass: true,
    expectScore: 1,
  },
  {
    grader: 'grade-update-without-where-findings.mjs',
    label: 'update-without-where / BAD (wrong table)',
    findings: [
      'data_migration.sql:22 - mutation safety: update on users has no WHERE clause',
    ].join('\n'),
    expectPass: false,
    expectScore: 0,
  },
  {
    grader: 'grade-update-without-where-findings.mjs',
    label: 'update-without-where / EMPTY',
    findings: '',
    expectPass: false,
    expectScore: 0,
  },
];

let failures = 0;

for (const s of scenarios) {
  const work = mkdtempSync(join(tmpdir(), 'smoke-'));
  writeFileSync(join(work, 'findings.txt'), s.findings);
  const result = spawnSync('node', [join(here, s.grader)], {
    env: { ...process.env, WORK: work },
    encoding: 'utf-8',
  });
  rmSync(work, { recursive: true, force: true });

  let parsed;
  const stdout = result.stdout || '';
  try {
    const start = stdout.indexOf('{');
    parsed = JSON.parse(stdout.slice(start));
  } catch (err) {
    failures += 1;
    console.error(`FAIL  ${s.label} — could not parse grader JSON`);
    console.error(`stdout: ${stdout}`);
    console.error(`stderr: ${result.stderr}`);
    continue;
  }

  const checks = [];
  if (typeof parsed.pass !== 'boolean') checks.push('pass field is not boolean');
  if (typeof parsed.score !== 'number') checks.push('score field is not number');
  if (!Array.isArray(parsed.evidence)) checks.push('evidence is not an array');
  if ('expectPass' in s && parsed.pass !== s.expectPass)
    checks.push(`pass=${parsed.pass} expected=${s.expectPass}`);
  if ('expectScore' in s && parsed.score !== s.expectScore)
    checks.push(`score=${parsed.score} expected=${s.expectScore}`);
  if ('maxScore' in s && parsed.score > s.maxScore)
    checks.push(`score=${parsed.score} > maxScore=${s.maxScore}`);

  if (checks.length === 0) {
    console.log(`PASS  ${s.label}  (pass=${parsed.pass}, score=${parsed.score})`);
  } else {
    failures += 1;
    console.error(`FAIL  ${s.label}`);
    for (const c of checks) console.error(`        ${c}`);
    console.error(`        evidence: ${JSON.stringify(parsed.evidence)}`);
  }
}

if (failures === 0) {
  console.log(`\nALL OK — ${scenarios.length} scenarios passed`);
  process.exit(0);
}
console.error(`\n${failures}/${scenarios.length} scenarios FAILED`);
process.exit(1);

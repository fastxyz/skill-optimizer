#!/usr/bin/env node
// Smoke-check: exercise every grader against hand-crafted fake workspaces.
//
// For each new Tier-1 case we run the grader twice:
//   - GOOD scenario  — the scripted ab-calls.log + output files satisfy every
//                      check; we assert pass=true and score=1.
//   - BAD scenario   — at least one check is intentionally broken; we assert
//                      pass=false AND a specific evidence substring appears.
//
// Run with:
//   node examples/workbench/agent-browser/checks/smoke-graders.mjs
//
// The script uses a temp dir under os.tmpdir(), no Docker, no network,
// no real models. Exits 0 when all assertions hold, 1 otherwise.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CHECKS = __dirname;

let passed = 0;
let failed = 0;
const failures = [];

function setupWorkspace(spec) {
  const work = mkdtempSync(join(tmpdir(), 'ab-grade-smoke-'));
  const results = mkdtempSync(join(tmpdir(), 'ab-grade-smoke-results-'));
  if (spec.callsLog !== null && spec.callsLog !== undefined) {
    writeFileSync(join(work, 'ab-calls.log'), spec.callsLog);
  }
  for (const [path, contents] of Object.entries(spec.files ?? {})) {
    const full = join(work, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, contents);
  }
  if (spec.trace) {
    writeFileSync(join(results, 'trace.jsonl'), spec.trace);
  }
  return { work, results };
}

function runGrader(grader, work, results) {
  const proc = spawnSync('node', [join(CHECKS, grader)], {
    env: { ...process.env, WORK: work, RESULTS: results },
    encoding: 'utf-8',
  });
  const stdout = proc.stdout ?? '';
  const stderr = proc.stderr ?? '';
  const m = stdout.match(/\{[\s\S]*\}/);
  let json = null;
  if (m) {
    try { json = JSON.parse(m[0]); } catch { /* parse error */ }
  }
  return { exitCode: proc.status, stdout, stderr, json };
}

function assertScenario({ name, grader, spec, expect }) {
  const { work, results } = setupWorkspace(spec);
  const r = runGrader(grader, work, results);
  const evidence = (r.json?.evidence ?? []).join('\n');
  let ok = true;
  const reasons = [];
  if (r.json === null) {
    ok = false; reasons.push(`grader did not emit JSON. stdout=${r.stdout.slice(0, 200)} stderr=${r.stderr.slice(0, 200)}`);
  } else {
    if (expect.pass !== undefined && r.json.pass !== expect.pass) {
      ok = false; reasons.push(`pass: expected ${expect.pass}, got ${r.json.pass}. evidence:\n${evidence}`);
    }
    if (expect.score !== undefined) {
      const tol = 1e-9;
      if (Math.abs(r.json.score - expect.score) > tol) {
        ok = false; reasons.push(`score: expected ${expect.score}, got ${r.json.score}`);
      }
    }
    if (expect.evidenceContains) {
      for (const sub of expect.evidenceContains) {
        if (!evidence.includes(sub)) {
          ok = false; reasons.push(`evidence missing substring: "${sub}". evidence:\n${evidence}`);
        }
      }
    }
    if (expect.evidenceLacks) {
      for (const sub of expect.evidenceLacks) {
        if (evidence.includes(sub)) {
          ok = false; reasons.push(`evidence unexpectedly contained: "${sub}". evidence:\n${evidence}`);
        }
      }
    }
  }
  // Cleanup temp dirs only on success — keep on failure for triage
  if (ok) {
    rmSync(work, { recursive: true, force: true });
    rmSync(results, { recursive: true, force: true });
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    failures.push({ name, reasons, work, results });
    console.log(`  FAIL  ${name}`);
    for (const r of reasons) console.log(`        ${r.split('\n').join('\n        ')}`);
    console.log(`        (workspace preserved at ${work})`);
  }
}

console.log('--- ref-based-search ---');
assertScenario({
  name: 'ref-based-search GOOD: full snapshot-driven flow',
  grader: 'grade-ref-based-search-findings.mjs',
  spec: {
    callsLog: [
      'navigate https://en.wikipedia.org/wiki/Main_Page',
      'snapshot',
      'type @e7 Hypertext Transfer Protocol',
      'click @e8',
      'snapshot',
      '',
    ].join('\n'),
    files: { 'top-result.txt': 'Hypertext Transfer Protocol\n' },
  },
  expect: { pass: true, score: 1 },
});

assertScenario({
  name: 'ref-based-search BAD: clicked @e7 instead of @e8',
  grader: 'grade-ref-based-search-findings.mjs',
  spec: {
    callsLog: [
      'navigate https://en.wikipedia.org/wiki/Main_Page',
      'snapshot',
      'type @e7 Hypertext Transfer Protocol',
      'click @e7',
      '',
    ].join('\n'),
    files: { 'top-result.txt': 'Welcome to Wikipedia\n' },
  },
  expect: {
    pass: false,
    evidenceContains: [
      'V4: click used wrong ref "@e7"',
      'V6: top-result.txt does not contain the actual top result',
    ],
  },
});

assertScenario({
  name: 'ref-based-search BAD: CSS selector instead of @eN',
  grader: 'grade-ref-based-search-findings.mjs',
  spec: {
    callsLog: [
      'navigate https://en.wikipedia.org/wiki/Main_Page',
      'snapshot',
      'type #searchInput Hypertext Transfer Protocol',
      'click .submit-button',
      'snapshot',
      '',
    ].join('\n'),
    files: { 'top-result.txt': 'Hypertext Transfer Protocol\n' },
  },
  expect: {
    pass: false,
    evidenceContains: ['V7: agent used non-@eN refs'],
  },
});

assertScenario({
  name: 'ref-based-search BAD: skipped initial snapshot',
  grader: 'grade-ref-based-search-findings.mjs',
  spec: {
    callsLog: [
      'navigate https://en.wikipedia.org/wiki/Main_Page',
      'type @e7 Hypertext Transfer Protocol',
      'click @e8',
      'snapshot',
      '',
    ].join('\n'),
    files: { 'top-result.txt': 'Hypertext Transfer Protocol\n' },
  },
  expect: {
    pass: false,
    evidenceContains: ['V2: agent issued click/type WITHOUT a prior snapshot'],
  },
});

console.log('--- ref-disambiguation ---');
assertScenario({
  name: 'ref-disambiguation GOOD: clicked Sign In (@e5)',
  grader: 'grade-ref-disambiguation-findings.mjs',
  spec: {
    callsLog: [
      'navigate https://app.acme.example.com/welcome',
      'snapshot',
      'click @e5',
      'snapshot',
      '',
    ].join('\n'),
    files: { 'next-heading.txt': 'Sign in to your account\n' },
  },
  expect: { pass: true, score: 1 },
});

assertScenario({
  name: 'ref-disambiguation BAD: clicked Sign Up (@e6) by mistake',
  grader: 'grade-ref-disambiguation-findings.mjs',
  spec: {
    callsLog: [
      'navigate https://app.acme.example.com/welcome',
      'snapshot',
      'click @e6',
      'snapshot',
      '',
    ].join('\n'),
    files: { 'next-heading.txt': 'Create your account\n' },
  },
  expect: {
    pass: false,
    evidenceContains: [
      'V3: clicked @e6 ("Sign Up") instead of @e5 ("Sign In")',
      'V5: next-heading.txt is the Sign Up heading',
    ],
  },
});

assertScenario({
  name: 'ref-disambiguation BAD: clicked both buttons (retry loop)',
  grader: 'grade-ref-disambiguation-findings.mjs',
  spec: {
    callsLog: [
      'navigate https://app.acme.example.com/welcome',
      'snapshot',
      'click @e6',
      'snapshot',
      'click @e5',
      'snapshot',
      '',
    ].join('\n'),
    files: { 'next-heading.txt': 'Sign in to your account\n' },
  },
  expect: {
    pass: false,
    evidenceContains: ['V3: clicked BOTH @e5 and @e6'],
  },
});

console.log('--- output-correctness ---');
assertScenario({
  name: 'output-correctness GOOD: extracted level-1 heading exactly',
  grader: 'grade-output-correctness-findings.mjs',
  spec: {
    callsLog: [
      'navigate https://eng.example.com/blog/2026/04/bazel-migration',
      'snapshot',
      '',
    ].join('\n'),
    files: { 'title.txt': 'Why We Migrated Our Build System to Bazel\n' },
  },
  expect: { pass: true, score: 1 },
});

assertScenario({
  name: 'output-correctness BAD: extracted the kicker',
  grader: 'grade-output-correctness-findings.mjs',
  spec: {
    callsLog: [
      'navigate https://eng.example.com/blog/2026/04/bazel-migration',
      'snapshot',
      '',
    ].join('\n'),
    files: { 'title.txt': 'FROM THE PLATFORM TEAM\n' },
  },
  expect: {
    pass: false,
    evidenceContains: [
      'V3: title.txt does NOT match expected title',
      'V4: title.txt includes the kicker',
    ],
  },
});

assertScenario({
  name: 'output-correctness BAD: extracted byline',
  grader: 'grade-output-correctness-findings.mjs',
  spec: {
    callsLog: [
      'navigate https://eng.example.com/blog/2026/04/bazel-migration',
      'snapshot',
      '',
    ].join('\n'),
    files: { 'title.txt': 'By Jordan Lee — April 18, 2026 — 12 min read\n' },
  },
  expect: {
    pass: false,
    evidenceContains: ['V5: title.txt includes the byline'],
  },
});

assertScenario({
  name: 'output-correctness BAD: snapshot was never called',
  grader: 'grade-output-correctness-findings.mjs',
  spec: {
    callsLog: 'navigate https://eng.example.com/blog/2026/04/bazel-migration\n',
    files: { 'title.txt': 'Why We Migrated Our Build System to Bazel\n' },
  },
  expect: {
    pass: false,
    evidenceContains: ['V2: snapshot was never called'],
  },
});

console.log('--- multi-step-state ---');
assertScenario({
  name: 'multi-step-state GOOD: full path traversed and confirmation captured',
  grader: 'grade-multi-step-state-findings.mjs',
  spec: {
    callsLog: [
      'navigate https://news.acme.example.com/subscribe',
      'snapshot',
      'type @e5 Ada Lovelace',
      'snapshot',
      'type @e6 ada@example.com',
      'snapshot',
      'click @e7',
      'snapshot',
      '',
    ].join('\n'),
    files: { 'confirm.txt': 'NL-7QF3-2026\n' },
  },
  expect: { pass: true, score: 1 },
});

assertScenario({
  name: 'multi-step-state BAD: skipped email field',
  grader: 'grade-multi-step-state-findings.mjs',
  spec: {
    callsLog: [
      'navigate https://news.acme.example.com/subscribe',
      'snapshot',
      'type @e5 Ada Lovelace',
      'click @e7',
      'snapshot',
      '',
    ].join('\n'),
    files: { 'confirm.txt': 'NL-7QF3-2026\n' },
  },
  expect: {
    pass: false,
    evidenceContains: [
      'V3: state-machine path broken',
      'V4: no value typed into the email field @e6',
    ],
  },
});

assertScenario({
  name: 'multi-step-state BAD: did not re-snapshot confirmation page',
  grader: 'grade-multi-step-state-findings.mjs',
  spec: {
    callsLog: [
      'navigate https://news.acme.example.com/subscribe',
      'snapshot',
      'type @e5 Ada Lovelace',
      'type @e6 ada@example.com',
      'click @e7',
      '',
    ].join('\n'),
    files: { 'confirm.txt': '' },
  },
  expect: {
    pass: false,
    evidenceContains: [
      'V5: agent submitted but did NOT re-snapshot',
      'V6: confirm.txt exists but is empty',
    ],
  },
});

console.log('');
console.log(`smoke-graders: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}

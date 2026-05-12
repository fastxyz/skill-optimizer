// Grader for the multi-step-state case.
//
// Recording: news.acme.example.com/subscribe — two text fields and a
// Continue button. The state machine:
//   initial            -> type @e5 (name)  -> name-entered
//   name-entered       -> type @e6 (email) -> email-entered
//   email-entered      -> click @e7        -> submitted
// The post-submit page reveals confirmation code "NL-7QF3-2026" and
// the email "ada@example.com" in a paragraph @e51 / @e52. The task asks
// the agent to subscribe with name "Ada Lovelace" and email
// "ada@example.com" and write the confirmation code to /work/confirm.txt.
//
// Checks:
//   V1 — agent-browser invoked at all
//   V2 — snapshot-first discipline
//   V3 — full state-machine path traversed in correct order:
//        type @e5 -> type @e6 -> click @e7
//   V4 — typed value into @e6 contains a plausible email (matches the
//        recorded "ada@example.com" or at least an email-shaped token)
//   V5 — re-snapshot after the final click @e7 (so the agent could read
//        the confirmation page)
//   V6 — confirm.txt exists and contains "NL-7QF3-2026"
//   V7 — no CSS-selector-style refs

import { existsSync, readFileSync } from 'node:fs';
import {
  parseAbLog,
  snapshotFirst,
  findCssLikeRefs,
  matchesPath,
  snapshotAfter,
  typedInto,
  emit,
} from './_ab-utils.mjs';

const WORK = process.env.WORK;

const passed = [];
const failed = [];

const calls = parseAbLog(`${WORK}/ab-calls.log`);

if (calls.length === 0) {
  failed.push('V1: agent-browser was never called');
  emit({ passed, failed });
}
passed.push(`V1: agent-browser was invoked (${calls.length} calls)`);

if (snapshotFirst(calls)) {
  passed.push('V2: snapshot was called before the first click/type');
} else {
  failed.push('V2: agent issued click/type WITHOUT a prior snapshot');
}

const expectedPath = [
  { action: 'type', ref: '@e5' },
  { action: 'type', ref: '@e6' },
  { action: 'click', ref: '@e7' },
];
const path = matchesPath(calls, expectedPath);
if (path.ok) {
  passed.push('V3: state-machine path traversed: type @e5 -> type @e6 -> click @e7');
} else {
  const stepNames = ['type @e5', 'type @e6', 'click @e7'];
  failed.push(
    `V3: state-machine path broken — first missing step: ${stepNames[path.missingAtStep]}`
  );
}

const emailValue = typedInto(calls, '@e6');
if (emailValue && /[\w.+-]+@[\w-]+\.[\w.-]+/.test(emailValue)) {
  if (/ada@example\.com/i.test(emailValue)) {
    passed.push(`V4: typed expected email "${emailValue}" into @e6`);
  } else {
    passed.push(`V4: typed an email-shaped value into @e6 ("${emailValue}")`);
  }
} else if (emailValue) {
  failed.push(`V4: value typed into @e6 ("${emailValue}") is not an email`);
} else {
  failed.push('V4: no value typed into the email field @e6');
}

const submitIdx = calls.findIndex((c) => c.action === 'click' && c.ref === '@e7');
if (submitIdx >= 0 && snapshotAfter(calls, submitIdx)) {
  passed.push('V5: snapshot was re-taken after click @e7 (confirmation page read)');
} else if (submitIdx >= 0) {
  failed.push('V5: agent submitted but did NOT re-snapshot the confirmation page');
}

const confirmPath = `${WORK}/confirm.txt`;
if (!existsSync(confirmPath)) {
  failed.push('V6: confirm.txt was not created');
} else {
  const got = readFileSync(confirmPath, 'utf-8').trim();
  if (/NL-7QF3-2026/.test(got)) {
    passed.push(`V6: confirm.txt contains the recorded confirmation code`);
  } else if (got.length === 0) {
    failed.push('V6: confirm.txt exists but is empty');
  } else {
    failed.push(`V6: confirm.txt does not contain "NL-7QF3-2026". Got: "${got.slice(0, 80)}"`);
  }
}

const cssLike = findCssLikeRefs(calls);
if (cssLike.length === 0) {
  passed.push('V7: no CSS-selector-style refs in click/type');
} else {
  failed.push(`V7: agent used non-@eN refs: ${cssLike.map((c) => c.raw).join(' ; ')}`);
}

emit({ passed, failed });

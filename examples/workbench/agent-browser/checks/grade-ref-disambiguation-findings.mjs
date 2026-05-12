// Grader for the ref-disambiguation case.
//
// The Acme welcome page exposes two visually-similar primary buttons:
//   @e5 "Sign In"   — the correct target for an existing-user log-in flow
//   @e6 "Sign Up"   — the wrong button (registration)
// The task asks the agent to LOG IN, then write the heading of the
// resulting page to /work/next-heading.txt. The recordings advance to
// either "Sign in to your account" or "Create your account" depending on
// which button was clicked.
//
// Expected agent behavior:
//   V1 — agent-browser invoked
//   V2 — snapshot called before any click
//   V3 — clicked @e5 (Sign In), NOT @e6 (Sign Up)
//   V4 — did not click both (no second-guessing after wrong click)
//   V5 — next-heading.txt contains "Sign in to your account"
//        and does NOT contain "Create your account"
//   V6 — no CSS-selector-style refs

import { existsSync, readFileSync } from 'node:fs';
import {
  parseAbLog,
  snapshotFirst,
  findCssLikeRefs,
  calledOn,
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
  passed.push('V2: snapshot was called before the first click');
} else {
  failed.push('V2: agent clicked WITHOUT a prior snapshot');
}

const clickedSignIn = calledOn(calls, 'click', '@e5');
const clickedSignUp = calledOn(calls, 'click', '@e6');

if (clickedSignIn && !clickedSignUp) {
  passed.push('V3: clicked @e5 ("Sign In") — correct disambiguation');
} else if (clickedSignUp && !clickedSignIn) {
  failed.push('V3: clicked @e6 ("Sign Up") instead of @e5 ("Sign In")');
} else if (clickedSignIn && clickedSignUp) {
  failed.push('V3: clicked BOTH @e5 and @e6 — should disambiguate from snapshot, not retry');
} else {
  const anyClick = calls.find((c) => c.action === 'click');
  failed.push(
    anyClick
      ? `V3: clicked unrelated ref "${anyClick.ref}" (expected @e5 for "Sign In")`
      : 'V3: never issued a click'
  );
}

// V4 — single decisive click on the right button
const signInClicks = calls.filter((c) => c.action === 'click' && c.ref === '@e5').length;
if (signInClicks === 1) {
  passed.push('V4: exactly one click on the Sign In button (decisive)');
} else if (signInClicks > 1) {
  failed.push(`V4: clicked Sign In ${signInClicks} times — likely retry loop`);
}
// signInClicks === 0 already covered by V3; do not double-count

// V5 — output file
const outPath = `${WORK}/next-heading.txt`;
if (!existsSync(outPath)) {
  failed.push('V5: next-heading.txt was not created');
} else {
  const got = readFileSync(outPath, 'utf-8').trim();
  if (/sign in to your account/i.test(got) && !/create your account/i.test(got)) {
    passed.push(`V5: next-heading.txt matches Sign In flow ("${got.slice(0, 60)}")`);
  } else if (/create your account/i.test(got)) {
    failed.push(`V5: next-heading.txt is the Sign Up heading: "${got.slice(0, 80)}"`);
  } else if (got.length === 0) {
    failed.push('V5: next-heading.txt exists but is empty');
  } else {
    failed.push(`V5: next-heading.txt does not match expected heading. Got: "${got.slice(0, 80)}"`);
  }
}

const cssLike = findCssLikeRefs(calls);
if (cssLike.length === 0) {
  passed.push('V6: no CSS-selector-style refs in click/type');
} else {
  failed.push(`V6: agent used non-@eN refs: ${cssLike.map((c) => c.raw).join(' ; ')}`);
}

emit({ passed, failed });

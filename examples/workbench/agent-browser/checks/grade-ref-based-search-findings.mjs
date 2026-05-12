// Grader for the ref-based-search case.
//
// Task asked the agent to search Wikipedia for a query and write the title
// of the top result to /work/top-result.txt. The recordings define:
//   - searchbox is @e7 ("Search Wikipedia")
//   - submit button is @e8 ("Search")
//   - after click @e8, the results page exposes a heading @e30 with
//     "Hypertext Transfer Protocol" as the top result
//
// Expected agent behavior:
//   V1 — agent-browser was invoked at all
//   V2 — snapshot was called BEFORE any click/type (snapshot-first discipline)
//   V3 — type was issued against ref @e7 (the searchbox), not a CSS selector
//   V4 — click was issued against ref @e8 (the submit button), not @e7 or anything else
//   V5 — a second snapshot was taken AFTER click @e8 (re-snapshot after navigation)
//   V6 — top-result.txt exists and contains the actual top-result title
//        ("Hypertext Transfer Protocol", case-insensitive substring)
//   V7 — no CSS-selector-style refs anywhere in click/type calls

import { existsSync, readFileSync } from 'node:fs';
import {
  parseAbLog,
  bashCommandsFromTrace,
  snapshotFirst,
  findCssLikeRefs,
  calledOn,
  snapshotAfter,
  usedHttpFallback,
  emit,
} from './_ab-utils.mjs';

const WORK = process.env.WORK;
const RESULTS = process.env.RESULTS;

const passed = [];
const failed = [];

const calls = parseAbLog(`${WORK}/ab-calls.log`);

// V1 — invoked at all
if (calls.length > 0) {
  passed.push(`V1: agent-browser was invoked (${calls.length} calls)`);
} else {
  failed.push('V1: agent-browser was never called — ab-calls.log empty or missing');
  emit({ passed, failed });
}

// V2 — snapshot-first discipline
if (snapshotFirst(calls)) {
  passed.push('V2: snapshot was called before the first click/type');
} else {
  failed.push('V2: agent issued click/type WITHOUT a prior snapshot — refs are guesses');
}

// V3 — typed into the searchbox ref @e7
if (calledOn(calls, 'type', '@e7')) {
  passed.push('V3: type @e7 was used for the searchbox (correct ref)');
} else {
  const wrongType = calls.find((c) => c.action === 'type');
  if (wrongType) {
    failed.push(`V3: type used wrong ref "${wrongType.ref}" (expected @e7 for searchbox)`);
  } else {
    failed.push('V3: type was never called — agent did not enter a search query');
  }
}

// V4 — clicked the submit button ref @e8
if (calledOn(calls, 'click', '@e8')) {
  passed.push('V4: click @e8 was used to submit the search (correct ref)');
} else {
  const wrongClick = calls.find((c) => c.action === 'click');
  if (wrongClick) {
    failed.push(`V4: click used wrong ref "${wrongClick.ref}" (expected @e8 for submit)`);
  } else {
    failed.push('V4: click was never called — agent did not submit the search');
  }
}

// V5 — re-snapshot after submit
const submitIdx = calls.findIndex((c) => c.action === 'click' && c.ref === '@e8');
if (submitIdx >= 0 && snapshotAfter(calls, submitIdx)) {
  passed.push('V5: snapshot was re-taken after click @e8 (results page inspected)');
} else if (submitIdx >= 0) {
  failed.push('V5: agent clicked submit but did NOT re-snapshot the results page');
} else {
  // V4 already failed; don't double-count
}

// V6 — output file contains real top-result title
const outPath = `${WORK}/top-result.txt`;
if (!existsSync(outPath)) {
  failed.push('V6: top-result.txt was not created');
} else {
  const got = readFileSync(outPath, 'utf-8').trim();
  if (got.length === 0) {
    failed.push('V6: top-result.txt exists but is empty');
  } else if (/hypertext transfer protocol/i.test(got)) {
    passed.push(`V6: top-result.txt matches the recorded top result ("${got.slice(0, 60)}")`);
  } else {
    failed.push(
      `V6: top-result.txt does not contain the actual top result. Got: "${got.slice(0, 80)}"`
    );
  }
}

// V7 — no CSS-style refs
const cssLike = findCssLikeRefs(calls);
if (cssLike.length === 0) {
  passed.push('V7: no CSS-selector-style refs in click/type');
} else {
  failed.push(
    `V7: agent used non-@eN refs (looks like CSS): ${cssLike.map((c) => c.raw).join(' ; ')}`
  );
}

// Bonus negative: catch curl/wget fallback
const bashCmds = bashCommandsFromTrace(RESULTS);
if (usedHttpFallback(bashCmds)) {
  failed.push('V8: agent used curl/wget for HTTP instead of agent-browser');
}

emit({ passed, failed });

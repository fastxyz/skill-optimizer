// Grader for the output-correctness case.
//
// The recorded blog page contains three plausible "title-ish" strings:
//   - "FROM THE PLATFORM TEAM"               — kicker / tagline
//   - "Why We Migrated Our Build System to Bazel"  — the actual <h1> level=1
//   - "By Jordan Lee — April 18, 2026 — 12 min read"  — byline
// The task asks for the article title, which is unambiguously the
// level-1 heading. Models that grab the kicker, the byline, or the page
// <title> tag (which would also be similar but distinct) lose points.
//
// Checks:
//   V1 — agent-browser invoked at all
//   V2 — snapshot was called (cannot extract a title without one)
//   V3 — title.txt exists with the EXACT expected article title (whitespace-tolerant)
//   V4 — title.txt does NOT include the kicker "FROM THE PLATFORM TEAM"
//   V5 — title.txt does NOT include the byline ("By Jordan Lee")
//   V6 — no CSS-selector-style refs

import { existsSync, readFileSync } from 'node:fs';
import {
  parseAbLog,
  findCssLikeRefs,
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

if (calls.some((c) => c.action === 'snapshot')) {
  passed.push('V2: snapshot was called to read the page content');
} else {
  failed.push('V2: snapshot was never called — agent could not have read the article title');
}

const expected = 'Why We Migrated Our Build System to Bazel';
const outPath = `${WORK}/title.txt`;

if (!existsSync(outPath)) {
  failed.push('V3: title.txt was not created');
} else {
  const got = readFileSync(outPath, 'utf-8').trim();
  // Whitespace-tolerant comparison
  const norm = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();
  if (norm(got) === norm(expected)) {
    passed.push(`V3: title.txt matches the article title exactly`);
  } else if (norm(got).includes(norm(expected))) {
    passed.push(`V3: title.txt contains the article title (with extra surrounding text)`);
  } else {
    failed.push(`V3: title.txt does NOT match expected title. Expected: "${expected}". Got: "${got.slice(0, 120)}"`);
  }

  if (/from the platform team/i.test(got)) {
    failed.push('V4: title.txt includes the kicker "FROM THE PLATFORM TEAM" (not the title)');
  } else {
    passed.push('V4: title.txt does not include the kicker tagline');
  }

  if (/\bby jordan lee\b/i.test(got)) {
    failed.push('V5: title.txt includes the byline "By Jordan Lee" (not the title)');
  } else {
    passed.push('V5: title.txt does not include the byline');
  }
}

const cssLike = findCssLikeRefs(calls);
if (cssLike.length === 0) {
  passed.push('V6: no CSS-selector-style refs in click/type');
} else {
  failed.push(`V6: agent used non-@eN refs: ${cssLike.map((c) => c.raw).join(' ; ')}`);
}

emit({ passed, failed });

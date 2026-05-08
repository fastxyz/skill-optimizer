// Grader for the search-screenshot case.
// Checks that the agent:
//   1. Created search-results.png in $WORK
//   2. Called `agent-browser fill` to enter the search query (not just `type`)
//   3. Called a smart wait after form submission (not bare `wait <ms>`)
//   4. Re-snapshotted after navigation (core loop)
//   5. Called `agent-browser open` on DuckDuckGo

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const WORK = process.env.WORK;
const RESULTS = process.env.RESULTS;

const evidence = [];
const failures = [];

// ── 1. search-results.png ────────────────────────────────────────────────────
const screenshotPath = join(WORK, 'search-results.png');
if (existsSync(screenshotPath)) {
  evidence.push('+ search-results.png exists');
} else {
  failures.push('search-results.png was not created');
}

// ── 2–5. Trace analysis ───────────────────────────────────────────────────────
const tracePath = join(RESULTS, 'trace.jsonl');
if (!existsSync(tracePath)) {
  failures.push('trace.jsonl not found');
} else {
  const lines = readFileSync(tracePath, 'utf8').trim().split(/\r?\n/);
  const entries = lines.flatMap(l => { try { return [JSON.parse(l)]; } catch { return []; } });

  const bashCmds = entries.flatMap(e => {
    if (e.type !== 'tool_call' || e.name !== 'bash') return [];
    const c = (e.arguments ?? {}).command;
    return typeof c === 'string' ? [c] : [];
  });
  const allCmds = bashCmds.join('\n');

  // 2. fill was used
  if (/agent-browser\s+fill\b/.test(allCmds) || /agent-browser\s+find\b.*fill\b/.test(allCmds)) {
    evidence.push('+ agent-browser fill was called (clears then types — correct pattern)');
  } else {
    failures.push('trace: agent-browser fill was not called — type without clear is a violation');
  }

  // 3. smart wait (not just bare time wait)
  const hasSmartWait = /agent-browser\s+wait\s+(--load|--url|--text|@e|\w*[a-z])/.test(allCmds);
  const hasBareWait = /agent-browser\s+wait\s+\d{3,}/.test(allCmds);
  if (hasSmartWait) {
    evidence.push('+ smart wait used after navigation (correct pattern)');
  } else if (hasBareWait) {
    failures.push('trace: bare wait <ms> used instead of smart wait — skill violation');
  } else {
    failures.push('trace: no wait command found after form submission — missing required wait');
  }

  // 4. snapshot usage (recommended but not required — CSS/find locators are valid per skill)
  const snapshotCount = (allCmds.match(/agent-browser\s+snapshot\b/g) || []).length;
  if (snapshotCount >= 2) {
    evidence.push(`+ snapshot called ${snapshotCount} times — re-snapshotted after navigation (recommended pattern)`);
  } else if (snapshotCount === 1) {
    evidence.push('+ snapshot called once (re-snapshot after navigation preferred)');
  } else {
    evidence.push('~ snapshot not called — CSS selectors or find locators used instead (valid per skill)');
  }

  // 5. open DuckDuckGo
  if (/agent-browser\s+(open|goto|navigate)\s+https?:\/\/duckduckgo\.com/.test(allCmds)) {
    evidence.push('+ agent-browser open duckduckgo.com was called');
  } else if (/agent-browser\s+(open|goto|navigate)\b/.test(allCmds)) {
    evidence.push('+ agent-browser open was called (DuckDuckGo URL not confirmed)');
  } else {
    failures.push('trace: agent-browser open was not called');
  }
}

const pass = failures.length === 0;
const score = evidence.length / (evidence.length + failures.length);
console.log(JSON.stringify({ pass, score, evidence: [...evidence, ...failures] }));
process.exit(pass ? 0 : 1);

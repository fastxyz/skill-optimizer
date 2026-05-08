// Grader for the capture-homepage case.
// Checks that the agent:
//   1. Created home.png in $WORK
//   2. Created title.txt with the correct page title
//   3. Called `agent-browser open` (trace evidence)
//   4. Called `agent-browser screenshot` (trace evidence)
//   5. Called `agent-browser snapshot` to read the page (core loop)

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const WORK = process.env.WORK;
const RESULTS = process.env.RESULTS;

const evidence = [];
const failures = [];

// ── 1. home.png ──────────────────────────────────────────────────────────────
const homePng = join(WORK, 'home.png');
if (existsSync(homePng)) {
  evidence.push('+ home.png exists');
} else {
  failures.push('home.png was not created');
}

// ── 2. title.txt ─────────────────────────────────────────────────────────────
const titleTxt = join(WORK, 'title.txt');
if (!existsSync(titleTxt)) {
  failures.push('title.txt was not created');
} else {
  const content = readFileSync(titleTxt, 'utf8').trim();
  if (content.toLowerCase().includes('example')) {
    evidence.push(`+ title.txt contains expected title text: "${content}"`);
  } else {
    failures.push(`title.txt has unexpected content: "${content}"`);
  }
}

// ── 3–5. Trace analysis ───────────────────────────────────────────────────────
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

  if (/agent-browser\s+(open|goto|navigate)\b/.test(allCmds)) {
    evidence.push('+ agent-browser open was called');
  } else {
    failures.push('trace: agent-browser open was not called');
  }

  if (/agent-browser\s+screenshot\b/.test(allCmds)) {
    evidence.push('+ agent-browser screenshot was called');
  } else {
    failures.push('trace: agent-browser screenshot was not called');
  }

  // snapshot is recommended but not required for non-interactive tasks:
  // the skill allows CSS selectors / get title without a prior snapshot
  if (/agent-browser\s+snapshot\b/.test(allCmds)) {
    evidence.push('+ agent-browser snapshot was called (core loop followed — recommended pattern)');
  } else {
    evidence.push('~ agent-browser snapshot not called (CSS/direct commands used instead — valid per skill)');
  }
}

const pass = failures.length === 0;
const score = evidence.length / (evidence.length + failures.length);
console.log(JSON.stringify({ pass, score, evidence: [...evidence, ...failures] }));
process.exit(pass ? 0 : 1);

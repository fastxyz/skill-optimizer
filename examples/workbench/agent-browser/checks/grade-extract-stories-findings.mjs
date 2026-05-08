// Grader for the extract-stories case.
// Checks that the agent:
//   1. Created stories.txt with >= 3 non-empty lines
//   2. Called `agent-browser snapshot` to read the HN page (core loop)
//   3. Called `agent-browser open` on news.ycombinator.com
//   4. Used the accessibility tree to extract text (get text or snapshot content)
//   5. Called `agent-browser close` when done

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const WORK = process.env.WORK;
const RESULTS = process.env.RESULTS;

const evidence = [];
const failures = [];

// ── 1. stories.txt ───────────────────────────────────────────────────────────
const storiesTxt = join(WORK, 'stories.txt');
if (!existsSync(storiesTxt)) {
  failures.push('stories.txt was not created');
} else {
  const content = readFileSync(storiesTxt, 'utf8');
  const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length >= 3) {
    evidence.push(`+ stories.txt has ${lines.length} non-empty lines`);
  } else {
    failures.push(`stories.txt has only ${lines.length} non-empty lines — need at least 3`);
  }
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

  // 2. snapshot called
  if (/agent-browser\s+snapshot\b/.test(allCmds)) {
    evidence.push('+ agent-browser snapshot was called (used accessibility tree — correct pattern)');
  } else {
    failures.push('trace: agent-browser snapshot was not called — skipped accessibility tree approach');
  }

  // 3. open HN
  if (/agent-browser\s+(open|goto|navigate)\s+https?:\/\/news\.ycombinator\.com/.test(allCmds)) {
    evidence.push('+ agent-browser open news.ycombinator.com was called');
  } else if (/agent-browser\s+(open|goto|navigate)\b/.test(allCmds)) {
    evidence.push('+ agent-browser open was called (HN URL not confirmed in trace)');
  } else {
    failures.push('trace: agent-browser open was not called');
  }

  // 4. text extraction (get text or snapshot used to extract)
  if (/agent-browser\s+get\s+text\b/.test(allCmds) || /agent-browser\s+snapshot\b/.test(allCmds)) {
    evidence.push('+ agent used accessibility tree for data extraction (get text or snapshot)');
  } else {
    failures.push('trace: no text extraction via accessibility tree found');
  }

  // 5. close called
  if (/agent-browser\s+close\b/.test(allCmds)) {
    evidence.push('+ agent-browser close was called when done');
  } else {
    failures.push('trace: agent-browser close was not called — browser left open');
  }
}

const pass = failures.length === 0;
const score = evidence.length / (evidence.length + failures.length);
console.log(JSON.stringify({ pass, score, evidence: [...evidence, ...failures] }));
process.exit(pass ? 0 : 1);

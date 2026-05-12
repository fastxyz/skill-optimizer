// Grader for the navigate-and-report case.
//
// Expected agent behavior (tool-use violations seeded):
//   V1: agent-browser was invoked at all (ab-calls.log exists)
//   V2: agent-browser skills get core was called before navigating
//   V3: agent-browser navigate was used (not curl/wget)
//   V4: agent-browser snapshot was called to inspect the page
//   V5: heading.txt was created with non-empty content

import { existsSync, readFileSync } from 'node:fs';

const WORK = process.env.WORK;
const RESULTS = process.env.RESULTS;

const passed = [];
const failed = [];

// V1 — agent-browser was invoked
const abLogPath = `${WORK}/ab-calls.log`;
const abLog = existsSync(abLogPath) ? readFileSync(abLogPath, 'utf-8') : null;

if (abLog !== null) {
  passed.push('V1: agent-browser was invoked (ab-calls.log exists)');
} else {
  failed.push('V1: agent-browser was never called — ab-calls.log not found');
}

// V2 — core skill was loaded (via CLI or via cat of the vendored file)
const tracePath = `${RESULTS}/trace.jsonl`;
const traceLines = existsSync(tracePath)
  ? readFileSync(tracePath, 'utf-8').split(/\r?\n/).filter(Boolean)
  : [];
const bashCmds = traceLines.flatMap((ln) => {
  try {
    const entry = JSON.parse(ln);
    if (entry.type === 'tool_call' && entry.name === 'bash') {
      return [(entry.arguments ?? {}).command ?? ''];
    }
  } catch { /* skip */ }
  return [];
});
const cliSkillLoad = abLog && /skills\s+(get\s+)?core|skills\s+get/.test(abLog);
const catSkillLoad = bashCmds.some((cmd) => /cat\b.*agent-browser-core|agent-browser-core\.md/.test(cmd));
if (cliSkillLoad || catSkillLoad) {
  passed.push('V2: core skill was loaded before navigating');
} else {
  failed.push('V2: core skill was NOT loaded (run `agent-browser skills get core` or cat agent-browser-core.md first)');
}

// V3 — navigate was called (not curl)
if (abLog && /^navigate\b/m.test(abLog)) {
  passed.push('V3: agent-browser navigate was used for page navigation');
} else {
  failed.push('V3: agent-browser navigate was NOT called');
}

// Also check for curl fallback
const hasCurlFallback = bashCmds.some(
  (cmd) => /curl\s+https?:\/\/|wget\s+https?:\/\//.test(cmd)
);
if (hasCurlFallback) {
  failed.push('V3-extra: Agent used curl/wget for HTTP instead of agent-browser');
}

// V4 — snapshot was called
if (abLog && /^snapshot\b/m.test(abLog)) {
  passed.push('V4: agent-browser snapshot was called to inspect the page');
} else {
  failed.push('V4: agent-browser snapshot was NOT called (should snapshot before reading page content)');
}

// V5 — heading.txt exists with content
const headingPath = `${WORK}/heading.txt`;
if (existsSync(headingPath)) {
  const content = readFileSync(headingPath, 'utf-8').trim();
  if (content.length > 0) {
    passed.push(`V5: heading.txt created with content: "${content.slice(0, 80)}"`);
  } else {
    failed.push('V5: heading.txt exists but is empty');
  }
} else {
  failed.push('V5: heading.txt was not created');
}

const total = passed.length + failed.length;
const score = passed.length / total;
const pass = failed.length === 0;

console.log(JSON.stringify({
  pass,
  score,
  evidence: [
    `${passed.length}/${total} behavioral checks passed`,
    ...passed.map((p) => `+ ${p}`),
    ...failed.map((f) => `- ${f}`),
  ],
}));

process.exit(pass ? 0 : 1);

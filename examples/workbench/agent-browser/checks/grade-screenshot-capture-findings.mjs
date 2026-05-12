// Grader for the screenshot-capture case.
//
// Expected agent behavior (tool-use violations seeded):
//   V1: agent-browser was invoked at all (ab-calls.log exists)
//   V2: agent-browser skills get core was called before other commands
//   V3: agent-browser navigate was used (not curl/wget)
//   V4: agent-browser screenshot was called
//   V5: screenshot.png and title.txt were both created

import { existsSync, readFileSync, statSync } from 'node:fs';

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
  passed.push('V2: core skill was loaded before starting task');
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

// V4 — screenshot was called
if (abLog && /^screenshot\b/m.test(abLog)) {
  passed.push('V4: agent-browser screenshot was called');
} else {
  failed.push('V4: agent-browser screenshot was NOT called');
}

// V5 — screenshot.png exists (non-empty file)
const screenshotPath = `${WORK}/screenshot.png`;
if (existsSync(screenshotPath)) {
  const size = statSync(screenshotPath).size;
  if (size > 0) {
    passed.push(`V5a: screenshot.png created (${size} bytes)`);
  } else {
    failed.push('V5a: screenshot.png exists but is empty');
  }
} else {
  failed.push('V5a: screenshot.png was not created');
}

// V5b — title.txt exists with content
const titlePath = `${WORK}/title.txt`;
if (existsSync(titlePath)) {
  const content = readFileSync(titlePath, 'utf-8').trim();
  if (content.length > 0) {
    passed.push(`V5b: title.txt created with content: "${content.slice(0, 80)}"`);
  } else {
    failed.push('V5b: title.txt exists but is empty');
  }
} else {
  failed.push('V5b: title.txt was not created');
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

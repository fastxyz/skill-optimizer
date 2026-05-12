// Shared utilities for agent-browser graders.
//
// Parses /work/ab-calls.log into structured AbCall records and provides
// helper queries that graders share: snapshot-first discipline,
// CSS-selector misuse detection, ref usage, state-machine path matching,
// and emit() for the JSON result envelope the workbench runner expects.
//
// Each line of ab-calls.log is the literal `$*` from the fake CLI,
// e.g.:
//   navigate https://example.com
//   snapshot
//   type @e7 Hypertext Transfer Protocol
//   click @e8
//   screenshot /work/result.png
//
// `type` args appear unquoted (the shell collapses quotes); the parser
// treats everything after the ref as the typed text.

import { existsSync, readFileSync } from 'node:fs';

/**
 * Parse ab-calls.log into a list of structured calls.
 * @returns {Array<{raw:string, action:string, ref:string|null, arg:string|null, args:string[]}>}
 */
export function parseAbLog(path) {
  if (!existsSync(path)) return [];
  const text = readFileSync(path, 'utf-8');
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split(/\s+/);
    const action = parts[0] ?? '';
    let ref = null;
    let arg = null;
    let args = parts.slice(1);

    if (action === 'click' || action === 'type') {
      ref = parts[1] ?? null;
      if (action === 'type') {
        // Anything after the ref is the typed text (quotes lost by the shell).
        arg = parts.slice(2).join(' ') || null;
      }
      args = parts.slice(1);
    } else if (action === 'navigate' || action === 'open' || action === 'screenshot') {
      arg = parts[1] ?? null;
    } else if (action === 'skills') {
      // skills get core / skills list / etc.
      arg = parts.slice(1).join(' ') || null;
    }

    out.push({ raw: line, action, ref, arg, args });
  }
  return out;
}

/** Extract bash commands from trace.jsonl (used to detect curl fallback / CSS use). */
export function bashCommandsFromTrace(resultsDir) {
  const tracePath = `${resultsDir}/trace.jsonl`;
  if (!existsSync(tracePath)) return [];
  const cmds = [];
  for (const ln of readFileSync(tracePath, 'utf-8').split(/\r?\n/)) {
    if (!ln) continue;
    try {
      const entry = JSON.parse(ln);
      if (entry.type === 'tool_call' && entry.name === 'bash') {
        cmds.push((entry.arguments ?? {}).command ?? '');
      }
    } catch {
      /* skip */
    }
  }
  return cmds;
}

/** True if at least one snapshot call appears before the first click/type call. */
export function snapshotFirst(calls) {
  const firstInteractIdx = calls.findIndex(
    (c) => c.action === 'click' || c.action === 'type'
  );
  if (firstInteractIdx === -1) return true; // no interaction => trivially OK
  return calls.slice(0, firstInteractIdx).some((c) => c.action === 'snapshot');
}

/** Detect refs that look like CSS selectors / XPath / jQuery rather than @eN. */
const CSS_HINT = /^[#.]|^\/\/|^\[|^[a-z][a-z0-9-]*[#.[]/i;
export function findCssLikeRefs(calls) {
  const bad = [];
  for (const c of calls) {
    if (c.action !== 'click' && c.action !== 'type') continue;
    const ref = c.ref ?? '';
    if (!ref) continue;
    if (/^@e?\d+$/i.test(ref)) continue; // legitimate ref (@e3 or @3)
    if (CSS_HINT.test(ref) || ref.includes('"') || ref.includes("'")) {
      bad.push(c);
    }
  }
  return bad;
}

/**
 * Did the agent call `action` on `ref` at any point?
 * @param {Array} calls
 * @param {'click'|'type'} action
 * @param {string} ref e.g. '@e7'
 */
export function calledOn(calls, action, ref) {
  return calls.some((c) => c.action === action && c.ref === ref);
}

/**
 * Did the agent perform the ordered sequence of (action, ref) steps,
 * with optional snapshots interleaved?
 * @returns {{ok:boolean, missingAtStep:number|null}}
 */
export function matchesPath(calls, expectedSteps) {
  let i = 0;
  for (const c of calls) {
    if (i >= expectedSteps.length) break;
    const exp = expectedSteps[i];
    if (c.action === exp.action && (!exp.ref || c.ref === exp.ref)) {
      i += 1;
    }
  }
  return { ok: i === expectedSteps.length, missingAtStep: i === expectedSteps.length ? null : i };
}

/** Was a snapshot taken AFTER a given index in `calls`? */
export function snapshotAfter(calls, idx) {
  return calls.slice(idx + 1).some((c) => c.action === 'snapshot');
}

/** Find typed text the agent sent into a particular ref, if any. */
export function typedInto(calls, ref) {
  const c = calls.find((x) => x.action === 'type' && x.ref === ref);
  return c ? c.arg : null;
}

/** Was a curl/wget fallback used (via bash trace)? */
export function usedHttpFallback(bashCmds) {
  return bashCmds.some((cmd) => /\b(curl|wget)\s+https?:\/\//.test(cmd));
}

/**
 * Standard pass/fail emit. `passed` and `failed` are arrays of evidence strings.
 * Always exits the process with the right code.
 */
export function emit({ passed, failed }) {
  const total = passed.length + failed.length;
  const score = total === 0 ? 0 : passed.length / total;
  const pass = failed.length === 0;
  console.log(
    JSON.stringify({
      pass,
      score,
      evidence: [
        `${passed.length}/${total} behavioral checks passed`,
        ...passed.map((p) => `+ ${p}`),
        ...failed.map((f) => `- ${f}`),
      ],
    })
  );
  process.exit(pass ? 0 : 1);
}

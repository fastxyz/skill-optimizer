// Shared grader logic for web-design-guidelines eval cases.
//
// Each finding is assumed to be one line in findings.txt that references
// "<File>.tsx:<line>" (line numbers come from the agent — they're often
// off by ±1-2 due to LLM line-counting). A violation is considered "found"
// when at least one finding line:
//   (a) references a line number within the violation's accepted range, AND
//   (b) contains at least one of the violation's distinguishing keywords.
//
// This per-finding-line check prevents spurious cross-matches (e.g. the
// keyword "label" from a different finding being credited to a paste rule).

import { existsSync, readFileSync } from 'node:fs';

export function gradeFindings({ findingsPath, file, expected }) {
  const failures = [];
  const found = new Set();

  if (!existsSync(findingsPath)) {
    failures.push('findings.txt was not created');
    return emitResult({ found, expected, failures });
  }

  const text = readFileSync(findingsPath, 'utf-8');
  const refRe = new RegExp(`${escapeRe(file)}\\s*[:#]\\s*(\\d+)`, 'i');
  const findingLines = text.split(/\r?\n/).filter((ln) => refRe.test(ln));

  for (const v of expected) {
    for (const line of findingLines) {
      const m = line.match(refRe);
      if (!m) continue;
      const lineNum = Number(m[1]);
      if (!v.lines.includes(lineNum)) continue;
      // Optional anyOf gate: at least one of `keywords` must match.
      if (v.keywords && !v.keywords.some((re) => re.test(line))) continue;
      // Optional allOf gate: every regex in `allKeywords` must match.
      // Used for absence-type violations where the agent must name BOTH
      // the offending entity (table/column) AND the missing concept.
      if (v.allKeywords && !v.allKeywords.every((re) => re.test(line))) continue;
      found.add(v.id);
      break;
    }
  }

  return emitResult({ found, expected, failures });
}

function emitResult({ found, expected, failures }) {
  const missing = expected.filter((v) => !found.has(v.id)).map((v) => v.id);
  const score = found.size / expected.length;
  const pass = found.size === expected.length;

  console.log(JSON.stringify({
    pass,
    score,
    evidence: [
      `${found.size}/${expected.length} expected violations identified`,
      ...[...found].map((id) => `+ ${id}`),
      ...missing.map((id) => `- missing: ${id}`),
      ...failures,
    ],
  }));
  return pass;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Helper: build an inclusive line range [start, start+1, ..., end].
export function range(start, end) {
  const out = [];
  for (let i = start; i <= end; i++) out.push(i);
  return out;
}

// Helper: build a wide line range centered on `target` with ±tolerance.
// Useful when an absence-type violation has no single anchor line and the
// agent may report any of several nearby lines.
export function looseRange(target, tolerance = 8) {
  return range(Math.max(1, target - tolerance), target + tolerance);
}

// Helper: case-insensitive regex that matches `term` anywhere as a stem.
// Word-boundary on both ends keeps it from cross-matching unrelated names
// (e.g. `messages` won't accidentally match `messaging` substrings in
// other findings). Special regex chars in `term` are escaped.
export function tolerantKeyword(term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i');
}

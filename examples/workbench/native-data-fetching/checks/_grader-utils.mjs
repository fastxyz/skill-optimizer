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
      if (!v.keywords.some((re) => re.test(line))) continue;
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

// Helper: centered loose range — accepts the violation line ± tolerance.
// Default tolerance ±8 handles LLM line-counting drift on multi-line elements.
// PREFER this over `range(N-3, N+3)` — see lessons.md § G1.
export function looseRange(centerLine, tolerance = 8) {
  return range(centerLine - tolerance, centerLine + tolerance);
}

// Helper: hyphen-tolerant keyword regex — `fuzzyKeyword('empty state')`
// matches both "empty state" and "empty-state" and "emptystate".
// PREFER this over hand-writing `/empty[-\s]+state/` — see lessons.md § G2.
export function fuzzyKeyword(phrase) {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const flexible = escaped.replace(/\s+/g, '[-\\s]*');
  return new RegExp(flexible, 'i');
}

// Helper: prefix-tolerant keyword — `tolerantKeyword('cover')` matches
// "cover", "covering", "covered", "does not cover".
// PREFER this over `/covering/i` — see lessons.md § G4.
export function tolerantKeyword(stem) {
  const escaped = stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\w*`, 'i');
}

// Grader: checks async API fixes in app/page.tsx and app/[id]/page.tsx.
//
// Violations:
//   page-viewport      — viewport must be a separate export (not inside metadata)
//   page-searchparams  — searchParams must be async (Promise<> type or awaited)
//   id-page-params     — params must be async (Promise<> type or awaited)

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const work = process.env.WORK;

function readFile(relPath) {
  const abs = join(work, 'starter-app', relPath);
  if (!existsSync(abs)) return null;
  return readFileSync(abs, 'utf-8');
}

const found = new Set();
const evidence = [];
const total = 3;

// --- page.tsx ---
const pageSrc = readFile('app/page.tsx');
if (!pageSrc) {
  evidence.push('FAIL: app/page.tsx not found');
} else {
  // Violation 1: viewport should be a separate export const viewport
  // Accept: `export const viewport` or `export function generateViewport`
  if (/export\s+(const\s+viewport|function\s+generateViewport)/i.test(pageSrc)) {
    found.add('page-viewport');
    evidence.push('+ page-viewport: separate viewport export found');
  } else {
    evidence.push('- page-viewport: no separate viewport export; viewport still inside metadata or missing');
  }

  // Violation 2: searchParams must be async
  // Accept: `Promise<` in type annotation near searchParams, or `await searchParams`
  if (/Promise\s*<[^>]*>\s*[,}]/.test(pageSrc) || /await\s+searchParams/.test(pageSrc)) {
    found.add('page-searchparams');
    evidence.push('+ page-searchparams: searchParams treated as async');
  } else {
    evidence.push('- page-searchparams: searchParams still synchronous (no Promise<> type or await)');
  }
}

// --- app/[id]/page.tsx ---
const idPageSrc = readFile('app/[id]/page.tsx');
if (!idPageSrc) {
  evidence.push('FAIL: app/[id]/page.tsx not found');
} else {
  // Violation 3: params must be async
  // Accept: `Promise<` in type annotation near params, or `await params`
  if (/Promise\s*<[^>]*>\s*[,}]/.test(idPageSrc) || /await\s+params/.test(idPageSrc)) {
    found.add('id-page-params');
    evidence.push('+ id-page-params: params treated as async');
  } else {
    evidence.push('- id-page-params: params still synchronous (no Promise<> type or await)');
  }
}

const score = found.size / total;
const pass = found.size === total;

console.log(JSON.stringify({
  pass,
  score,
  evidence: [
    `${found.size}/${total} page async-API violations fixed`,
    ...evidence,
  ],
}));

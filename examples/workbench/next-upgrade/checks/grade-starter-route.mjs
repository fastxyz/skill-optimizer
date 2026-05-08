// Grader: checks async API fixes in app/api/route.ts.
//
// Violations:
//   route-cookies  — cookies() must be awaited in v15
//   route-headers  — headers() must be awaited in v15

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const work = process.env.WORK;
const routePath = join(work, 'starter-app', 'app', 'api', 'route.ts');

const found = new Set();
const evidence = [];
const total = 2;

if (!existsSync(routePath)) {
  evidence.push('FAIL: app/api/route.ts not found');
} else {
  const src = readFileSync(routePath, 'utf-8');

  // Violation 1: cookies() must be awaited
  // Accept: `await cookies()` anywhere in the file
  if (/await\s+cookies\s*\(\s*\)/.test(src)) {
    found.add('route-cookies');
    evidence.push('+ route-cookies: await cookies() found');
  } else {
    // Also check if cookies is no longer used (agent removed it) — partial credit not given
    // but note if it was removed entirely
    if (!/cookies/.test(src)) {
      evidence.push('- route-cookies: cookies() removed entirely (no await pattern found)');
    } else {
      evidence.push('- route-cookies: cookies() still synchronous (no await)');
    }
  }

  // Violation 2: headers() must be awaited
  if (/await\s+headers\s*\(\s*\)/.test(src)) {
    found.add('route-headers');
    evidence.push('+ route-headers: await headers() found');
  } else {
    if (!/headers/.test(src)) {
      evidence.push('- route-headers: headers() removed entirely (no await pattern found)');
    } else {
      evidence.push('- route-headers: headers() still synchronous (no await)');
    }
  }
}

const score = found.size / total;
const pass = found.size === total;

console.log(JSON.stringify({
  pass,
  score,
  evidence: [
    `${found.size}/${total} route async-API violations fixed`,
    ...evidence,
  ],
}));

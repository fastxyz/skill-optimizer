// Grader: checks that package.json was updated to next v15.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const work = process.env.WORK;
const pkgPath = join(work, 'starter-app', 'package.json');

const violations = [
  { id: 'pkg-next-v15', label: 'next version updated to v15' },
];

const found = new Set();
const evidence = [];

if (!existsSync(pkgPath)) {
  evidence.push('FAIL: starter-app/package.json not found');
} else {
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  } catch {
    evidence.push('FAIL: could not parse package.json');
    pkg = null;
  }

  if (pkg) {
    const nextVer = pkg.dependencies?.next ?? pkg.devDependencies?.next ?? '';
    // Accept: "^15", "~15", "15.x.x", "latest", "canary", ">14", ">=15"
    if (/\b15\b|latest|canary|>14/.test(nextVer)) {
      found.add('pkg-next-v15');
      evidence.push(`+ pkg-next-v15: next version = "${nextVer}"`);
    } else {
      evidence.push(`- pkg-next-v15: next version still "${nextVer}", expected v15`);
    }
  }
}

const score = found.size / violations.length;
const pass = found.size === violations.length;

console.log(JSON.stringify({
  pass,
  score,
  evidence: [
    `${found.size}/${violations.length} package violations fixed`,
    ...evidence,
  ],
}));

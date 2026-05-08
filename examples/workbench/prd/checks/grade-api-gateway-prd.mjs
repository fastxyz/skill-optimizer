// Grader: API-gateway PRD structural requirements
//
// Checks that the agent produced a PRD (prd.md) containing all six mandatory
// structural elements required by the upstream prd/SKILL.md:
//   1. Executive Summary section
//   2. KPIs with numeric targets
//   3. Security / privacy requirements
//   4. User stories with acceptance criteria
//   5. Non-goals / out-of-scope section
//   6. Technical architecture or integration specs
//   7. Risk analysis or phased roadmap
//
// Score = fraction of checks passed. Pass threshold = 5/7.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fuzzyKeyword, tolerantKeyword } from './_grader-utils.mjs';

const WORK = process.env.WORK || '/work';

function findPrd(dir) {
  let files;
  try { files = readdirSync(dir); } catch { return null; }
  const md = files.filter((f) => f.endsWith('.md'));
  const preferred = md.find((f) => /prd|product.req|requirement/i.test(f));
  return preferred
    ? join(dir, preferred)
    : md.length > 0 ? join(dir, md[0]) : null;
}

const prdPath = findPrd(WORK);

if (!prdPath || !existsSync(prdPath)) {
  console.log(JSON.stringify({
    pass: false,
    score: 0,
    evidence: ['No PRD markdown file found in /work'],
  }));
  process.exit(0);
}

const text = readFileSync(prdPath, 'utf-8');

const CHECKS = [
  {
    id: 'exec-summary',
    desc: 'Has Executive Summary section',
    fn: () => fuzzyKeyword('executive summary').test(text),
  },
  {
    id: 'kpi-numeric',
    desc: 'Has KPIs with numeric targets (uptime %, latency ms, rate limits)',
    fn: () =>
      /kpi|metric|success\s*criter|sla|uptime/i.test(text) &&
      /\d+\s*(%|ms|req\/|rps|k\b|m\b)/i.test(text),
  },
  {
    id: 'security-privacy',
    desc: 'Has security or privacy requirements (SOC2, auth, audit, PII)',
    fn: () =>
      /security|privacy|auth|soc\s*2|compliance|audit|pii|gdpr|oauth/i.test(text),
  },
  {
    id: 'user-stories',
    desc: 'Has user stories or acceptance criteria',
    fn: () =>
      /user\s*stor|as\s+a\s+\w|acceptance\s*criter|given\s.+when\s.+then\s/i.test(text),
  },
  {
    id: 'non-goals',
    desc: 'Has non-goals or out-of-scope section',
    fn: () =>
      fuzzyKeyword('non-goals').test(text) ||
      fuzzyKeyword('non goals').test(text) ||
      /out[\s-]*of[\s-]*scope/i.test(text),
  },
  {
    id: 'technical-specs',
    desc: 'Has technical architecture or integration specs',
    fn: () =>
      /architect|integration|api\s*spec|openapi|rest|endpoint|versioning|rate\s*limit/i.test(text),
  },
  {
    id: 'risk-roadmap',
    desc: 'Has risk analysis and/or phased roadmap',
    fn: () =>
      tolerantKeyword('risk').test(text) &&
      /roadmap|phase\s*\d|milestone|rollout|beta|ga\b|general\s*avail/i.test(text),
  },
];

const passed = [];
const failed = [];

for (const c of CHECKS) {
  try {
    if (c.fn()) {
      passed.push(`+ ${c.id}: ${c.desc}`);
    } else {
      failed.push(`- ${c.id}: ${c.desc}`);
    }
  } catch (e) {
    failed.push(`- ${c.id}: ${c.desc} (error: ${e.message})`);
  }
}

const score = passed.length / CHECKS.length;
const pass = passed.length >= 5; // 5/7 threshold

console.log(JSON.stringify({
  pass,
  score,
  evidence: [
    `${passed.length}/${CHECKS.length} structural requirements met`,
    ...passed,
    ...failed,
  ],
}));

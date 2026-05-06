// Merge the three enrichment passes into one comprehensive CSV with the free-tier
// metadata columns the team will use for prioritisation.
//
// Inputs:
//   /tmp/skills-top-1000-enriched.json   — 1212 popular skills (installs >= 5K)
//   /tmp/official-enriched.json          — 4342 official skills (vendor-published)
//   /tmp/official-owners.json            — owner→repo tree with totalInstalls
// Output:
//   docs/superpowers/skill-candidates-v2.csv

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../..');
const OUT = join(REPO_ROOT, 'docs/superpowers/skill-candidates-v2.csv');
mkdirSync(dirname(OUT), { recursive: true });

const popular = JSON.parse(readFileSync('/tmp/skills-top-1000-enriched.json', 'utf-8'));
const official = JSON.parse(readFileSync('/tmp/official-enriched.json', 'utf-8'));
const ownersTree = JSON.parse(readFileSync('/tmp/official-owners.json', 'utf-8'));

// Build owner→totalInstalls and repo→totalInstalls indices from /official tree.
const repoTotals = new Map();   // "owner/repo" → number
const orgTotals = new Map();    // "owner" → number
for (const o of ownersTree) {
  let orgSum = 0;
  for (const r of o.repos) {
    repoTotals.set(r.repo, r.totalInstalls ?? 0);
    orgSum += r.totalInstalls ?? 0;
  }
  orgTotals.set(o.owner, orgSum);
}

// Index official by (source.toLowerCase, name.toLowerCase) for the is_official flag.
const officialKey = (s) => `${(s.source ?? '').toLowerCase()}::${(s.name ?? '').toLowerCase()}`;
const officialMap = new Map();
for (const s of official) officialMap.set(officialKey(s), s);

// Index popular by same key.
const popularMap = new Map();
for (const s of popular) popularMap.set(officialKey(s), s);

// Union: every key present in either set.
const allKeys = new Set([...popularMap.keys(), ...officialMap.keys()]);

function formatPop(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}

function csvField(v) {
  if (v === undefined || v === null) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const rows = [];
for (const key of allKeys) {
  const pop = popularMap.get(key);
  const off = officialMap.get(key);
  // Prefer popular's enrichment (it has better description from detail RSC),
  // fall back to official's.
  const base = pop ?? off;
  const source = base.source;
  const owner = source.includes('/') ? source.split('/')[0] : source;
  const name = base.name;
  const skillId = base.skillId ?? name.toLowerCase().replace(/\s+/g, '-');

  const installs = base.installs;
  const weekly = pop?.weekly_installs ?? off?.weekly_installs ?? '';
  const description = (pop?.description ?? off?.description ?? '').slice(0, 500);

  rows.push({
    organization: owner,
    source,
    name,
    is_official: off ? 'true' : 'false',
    is_popular_top1212: pop ? 'true' : 'false',
    installs_raw: installs ?? '',
    installs_formatted: formatPop(installs),
    weekly_installs: weekly,
    repo_total_installs: repoTotals.get(source) ?? '',
    org_total_installs: orgTotals.get(owner) ?? '',
    description,
    skills_sh_url: `https://skills.sh/${source}/${skillId}`,
    github_url: pop?.github_url ?? off?.github_url ?? `https://github.com/${source}`,
    notes: '',
  });
}

// Sort: official first (descending by org_total_installs), then by installs_raw.
rows.sort((a, b) => {
  if (a.is_official !== b.is_official) return a.is_official === 'true' ? -1 : 1;
  const orgA = Number(a.org_total_installs) || 0;
  const orgB = Number(b.org_total_installs) || 0;
  if (orgA !== orgB) return orgB - orgA;
  return (Number(b.installs_raw) || 0) - (Number(a.installs_raw) || 0);
});

const headers = [
  'organization', 'source', 'name',
  'is_official', 'is_popular_top1212',
  'installs_raw', 'installs_formatted', 'weekly_installs',
  'repo_total_installs', 'org_total_installs',
  'description', 'skills_sh_url', 'github_url', 'notes',
];
const lines = [headers.join(',')];
for (const r of rows) lines.push(headers.map((h) => csvField(r[h])).join(','));
const csv = lines.join('\n') + '\n';

writeFileSync(OUT, csv, 'utf-8');

// Summary.
const officialCount = rows.filter((r) => r.is_official === 'true').length;
const popularCount = rows.filter((r) => r.is_popular_top1212 === 'true').length;
const both = rows.filter((r) => r.is_official === 'true' && r.is_popular_top1212 === 'true').length;
console.log(`Wrote ${rows.length} rows to ${OUT}`);
console.log(`  is_official:        ${officialCount}`);
console.log(`  is_popular_top1212: ${popularCount}`);
console.log(`  both (gold cohort): ${both}`);
console.log(`  unique orgs:        ${new Set(rows.map((r) => r.organization)).size}`);
console.log(`  rows by org (top 5):`);
const byOrg = new Map();
for (const r of rows) byOrg.set(r.organization, (byOrg.get(r.organization) ?? 0) + 1);
[...byOrg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).forEach(([o, n]) => console.log(`    ${o.padEnd(30)} ${n}`));

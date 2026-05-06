#!/usr/bin/env node
// Stage 3: merge classifications into v3 CSV; produce top-N target list.
//
// Inputs:
//   docs/superpowers/skill-candidates-v2.csv
//   .superpowers/categorization/classification/*.json
//   .superpowers/categorization/setup-cost/*.json
// Outputs:
//   docs/superpowers/skill-candidates-v3.csv
//   docs/superpowers/skill-targets-top-N.csv
//
// CLI:
//   node _merge-v3.mjs                       # default top-N = 50
//   node _merge-v3.mjs --top 30              # override slice size
//   node _merge-v3.mjs --max-per-repo 3      # cap per source repo (default 2)
//   node _merge-v3.mjs --max-per-org 4       # cap per organization (default 5)
//   node _merge-v3.mjs --strict-setup        # narrow setup_cost filter to {low} only

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Papa from 'papaparse';
import { sourceSlug } from './lib/slug.mjs';
import { ENUM_COLUMNS, FREETEXT_COLUMNS } from './lib/categorization-schema.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../..');
const V2_CSV = join(REPO_ROOT, 'docs/superpowers/skill-candidates-v2.csv');
const V3_CSV = join(REPO_ROOT, 'docs/superpowers/skill-candidates-v3.csv');
const TOP_N_CSV = join(REPO_ROOT, 'docs/superpowers/skill-targets-top-N.csv');
const CLASS_DIR = join(REPO_ROOT, '.superpowers/categorization/classification');
const SETUP_COST_DIR = join(REPO_ROOT, '.superpowers/categorization/setup-cost');

const NEW_COLUMNS = [
  ...ENUM_COLUMNS,
  'setup_cost',
  'setup_cost_reasoning',
  'summary',
  'notable_issues_pipe_joined',
  'eval_sketch',
  'repo_siblings_in_cohort',
  'repo_siblings_in_cohort_names',
];

const FILTER_RULES = {
  type: ['document', 'tool-use', 'code-patterns'],
  gradability: ['easy', 'medium'],
  improvement_potential: ['medium', 'high'],
  author_effort: ['low', 'medium'],
  land_probability: ['high', 'medium'],
  setup_cost: ['low', 'medium'],
};

export function computeRepoSiblings(rows) {
  const out = new Map();
  for (const r of rows) {
    if (r.is_official !== 'true' || r.is_popular_top1212 !== 'true') continue;
    const key = r.source;
    if (!out.has(key)) out.set(key, []);
    out.get(key).push(r.name);
  }
  return out;
}

export function mergeRows(v2Rows, classifications, setupCosts = new Map()) {
  const bySource = computeRepoSiblings(v2Rows);
  return v2Rows.map((r) => {
    const skillId = (r.name ?? '').toLowerCase().replace(/\s+/g, '-');
    let slug;
    try { slug = sourceSlug({ source: r.source ?? '', skillId }); }
    catch { slug = ''; }
    const c = classifications.get(slug);
    const sc = setupCosts.get(slug);
    const inCohort = r.is_official === 'true' && r.is_popular_top1212 === 'true';
    const siblings = inCohort
      ? (bySource.get(r.source) ?? []).filter((n) => n !== r.name)
      : [];
    return {
      ...r,
      type: c?.type ?? '',
      gradability: c?.gradability ?? '',
      improvement_potential: c?.improvement_potential ?? '',
      author_effort: c?.author_effort ?? '',
      land_probability: c?.land_probability ?? '',
      setup_cost: sc?.setup_cost ?? '',
      setup_cost_reasoning: sc?.setup_cost_reasoning ?? '',
      summary: c?.summary ?? '',
      notable_issues_pipe_joined: Array.isArray(c?.notable_issues) ? c.notable_issues.join(' | ') : '',
      eval_sketch: c?.eval_sketch ?? '',
      repo_siblings_in_cohort: siblings.length,
      repo_siblings_in_cohort_names: siblings.join(' | '),
    };
  });
}

export function applyTopNFilter(rows) {
  return rows.filter((r) => {
    if (r.is_official !== 'true' || r.is_popular_top1212 !== 'true') return false;
    for (const [col, allowed] of Object.entries(FILTER_RULES)) {
      if (!allowed.includes(r[col])) return false;
    }
    return true;
  });
}

export function rankByYield(rows) {
  // Rank by per-skill all-time installs (`installs_raw`). We previously
  // multiplied by `org_total_installs` to weigh org importance, but that
  // over-amplified large orgs (Microsoft 8.2M aggregate dwarfed everyone),
  // pushing genuinely high-install non-Microsoft skills off the top-N.
  return rows.slice().sort((a, b) => {
    const ai = Number(a.installs_raw) || 0;
    const bi = Number(b.installs_raw) || 0;
    return bi - ai;
  });
}

export function applyDiversificationCaps(ranked, { maxPerRepo, maxPerOrg }) {
  const repoCount = new Map();
  const orgCount = new Map();
  const out = [];
  for (const r of ranked) {
    const org = (r.source ?? '').split('/')[0];
    const repo = r.source;
    if ((repoCount.get(repo) ?? 0) >= maxPerRepo) continue;
    if ((orgCount.get(org) ?? 0) >= maxPerOrg) continue;
    out.push(r);
    repoCount.set(repo, (repoCount.get(repo) ?? 0) + 1);
    orgCount.set(org, (orgCount.get(org) ?? 0) + 1);
  }
  return out;
}

function csvField(v) {
  if (v === undefined || v === null) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function emitCsv(headers, rows) {
  const lines = [headers.join(',')];
  for (const r of rows) lines.push(headers.map((h) => csvField(r[h])).join(','));
  return lines.join('\n') + '\n';
}

function loadJsonDir(dir) {
  const out = new Map();
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json') && x !== 'failed.json')) {
    const slug = f.replace(/\.json$/, '');
    try { out.set(slug, JSON.parse(readFileSync(join(dir, f), 'utf-8'))); }
    catch (e) { console.error(`skip ${f}: ${e.message}`); }
  }
  return out;
}

function parsePositiveIntFlag(args, name, dflt) {
  const i = args.indexOf(name);
  if (i < 0 || !args[i + 1]) return dflt;
  const n = Number(args[i + 1]);
  if (!Number.isInteger(n) || n < 1) throw new Error(`${name} requires a positive integer`);
  return n;
}

async function main() {
  const args = process.argv.slice(2);
  const TOP_N = parsePositiveIntFlag(args, '--top', 50);
  const MAX_PER_REPO = parsePositiveIntFlag(args, '--max-per-repo', 2);
  const MAX_PER_ORG = parsePositiveIntFlag(args, '--max-per-org', 5);
  const STRICT_SETUP = args.includes('--strict-setup');

  if (STRICT_SETUP) FILTER_RULES.setup_cost = ['low'];

  const csvText = readFileSync(V2_CSV, 'utf-8');
  const v2 = Papa.parse(csvText, { header: true, skipEmptyLines: true }).data;

  const classifications = loadJsonDir(CLASS_DIR);
  const setupCosts = loadJsonDir(SETUP_COST_DIR);
  console.log(`v2 rows: ${v2.length}, classifications: ${classifications.size}, setup-costs: ${setupCosts.size}`);
  if (setupCosts.size === 0) {
    console.warn('WARNING: 0 setup-cost files found — every row will fail the setup_cost filter and the top-N CSV will be empty. Run _setup-cost.mjs first.');
  }

  const merged = mergeRows(v2, classifications, setupCosts);
  const v2Headers = v2.length > 0 ? Object.keys(v2[0]) : [];
  const v3Headers = [...v2Headers, ...NEW_COLUMNS];
  writeFileSync(V3_CSV, emitCsv(v3Headers, merged), 'utf-8');
  console.log(`wrote v3: ${V3_CSV} (${merged.length} rows)`);

  const filtered = applyTopNFilter(merged);
  const ranked = rankByYield(filtered);
  const diversified = applyDiversificationCaps(ranked, { maxPerRepo: MAX_PER_REPO, maxPerOrg: MAX_PER_ORG });
  const topN = diversified.slice(0, TOP_N);
  writeFileSync(TOP_N_CSV, emitCsv(v3Headers, topN), 'utf-8');
  console.log(`wrote top-${TOP_N}: ${TOP_N_CSV} (filter→${filtered.length}, diversified→${diversified.length}, sliced→${topN.length}; max-per-repo=${MAX_PER_REPO}, max-per-org=${MAX_PER_ORG}, strict-setup=${STRICT_SETUP})`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exit(1); });
}

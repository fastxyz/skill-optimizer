#!/usr/bin/env node
// Stage 3: merge classifications into v3 CSV; produce top-N target list.
//
// Inputs:
//   docs/superpowers/skill-candidates-v2.csv
//   .superpowers/categorization/classification/*.json
// Outputs:
//   docs/superpowers/skill-candidates-v3.csv
//   docs/superpowers/skill-targets-top-N.csv
//
// CLI:
//   node _merge-v3.mjs            # default top-N = 50
//   node _merge-v3.mjs --top 30   # override

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

const NEW_COLUMNS = [
  ...ENUM_COLUMNS,
  'summary',
  'notable_issues_pipe_joined',
  'eval_sketch',
];

const FILTER_RULES = {
  type: ['document', 'tool-use', 'code-patterns'],
  gradability: ['easy', 'medium'],
  improvement_potential: ['medium', 'high'],
  author_effort: ['low', 'medium'],
  land_probability: ['high', 'medium'],
};

export function mergeRows(v2Rows, classifications) {
  return v2Rows.map((r) => {
    // Match by (source, name lowercased + spaces->hyphens).
    const skillId = (r.name ?? '').toLowerCase().replace(/\s+/g, '-');
    let slug;
    try { slug = sourceSlug({ source: r.source ?? '', skillId }); }
    catch { slug = ''; }
    const c = classifications.get(slug);
    if (!c) {
      const blanks = {};
      for (const col of [...ENUM_COLUMNS, ...FREETEXT_COLUMNS, 'notable_issues_pipe_joined']) blanks[col] = '';
      return { ...r, ...blanks };
    }
    return {
      ...r,
      type: c.type ?? '',
      gradability: c.gradability ?? '',
      improvement_potential: c.improvement_potential ?? '',
      author_effort: c.author_effort ?? '',
      land_probability: c.land_probability ?? '',
      summary: c.summary ?? '',
      notable_issues_pipe_joined: Array.isArray(c.notable_issues) ? c.notable_issues.join(' | ') : '',
      eval_sketch: c.eval_sketch ?? '',
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

async function main() {
  const args = process.argv.slice(2);
  const topNArgIdx = args.indexOf('--top');
  let TOP_N = 50;
  if (topNArgIdx >= 0 && args[topNArgIdx + 1]) {
    const n = Number(args[topNArgIdx + 1]);
    if (!Number.isInteger(n) || n < 1) throw new Error('--top requires a positive integer');
    TOP_N = n;
  }

  const csvText = readFileSync(V2_CSV, 'utf-8');
  const v2 = Papa.parse(csvText, { header: true, skipEmptyLines: true }).data;

  // Build classifications map keyed by slug.
  const classifications = new Map();
  if (existsSync(CLASS_DIR)) {
    for (const f of readdirSync(CLASS_DIR).filter((x) => x.endsWith('.json'))) {
      const slug = f.replace(/\.json$/, '');
      try { classifications.set(slug, JSON.parse(readFileSync(join(CLASS_DIR, f), 'utf-8'))); }
      catch (e) { console.error(`skip ${f}: ${e.message}`); }
    }
  }
  console.log(`v2 rows: ${v2.length}, classifications loaded: ${classifications.size}`);

  const merged = mergeRows(v2, classifications);
  const v2Headers = v2.length > 0 ? Object.keys(v2[0]) : [];
  const v3Headers = [...v2Headers, ...NEW_COLUMNS];
  writeFileSync(V3_CSV, emitCsv(v3Headers, merged), 'utf-8');
  console.log(`wrote v3: ${V3_CSV} (${merged.length} rows)`);

  const filtered = applyTopNFilter(merged);
  const ranked = rankByYield(filtered).slice(0, TOP_N);
  writeFileSync(TOP_N_CSV, emitCsv(v3Headers, ranked), 'utf-8');
  console.log(`wrote top-${TOP_N}: ${TOP_N_CSV} (${ranked.length} rows after filter)`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exit(1); });
}

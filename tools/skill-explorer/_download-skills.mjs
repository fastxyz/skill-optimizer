#!/usr/bin/env node
// Stage 1: download SKILL.md for each gold-cohort skill.
//
// Inputs:
//   docs/superpowers/skill-candidates-v2.csv   (filter is_official=true AND is_popular_top1212=true)
// Outputs:
//   .superpowers/categorization/skill-md/<slug>.md
//   .superpowers/categorization/skipped.json
//
// CLI:
//   node _download-skills.mjs            # all gold-cohort skills
//   node _download-skills.mjs --limit 5  # smoke test, only first 5
//   node _download-skills.mjs --force    # ignore cached files

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';
import Papa from 'papaparse';
import { sourceSlug } from './lib/slug.mjs';
import { findSkillMdPath } from './lib/repo-paths.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../..');
const V2_CSV = join(REPO_ROOT, 'docs/superpowers/skill-candidates-v2.csv');
const STATE_DIR = join(REPO_ROOT, '.superpowers/categorization');
const SKILL_MD_DIR = join(STATE_DIR, 'skill-md');
const SKIPPED_PATH = join(STATE_DIR, 'skipped.json');
const CONCURRENCY = 8;

const args = process.argv.slice(2);
const LIMIT = parseLimit(args);
const FORCE = args.includes('--force');

mkdirSync(SKILL_MD_DIR, { recursive: true });

function parseLimit(args) {
  const i = args.indexOf('--limit');
  if (i < 0 || !args[i + 1]) return Infinity;
  const n = Number(args[i + 1]);
  if (!Number.isFinite(n) || n < 1) throw new Error('--limit requires a positive integer');
  return n;
}

function ghApi(path) {
  return new Promise((resolve, reject) => {
    const child = spawn('gh', ['api', path], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', (c) => stdout += c);
    child.stderr.on('data', (c) => stderr += c);
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`gh api ${path}: exit ${code}: ${stderr.trim()}`));
      try { resolve(JSON.parse(stdout)); }
      catch (e) { reject(new Error(`gh api ${path}: invalid JSON: ${e.message}`)); }
    });
  });
}

function rawFetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => resolve(body));
    }).on('error', reject);
  });
}

async function withConcurrency(items, n, worker) {
  const results = new Array(items.length);
  let next = 0, done = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (next < items.length) {
      const i = next++;
      try { results[i] = await worker(items[i], i); }
      catch (e) { results[i] = { _error: e.message }; }
      done++;
      if (done % 25 === 0 || done === items.length) {
        process.stderr.write(`\r  ${done}/${items.length}`);
      }
    }
  }));
  process.stderr.write('\n');
  return results;
}

async function getRepoTree(source) {
  // Discover default branch first.
  const repo = await ghApi(`repos/${source}`);
  const branch = repo.default_branch ?? 'main';
  const tree = await ghApi(`repos/${source}/git/trees/${branch}?recursive=1`);
  return { branch, tree };
}

async function main() {
  // Fall back to skill-candidates.csv if v2 doesn't exist yet.
  const csvPath = existsSync(V2_CSV)
    ? V2_CSV
    : join(REPO_ROOT, 'docs/superpowers/skill-candidates.csv');
  const csvText = readFileSync(csvPath, 'utf-8');
  const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
  const rows = parsed.data.filter(
    (r) => r.is_official === 'true' && r.is_popular_top1212 === 'true',
  );
  const cohort = LIMIT === Infinity ? rows : rows.slice(0, LIMIT);
  console.log(`gold-cohort rows: ${rows.length}, fetching: ${cohort.length}`);

  // Group by source so we fetch each repo's tree only once.
  const bySource = new Map();
  for (const r of cohort) {
    const skillId = r.name.toLowerCase().replace(/\s+/g, '-');
    const slug = sourceSlug({ source: r.source, skillId });
    if (!bySource.has(r.source)) bySource.set(r.source, []);
    bySource.get(r.source).push({ source: r.source, name: r.name, skillId, slug });
  }
  console.log(`unique source repos: ${bySource.size}`);

  const skipped = [];
  let downloaded = 0, cached = 0;

  // Phase 1: fetch trees per source (sequential — gh has its own rate limit).
  console.log(`fetching trees...`);
  const trees = new Map();
  let treeIdx = 0;
  for (const source of bySource.keys()) {
    treeIdx++;
    if (treeIdx % 10 === 0) process.stderr.write(`\r  trees ${treeIdx}/${bySource.size}`);
    try {
      trees.set(source, await getRepoTree(source));
    } catch (e) {
      for (const skill of bySource.get(source)) skipped.push({ ...skill, reason: `tree fetch: ${e.message}` });
    }
  }
  process.stderr.write('\n');

  // Phase 2: fetch raw SKILL.md per skill (concurrency=8).
  const allSkills = [];
  for (const skills of bySource.values()) for (const s of skills) allSkills.push(s);

  console.log(`fetching SKILL.md...`);
  await withConcurrency(allSkills, CONCURRENCY, async (skill) => {
    const outPath = join(SKILL_MD_DIR, `${skill.slug}.md`);
    if (!FORCE && existsSync(outPath)) { cached++; return; }

    const treeData = trees.get(skill.source);
    if (!treeData) return; // already pushed to skipped during phase 1

    const path = findSkillMdPath(treeData.tree, skill.skillId);
    if (!path) {
      skipped.push({ ...skill, reason: `no SKILL.md found in tree for skillId="${skill.skillId}"` });
      return;
    }
    const url = `https://raw.githubusercontent.com/${skill.source}/${treeData.branch}/${path}`;
    try {
      const content = await rawFetch(url);
      writeFileSync(outPath, content, 'utf-8');
      downloaded++;
    } catch (e) {
      skipped.push({ ...skill, reason: `raw fetch failed: ${e.message}` });
    }
  });

  writeFileSync(SKIPPED_PATH, JSON.stringify(skipped, null, 2), 'utf-8');
  console.log(`downloaded: ${downloaded}, cached: ${cached}, skipped: ${skipped.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

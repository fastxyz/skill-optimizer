#!/usr/bin/env node
// Stage 2.5: focused setup-cost classification per skill.
//
// Inputs:
//   .superpowers/categorization/skill-md/<slug>.md
// Outputs:
//   .superpowers/categorization/setup-cost/<slug>.json
//   .superpowers/categorization/setup-cost-progress.log
//   .superpowers/categorization/setup-cost/failed.json
//
// CLI:
//   node _setup-cost.mjs                  # all uncached
//   node _setup-cost.mjs --limit 5        # smoke test
//   node _setup-cost.mjs --concurrency 4  # override default 6
//   node _setup-cost.mjs --force          # re-classify everything

import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSlug } from './lib/slug.mjs';
import { SETUP_COST_SCHEMA, buildSetupCostPrompt } from './lib/categorization-schema.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../..');
const STATE_DIR = join(REPO_ROOT, '.superpowers/categorization');
const SKILL_MD_DIR = join(STATE_DIR, 'skill-md');
const OUT_DIR = join(STATE_DIR, 'setup-cost');
const PROGRESS_LOG = join(STATE_DIR, 'setup-cost-progress.log');
const FAILED_PATH = join(OUT_DIR, 'failed.json');
const MAX_RETRIES = 3;

const args = process.argv.slice(2);
const LIMIT = parseLimit(args);
const FORCE = args.includes('--force');
const CONCURRENCY = parseConcurrency(args);

mkdirSync(OUT_DIR, { recursive: true });

function parseLimit(args) {
  const i = args.indexOf('--limit');
  if (i < 0 || !args[i + 1]) return Infinity;
  const n = Number(args[i + 1]);
  if (!Number.isInteger(n) || n < 1) throw new Error('--limit requires a positive integer');
  return n;
}
function parseConcurrency(args) {
  const i = args.indexOf('--concurrency');
  if (i < 0 || !args[i + 1]) return 6;
  const n = Number(args[i + 1]);
  if (!Number.isInteger(n) || n < 1) throw new Error('--concurrency requires a positive integer');
  return n;
}

function logProgress(line) {
  appendFileSync(PROGRESS_LOG, `${new Date().toISOString()} ${line}\n`, 'utf-8');
}

function callClaude(prompt) {
  return new Promise((resolve, reject) => {
    const args = [
      '-p', prompt,
      '--model', 'sonnet',
      '--output-format', 'json',
      '--json-schema', JSON.stringify(SETUP_COST_SCHEMA),
      '--no-session-persistence',
      '--disable-slash-commands',
      '--effort', 'low',
      '--max-budget-usd', '0.10',
    ];
    const childEnv = { ...process.env };
    delete childEnv.CLAUDECODE;
    const child = spawn('claude', args, { stdio: ['ignore', 'pipe', 'pipe'], env: childEnv });
    let stdout = '', stderr = '';
    child.stdout.on('data', (c) => stdout += c);
    child.stderr.on('data', (c) => stderr += c);
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`claude exit ${code}: ${stderr.trim().slice(0, 400)}`));
      let outer;
      try { outer = JSON.parse(stdout); }
      catch (e) { return reject(new Error(`outer JSON parse: ${e.message}`)); }
      if (outer.subtype === 'error_max_budget_usd') {
        return reject(new Error(`budget exceeded: cost=${outer.total_cost_usd}`));
      }
      if (outer.is_error) {
        return reject(new Error(`claude error: ${outer.subtype ?? 'unknown'}`));
      }
      if (outer.structured_output != null) {
        return resolve(outer.structured_output);
      }
      const resultStr = outer.result;
      if (typeof resultStr === 'string' && resultStr.length > 0) {
        try { return resolve(JSON.parse(resultStr)); }
        catch { return resolve(resultStr); }
      }
      return reject(new Error(`no structured_output or result in claude response (subtype=${outer.subtype})`));
    });
  });
}

async function classifyOne(slug) {
  const mdPath = join(SKILL_MD_DIR, `${slug}.md`);
  const outPath = join(OUT_DIR, `${slug}.json`);
  if (!FORCE && existsSync(outPath)) return { slug, status: 'cached' };

  const parsed = parseSlug(slug);
  if (!parsed) return { slug, status: 'error', error: 'invalid slug' };

  const content = readFileSync(mdPath, 'utf-8');
  const prompt = buildSetupCostPrompt({ source: parsed.source, name: parsed.skillId }, content);

  let lastErr = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await callClaude(prompt);
      writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf-8');
      return { slug, status: 'ok' };
    } catch (e) { lastErr = e; }
  }
  return { slug, status: 'error', error: lastErr?.message ?? 'unknown' };
}

async function withConcurrency(items, n, worker) {
  const results = [];
  let next = 0, done = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (next < items.length) {
      const i = next++;
      const r = await worker(items[i]);
      results.push(r);
      done++;
      logProgress(`${r.status} ${r.slug}${r.error ? ` :: ${r.error}` : ''}`);
      if (done % 10 === 0 || done === items.length) {
        process.stderr.write(`\r  ${done}/${items.length}`);
      }
    }
  }));
  process.stderr.write('\n');
  return results;
}

async function main() {
  const slugs = readdirSync(SKILL_MD_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.replace(/\.md$/, ''));
  const queue = LIMIT === Infinity ? slugs : slugs.slice(0, LIMIT);
  console.log(`SKILL.md files: ${slugs.length}, processing: ${queue.length}, concurrency: ${CONCURRENCY}`);

  const t0 = Date.now();
  const results = await withConcurrency(queue, CONCURRENCY, classifyOne);
  const dt = ((Date.now() - t0) / 1000).toFixed(1);

  const counts = { ok: 0, cached: 0, error: 0 };
  const failed = [];
  for (const r of results) {
    counts[r.status]++;
    if (r.status === 'error') failed.push(r);
  }
  writeFileSync(FAILED_PATH, JSON.stringify(failed, null, 2), 'utf-8');
  console.log(`done in ${dt}s — ok=${counts.ok}, cached=${counts.cached}, error=${counts.error}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

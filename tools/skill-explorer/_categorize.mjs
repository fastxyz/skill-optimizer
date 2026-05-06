#!/usr/bin/env node
// Stage 2: categorize each downloaded SKILL.md via `claude -p`.
//
// Inputs:
//   .superpowers/categorization/skill-md/<slug>.md
// Outputs:
//   .superpowers/categorization/classification/<slug>.json
//   .superpowers/categorization/progress.log
//   .superpowers/categorization/failed.json
//
// CLI:
//   node _categorize.mjs                          # all uncached skills
//   node _categorize.mjs --limit 5                # smoke test
//   node _categorize.mjs --concurrency 4          # override default 6
//   node _categorize.mjs --force                  # re-classify everything
//   node _categorize.mjs --max-budget-usd 0.30    # bump per-call cost cap (default 0.20)
//   node _categorize.mjs --per-call-timeout-ms 90000  # wall-clock timeout per claude call (default 120000)

import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSlug } from './lib/slug.mjs';
import { SCHEMA, buildPrompt } from './lib/categorization-schema.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../..');
const STATE_DIR = join(REPO_ROOT, '.superpowers/categorization');
const SKILL_MD_DIR = join(STATE_DIR, 'skill-md');
const CLASS_DIR = join(STATE_DIR, 'classification');
const PROGRESS_LOG = join(STATE_DIR, 'progress.log');
const FAILED_PATH = join(STATE_DIR, 'failed.json');
const MAX_RETRIES = 3;

const args = process.argv.slice(2);
const LIMIT = parseLimit(args);
const FORCE = args.includes('--force');
const CONCURRENCY = parseConcurrency(args);
const MAX_BUDGET_USD = parseMaxBudgetUsd(args);
const PER_CALL_TIMEOUT_MS = parsePerCallTimeoutMs(args);

mkdirSync(CLASS_DIR, { recursive: true });

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
function parseMaxBudgetUsd(args) {
  const i = args.indexOf('--max-budget-usd');
  if (i < 0 || !args[i + 1]) return 0.20;
  const n = Number(args[i + 1]);
  if (!Number.isFinite(n) || n <= 0) throw new Error('--max-budget-usd requires a positive number');
  return n;
}
function parsePerCallTimeoutMs(args) {
  const i = args.indexOf('--per-call-timeout-ms');
  if (i < 0 || !args[i + 1]) return 120_000;
  const n = Number(args[i + 1]);
  if (!Number.isInteger(n) || n < 1000) throw new Error('--per-call-timeout-ms requires an integer >= 1000');
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
      '--json-schema', JSON.stringify(SCHEMA),
      '--no-session-persistence',
      '--disable-slash-commands',
      '--effort', 'low',
      '--max-budget-usd', String(MAX_BUDGET_USD),
    ];
    // Unset CLAUDECODE so the child process is not blocked by the nested-session guard.
    const childEnv = { ...process.env };
    delete childEnv.CLAUDECODE;
    const child = spawn('claude', args, { stdio: ['ignore', 'pipe', 'pipe'], env: childEnv });
    let stdout = '', stderr = '', timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 5000).unref();
    }, PER_CALL_TIMEOUT_MS);
    child.stdout.on('data', (c) => stdout += c);
    child.stderr.on('data', (c) => stderr += c);
    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) return reject(new Error(`claude timeout after ${PER_CALL_TIMEOUT_MS}ms`));
      if (code !== 0) return reject(new Error(`claude exit ${code}: ${stderr.trim().slice(0, 400)}`));
      // claude --output-format json wraps the response in a metadata envelope.
      // Extract the actual schema-validated payload from `result` (or fall back to the whole stdout).
      let outer;
      try { outer = JSON.parse(stdout); }
      catch (e) { return reject(new Error(`outer JSON parse: ${e.message}`)); }
      // Detect budget-exceeded or other error subtypes even when exit code is 0.
      if (outer.subtype === 'error_max_budget_usd') {
        return reject(new Error(`budget exceeded: cost=${outer.total_cost_usd}`));
      }
      if (outer.is_error) {
        return reject(new Error(`claude error: ${outer.subtype ?? 'unknown'}`));
      }
      // When --json-schema is used, the validated payload lands in `structured_output`.
      // Fall back to `result` (non-empty string) for plain-text mode. Reject if missing.
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

async function categorizeOne(slug) {
  const mdPath = join(SKILL_MD_DIR, `${slug}.md`);
  const outPath = join(CLASS_DIR, `${slug}.json`);
  if (!FORCE && existsSync(outPath)) return { slug, status: 'cached' };

  const parsed = parseSlug(slug);
  if (!parsed) return { slug, status: 'error', error: 'invalid slug' };

  const content = readFileSync(mdPath, 'utf-8');
  const prompt = buildPrompt({ source: parsed.source, name: parsed.skillId }, content);

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
  const results = await withConcurrency(queue, CONCURRENCY, categorizeOne);
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

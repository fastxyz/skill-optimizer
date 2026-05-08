#!/usr/bin/env node
// Auto-improve-skill wrapper.
//
// Operator usage (from this Claude Code session via Bash):
//   node tools/auto-improve-skill.mjs <owner>/<repo>/<skill-id> [--force]
//
// Spawns `claude -p` with the templated prompt; the inner agent does the
// 5-phase work (vendor → build suite → baseline → iterate → package) and
// writes results under examples/workbench/<skill-id>/.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, createWriteStream } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const PROMPT_PATH = join(HERE, 'auto-improve-skill-prompt.md');
const PER_CALL_TIMEOUT_MS = 90 * 60 * 1000; // 90 min hard wall-clock cap

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const slug = args.find((a) => !a.startsWith('--'));
if (!slug) {
  console.error('usage: auto-improve-skill.mjs <owner>/<repo>/<skill-id> [--force]');
  process.exit(2);
}
const parts = slug.split('/');
if (parts.length !== 3) {
  console.error(`bad slug: "${slug}" — expected <owner>/<repo>/<skill-id>`);
  process.exit(2);
}
const [, , skillId] = parts;
const caseDir = join(REPO_ROOT, 'examples/workbench', skillId);

if (existsSync(caseDir) && !FORCE) {
  console.error(`refusing: ${caseDir} already exists. Pass --force to overwrite.`);
  process.exit(2);
}
mkdirSync(caseDir, { recursive: true });

const promptTemplate = readFileSync(PROMPT_PATH, 'utf-8');
const prompt = promptTemplate.replace(/\$\{SLUG\}/g, slug).replace(/\$\{SKILL_ID\}/g, skillId);

const logPath = join(caseDir, '.run.log');
const logStream = createWriteStream(logPath, { flags: 'a' });
console.log(`spawning claude -p for ${slug} → ${caseDir} (log: ${logPath})`);

const claudeArgs = [
  '-p', prompt,
  '--model', 'sonnet',
  '--no-session-persistence',
  '--disable-slash-commands',
  '--dangerously-skip-permissions',
  '--max-budget-usd', '3.50',
];
const childEnv = { ...process.env };
delete childEnv.CLAUDECODE;

const child = spawn('claude', claudeArgs, {
  cwd: REPO_ROOT,
  env: childEnv,
  stdio: ['ignore', 'pipe', 'pipe'],
});

let timedOut = false;
const timer = setTimeout(() => {
  timedOut = true;
  child.kill('SIGTERM');
  setTimeout(() => child.kill('SIGKILL'), 5000).unref();
}, PER_CALL_TIMEOUT_MS);

child.stdout.on('data', (chunk) => { process.stdout.write(chunk); logStream.write(chunk); });
child.stderr.on('data', (chunk) => { process.stderr.write(chunk); logStream.write(chunk); });
child.on('close', (code) => {
  clearTimeout(timer);
  logStream.end();
  if (timedOut) {
    console.error(`\n[wrapper] claude -p exceeded ${PER_CALL_TIMEOUT_MS / 60000}-min timeout`);
    process.exit(124);
  }
  const analysisPath = join(caseDir, 'analysis.md');
  if (existsSync(analysisPath)) {
    console.log(`\n[wrapper] analysis.md: ${analysisPath}`);
  } else {
    console.error(`\n[wrapper] no analysis.md was written; check ${logPath}`);
  }
  process.exit(code ?? 1);
});

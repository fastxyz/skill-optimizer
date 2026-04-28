import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { runCheckCommand } from '../src/workbench/check-runner.js';
import { loadWorkbenchSuite } from '../src/workbench/suite-loader.js';

const reactFixtureDir = join(process.cwd(), '.skill-eval', 'vercel-react-best-practices');
const firecrawlFixtureDir = join(process.cwd(), '.skill-eval', 'firecrawl-cli');

test('react fixture keeps inline cases and shared support at suite root', () => {
  const suite = loadWorkbenchSuite(join(reactFixtureDir, 'suite.yml'));

  assert.equal(suite.name, 'vercel-react-best-practices');
  assert.ok(suite.cases.some((entry) => entry.slug === 'bundle-dynamic-imports'));
  assert.ok(existsSync(join(reactFixtureDir, 'suite.yml')));
  assert.ok(existsSync(join(reactFixtureDir, 'references', 'SKILL.md')));
  assert.ok(existsSync(join(reactFixtureDir, 'checks', 'react.mjs')));
  assert.ok(existsSync(join(reactFixtureDir, 'workspace', 'app', 'code-panel.tsx')));
  assert.equal(existsSync(join(reactFixtureDir, 'cases')), false);
});

test('firecrawl fixture keeps inline cases and shared fixture CLI at suite root', () => {
  const suite = loadWorkbenchSuite(join(firecrawlFixtureDir, 'suite.yml'));

  assert.equal(suite.name, 'firecrawl-cli');
  assert.ok(suite.cases.some((entry) => entry.slug === 'search-with-scrape'));
  assert.ok(existsSync(join(firecrawlFixtureDir, 'references', 'firecrawl-cli', 'SKILL.md')));
  assert.ok(existsSync(join(firecrawlFixtureDir, 'checks', 'firecrawl.mjs')));
  assert.ok(existsSync(join(firecrawlFixtureDir, 'bin', 'firecrawl')));
  assert.ok(existsSync(join(firecrawlFixtureDir, 'workspace', 'docs', 'report.pdf')));
  assert.equal(existsSync(join(firecrawlFixtureDir, 'cases')), false);
});

test('react dynamic-import checker rejects leftover static Monaco imports', async () => {
  const root = mkdtempSync(join(tmpdir(), 'skill-opt-react-check-'));
  try {
    const workDir = join(root, 'work');
    mkdirSync(join(workDir, 'app'), { recursive: true });
    writeFileSync(join(workDir, 'app', 'code-panel.tsx'), [
      "import dynamic from 'next/dynamic';",
      "import Editor from './monaco-editor';",
      '',
      "const MonacoEditor = dynamic(() => import('./monaco-editor').then((m) => m.MonacoEditor), { ssr: false });",
      '',
      'export function CodePanel({ code }: { code: string }) {',
      '  return <Editor value={code} />;',
      '}',
      '',
    ].join('\n'), 'utf-8');

    const grade = await runCheckCommand(
      `node "${join(reactFixtureDir, 'checks', 'react.mjs')}" bundle-dynamic-imports`,
      { cwd: workDir, env: { ...process.env, WORK: workDir } },
    );

    assert.equal(grade.pass, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('react async checker rejects sequential dashboard fetches and accepts Promise.all', async () => {
  const root = mkdtempSync(join(tmpdir(), 'skill-opt-react-async-check-'));
  try {
    const workDir = join(root, 'work');
    mkdirSync(join(workDir, 'src'), { recursive: true });
    const filePath = join(workDir, 'src', 'loadDashboard.ts');

    writeFileSync(filePath, [
      'export async function loadDashboard() {',
      "  const user = await fetch('/api/user');",
      "  const projects = await fetch('/api/projects');",
      "  const alerts = await fetch('/api/alerts');",
      '  return { user, projects, alerts };',
      '}',
      '',
    ].join('\n'), 'utf-8');

    const sequential = await runCheckCommand(
      `node "${join(reactFixtureDir, 'checks', 'react.mjs')}" async-parallel`,
      { cwd: workDir, env: { ...process.env, WORK: workDir } },
    );
    assert.equal(sequential.pass, false);

    writeFileSync(filePath, [
      'export async function loadDashboard() {',
      '  const [user, projects, alerts] = await Promise.all([',
      "    fetch('/api/user'),",
      "    fetch('/api/projects'),",
      "    fetch('/api/alerts'),",
      '  ]);',
      '  return { user, projects, alerts };',
      '}',
      '',
    ].join('\n'), 'utf-8');

    const parallel = await runCheckCommand(
      `node "${join(reactFixtureDir, 'checks', 'react.mjs')}" async-parallel`,
      { cwd: workDir, env: { ...process.env, WORK: workDir } },
    );
    assert.equal(parallel.pass, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('react derived-state checker rejects effect state and accepts derived render value', async () => {
  const root = mkdtempSync(join(tmpdir(), 'skill-opt-react-derived-check-'));
  try {
    const workDir = join(root, 'work');
    mkdirSync(join(workDir, 'src'), { recursive: true });
    const filePath = join(workDir, 'src', 'ProfileForm.tsx');

    writeFileSync(filePath, [
      "import { useEffect, useState } from 'react';",
      '',
      'export function ProfileForm({ firstName, lastName }: { firstName: string; lastName: string }) {',
      "  const [fullName, setFullName] = useState('');",
      '  useEffect(() => setFullName(`${firstName} ${lastName}`), [firstName, lastName]);',
      '  return <div>{fullName}</div>;',
      '}',
      '',
    ].join('\n'), 'utf-8');

    const stateful = await runCheckCommand(
      `node "${join(reactFixtureDir, 'checks', 'react.mjs')}" rerender-derived-state`,
      { cwd: workDir, env: { ...process.env, WORK: workDir } },
    );
    assert.equal(stateful.pass, false);

    writeFileSync(filePath, [
      'export function ProfileForm({ firstName, lastName }: { firstName: string; lastName: string }) {',
      '  const fullName = `${firstName} ${lastName}`;',
      '  return <div>{fullName}</div>;',
      '}',
      '',
    ].join('\n'), 'utf-8');

    const derived = await runCheckCommand(
      `node "${join(reactFixtureDir, 'checks', 'react.mjs')}" rerender-derived-state`,
      { cwd: workDir, env: { ...process.env, WORK: workDir } },
    );
    assert.equal(derived.pass, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('firecrawl checker accepts search with scraped results and no redundant scrape', async () => {
  const root = mkdtempSync(join(tmpdir(), 'skill-opt-firecrawl-check-'));
  try {
    const workDir = join(root, 'work');
    mkdirSync(workDir, { recursive: true });
    writeFileSync(join(workDir, 'firecrawl-calls.ndjson'), `${JSON.stringify({
      args: ['search', 'browser automation', '--scrape', '--limit', '3', '--json', '-o', '.firecrawl/search-browser-automation.json'],
    })}\n`, 'utf-8');

    const grade = await runCheckCommand(
      `node "${join(firecrawlFixtureDir, 'checks', 'firecrawl.mjs')}" search-with-scrape`,
      { cwd: workDir, env: { ...process.env, WORK: workDir } },
    );

    assert.equal(grade.pass, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

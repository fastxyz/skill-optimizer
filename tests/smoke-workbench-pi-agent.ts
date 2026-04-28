import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { createWorkbenchPiResourceLoader, createWorkbenchPiSession, createWorkbenchPiTools, stripSensitiveEnv } from '../src/workbench/pi-agent.js';

test('createWorkbenchPiTools enables coding plus repo-scale search tools', () => {
  const tools = createWorkbenchPiTools('/work');
  const names = tools.map((tool) => tool.name).sort();

  assert.deepEqual(names, ['bash', 'edit', 'find', 'grep', 'ls', 'read', 'write']);
});

test('stripSensitiveEnv removes model and service credentials from tool subprocesses', () => {
  const env = stripSensitiveEnv({
    OPENROUTER_API_KEY: 'secret',
    OPENAI_API_KEY: 'secret',
    MODEL_AUTH_FILE: '/run/secrets/model-auth.json',
    WHATSAPP_ACCESS_TOKEN: 'secret',
    DASHBOARD_TOKEN_SECRET: 'secret',
    PATH: '/usr/bin',
    WORK: '/work',
  });

  assert.equal(env.OPENROUTER_API_KEY, undefined);
  assert.equal(env.OPENAI_API_KEY, undefined);
  assert.equal(env.MODEL_AUTH_FILE, undefined);
  assert.equal(env.WHATSAPP_ACCESS_TOKEN, undefined);
  assert.equal(env.DASHBOARD_TOKEN_SECRET, undefined);
  assert.equal(env.PATH, '/usr/bin');
  assert.equal(env.WORK, '/work');
});

test('createWorkbenchPiResourceLoader discovers a root SKILL.md from references', async () => {
  const root = mkdtempSync(join(tmpdir(), 'skill-opt-workbench-skill-'));
  try {
    writeFileSync(root + '/SKILL.md', [
      '---',
      'name: pdf',
      'description: PDF merge instructions',
      '---',
      '',
      '# PDF Skill',
    ].join('\n'), 'utf-8');
    mkdirSync(join(root, 'inputs'));

    const loader = await createWorkbenchPiResourceLoader({ cwd: root });
    const loaded = loader.getSkills().skills.map((skill) => skill.name);

    assert.ok(loaded.includes('pdf'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('createWorkbenchPiResourceLoader appends suite prompt after workbench prompt', async () => {
  const root = mkdtempSync(join(tmpdir(), 'skill-opt-workbench-append-prompt-'));
  try {
    const loader = await createWorkbenchPiResourceLoader({
      cwd: root,
      appendSystemPrompt: 'Prefer simple shell commands when possible.',
    });

    const appended = loader.getAppendSystemPrompt().join('\n\n');
    assert.match(appended, /Operating environment:/);
    assert.match(appended, /Prefer simple shell commands when possible\./);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('createWorkbenchPiResourceLoader relies on additional /work skills without post-filter override', () => {
  const source = readFileSync('src/workbench/pi-agent.ts', 'utf-8');

  assert.match(source, /noSkills: true/);
  assert.doesNotMatch(source, /skillsOverride/);
});

test('createWorkbenchPiSession rejects non-OpenRouter model refs', async () => {
  const root = mkdtempSync(join(tmpdir(), 'skill-opt-workbench-openrouter-only-'));
  try {
    await assert.rejects(
      () => createWorkbenchPiSession({ cwd: root, modelRef: 'direct/model' }),
      /only supports OpenRouter/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

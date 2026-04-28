import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { createWorkbenchPiResourceLoader, createWorkbenchPiSession, createWorkbenchPiTools } from '../src/workbench/pi-agent.js';

test('createWorkbenchPiTools enables coding plus repo-scale search tools', () => {
  const tools = createWorkbenchPiTools('/work');
  const names = tools.map((tool) => tool.name).sort();

  assert.deepEqual(names, ['bash', 'edit', 'find', 'grep', 'ls', 'read', 'write']);
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

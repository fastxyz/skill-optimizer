import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';

const root = process.cwd();

function readJson(relativePath: string): any {
  return JSON.parse(readFileSync(join(root, relativePath), 'utf-8'));
}

function readText(relativePath: string): string {
  return readFileSync(join(root, relativePath), 'utf-8');
}

test('canonical skill follows the portable agent skills contract', () => {
  const skillPath = 'skills/skill-optimizer/SKILL.md';
  assert.equal(existsSync(join(root, skillPath)), true);

  const body = readText(skillPath);
  assert.match(body, /^---\n[\s\S]*?\n---\n/);
  assert.match(body, /^name: skill-optimizer$/m);
  assert.match(body, /^description: .+/m);
  assert.doesNotMatch(body, /^description: .{1025,}$/m);
});

test('package metadata exposes plugin and skill distribution files', () => {
  const pkg = readJson('package.json');

  assert.equal(pkg.name, 'skill-optimizer');
  assert.equal(pkg.exports['./server'].import, './.opencode/plugins/skill-optimizer.js');
  assert.ok(pkg.files.includes('skills/'));
  assert.ok(pkg.files.includes('.claude-plugin/'));
  assert.ok(pkg.files.includes('.codex-plugin/'));
  assert.ok(pkg.files.includes('.cursor-plugin/'));
  assert.ok(pkg.files.includes('.opencode/plugins/skill-optimizer.js'));
  assert.ok(pkg.files.includes('.opencode/INSTALL.md'));
  assert.ok(pkg.files.includes('.codex/INSTALL.md'));
  assert.ok(pkg.files.includes('.cursor/INSTALL.md'));
  assert.ok(pkg.files.includes('docs/README.codex.md'));
  assert.ok(pkg.files.includes('docs/README.opencode.md'));
  assert.ok(pkg.files.includes('gemini-extension.json'));
  assert.ok(pkg.files.includes('GEMINI.md'));
});

test('package metadata does not include broad example result directories', () => {
  const pkg = readJson('package.json');

  assert.equal(pkg.files.includes('examples/'), false);
  assert.ok(pkg.files.includes('examples/workbench/README.md'));
  assert.ok(pkg.files.includes('examples/workbench/pdf/README.md'));
  assert.ok(pkg.files.includes('examples/workbench/pdf/suite.yml'));
  assert.ok(pkg.files.includes('examples/workbench/pdf/checks/'));
  assert.ok(pkg.files.includes('examples/workbench/pdf/references/'));
  assert.ok(pkg.files.includes('examples/workbench/pdf/solutions/'));
});

test('Claude plugin and marketplace metadata point at the canonical skill', () => {
  const pkg = readJson('package.json');
  const plugin = readJson('.claude-plugin/plugin.json');
  const marketplace = readJson('.claude-plugin/marketplace.json');

  assert.equal(plugin.name, 'skill-optimizer');
  assert.equal(plugin.version, pkg.version);
  assert.equal(plugin.skills, './skills/');

  assert.equal(marketplace.name, 'skill-optimizer');
  assert.equal(marketplace.plugins.length, 1);
  assert.equal(marketplace.plugins[0].name, 'skill-optimizer');
  assert.equal(marketplace.plugins[0].source, './');
  assert.deepEqual(marketplace.plugins[0].skills, ['./skills/skill-optimizer']);
});

test('Codex and Cursor plugin metadata point at the canonical skill', () => {
  const pkg = readJson('package.json');
  const codex = readJson('.codex-plugin/plugin.json');
  const cursor = readJson('.cursor-plugin/plugin.json');

  for (const manifest of [codex, cursor]) {
    assert.equal(manifest.name, 'skill-optimizer');
    assert.equal(manifest.version, pkg.version);
    assert.equal(manifest.skills, './skills/');
    assert.equal(manifest.interface.displayName, 'skill-optimizer');
    assert.ok(manifest.interface.defaultPrompt.length > 0);
  }
});

test('OpenCode plugin registers the canonical skills directory', async () => {
  const pluginUrl = pathToFileURL(join(root, '.opencode', 'plugins', 'skill-optimizer.js')).href;
  const mod = await import(`${pluginUrl}?cacheBust=${Date.now()}`);
  const server = mod.default?.server ?? mod.SkillOptimizerPlugin;
  assert.equal(typeof server, 'function');

  const hooks = await server({});
  const config: any = {};
  await hooks.config(config);

  assert.deepEqual(config.skills.paths, [join(root, 'skills')]);
});

test('Gemini extension metadata points at the canonical context file', () => {
  const pkg = readJson('package.json');
  const extension = readJson('gemini-extension.json');
  const geminiInstructions = readText('GEMINI.md');

  assert.equal(extension.name, 'skill-optimizer');
  assert.equal(extension.version, pkg.version);
  assert.equal(extension.contextFileName, 'GEMINI.md');
  assert.match(geminiInstructions, /^@\.\/skills\/skill-optimizer\/SKILL\.md$/m);
});
